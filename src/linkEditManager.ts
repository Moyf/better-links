import { MarkdownView, Notice } from "obsidian";
import type { EditorPosition } from "obsidian";
import type { VirtualElement } from "@popperjs/core";
import { EditorView } from "@codemirror/view";
import type BetterLinksPlugin from "./main";
import { copyMarkdown, copyUrl, buildDeletionText, normalizeEditableValues, openLink, shouldUseWikiLinkFormat } from "./linkActions";
import { isLikelyExternalDestination, isLikelyInternalDestination, serializeEditedLink, findLinkAtOffset, withEditorRange, type EditorLinkMatch } from "./linkDetector";
import { PopoverEditor } from "./popoverEditor";
import { LinkDestinationSuggest } from "./linkSuggest";

interface ActiveSession {
	match: EditorLinkMatch;
	/** 关闭浮窗时编辑器光标应该落在哪里。
	 *  - 编辑现有链接：默认放到链接末尾（match.range.to），方便继续编辑
	 *  - 新建链接：插入成功后放到新文本末尾；丢弃时回到原起始位置 */
	cursorOnClose: EditorPosition;
	/** 标识本会话是否为"在光标处插入新链接"流程 */
	isNew: boolean;
	/** 新建链接时若存在选中文本，记录原始选区，用于丢弃时恢复选中状态。 */
	selectionOnClose?: { anchor: EditorPosition; head: EditorPosition };
}

export class LinkEditManager {
	private readonly popoverEditor: PopoverEditor;
	private activeSession: ActiveSession | null = null;
	/** 当前 destination 输入框是否处于警告状态（校验失败） */
	private destinationInvalid = false;
	/** debounce 定时器 */
	private validateDebounceTimer: number | null = null;
	/** 链接目标 suggest 实例（单例，复用避免重复创建 suggestion-container） */
	private readonly suggest: LinkDestinationSuggest;

	constructor(private readonly plugin: BetterLinksPlugin) {
		this.popoverEditor = new PopoverEditor({
			onSave: (displayText, destination) => {
				this.save(displayText, destination);
			},
			onOpen: (displayText, destination) => {
				void this.open(displayText, destination);
			},
			onCopyMarkdown: (displayText, destination) => {
				void this.copyMarkdown(displayText, destination);
			},
			onCopyUrl: (destination) => {
				const session = this.activeSession;
				if (!session) {
					return;
				}

				void copyUrl(this.plugin.app, session.match, destination);
			},
			onDelete: (forceRemoveAll) => {
				this.deleteCurrentLink(forceRemoveAll);
			},
			onToggleEmbed: () => {
				this.toggleEmbed();
			},
			onClose: () => {
				this.saveAndClose();
			},
			onForceSave: () => {
				this.forceSaveAndClose();
			},
			onDiscard: () => {
				this.discardAndClose();
			},
			onDestinationInput: (destination) => {
				this.scheduleValidation(destination);
			},
		}, this.plugin.t.bind(this.plugin));

		// 单例：在 constructor 里创建，绑定到 destinationInput
		this.suggest = new LinkDestinationSuggest(
			this.plugin.app,
			this.popoverEditor.destinationInput,
			"",
			{
				setDisplayText: (value) => {
					this.popoverEditor.setDisplayText(value);
				},
				onSuggestionSelected: () => {
					this.cancelPendingValidation();
					this.setWarning(false);
					if (this.activeSession?.isNew && (this.plugin.settings.quickSelect ?? false)) {
						this.saveAndClose();
					}
				},
			},
			this.plugin.settings,
		);
		this.popoverEditor.setSuggestActiveChecker(() => this.suggest.isActive);
	}

	isOpen(): boolean {
		return this.popoverEditor.isOpen();
	}

	/** 检查某个 DOM 节点是否在 popover 区域内 */
	isMouseOverPopover(node: Node): boolean {
		return this.popoverEditor.containsElement(node);
	}

	/** 获取 popover 根元素用于外部事件绑定 */
	get popoverRootElement(): HTMLElement {
		return this.popoverEditor.rootElement;
	}

	/** 用户是否正在与 popover 交互（输入框获焦或 suggest 下拉打开） */
	isUserInteracting(): boolean {
		return this.popoverEditor.hasInputFocus() || this.suggest.isActive;
	}

	show(match: EditorLinkMatch, referenceEl: HTMLElement | VirtualElement, interactionEl?: HTMLElement): void {
		this.cancelPendingValidation();
		this.suggest.close();
		this.destinationInvalid = false;
		this.activeSession = {
			match,
			// 编辑现有链接：默认把光标放到链接末尾
			cursorOnClose: { ...match.range.to },
			isNew: false,
		};
		const isImage = match.type === "imageWiki" || match.type === "imageMarkdown";
		const showEmbedToggle = !!(this.plugin.settings.showEmbedToggle) && canToggleEmbed(match);
		const isEmbedded = match.originalText.startsWith("!");
		const showCtrlClickHint = (this.plugin.settings.triggerMethod ?? "hover") === "click"
			&& (this.plugin.settings.triggerModifier ?? "none") === "none";
		// alwaysShowDisplayText 关闭时，没有显式 displayText 的链接显示空输入框
		const displayText = (this.plugin.settings.alwaysShowDisplayText ?? false) || match.hasExplicitDisplayText
			? match.displayText
			: "";
		const isInternal = match.type === "wiki" || match.type === "imageWiki" ||
			(match.type === "markdown" && isLikelyInternalDestination(match.destination)) ||
			(match.type === "imageMarkdown" && isLikelyInternalDestination(match.destination));
		this.popoverEditor.open(referenceEl, {
			displayText,
			destination: match.destination,
			typeLabel: linkTypeLabel(match.type, this.plugin),
			isImage,
			isInternal,
			copyMarkdownLabel: copyMarkdownLabel(match, this.plugin),
			copyUrlLabel: copyUrlLabel(match, this.plugin),
			copyUrlIcon: copyUrlIcon(match),
			showDelete: !isImage,
			showEmbedToggle,
			isEmbedded,
			showCtrlClickHint,
		}, interactionEl);

		// 只对 wiki / markdown 非图片链接更新 suggest 上下文
		const shouldSuggest =
			(this.plugin.settings.enableLinkSuggestions ?? true) &&
			(match.type === "wiki" || match.type === "markdown");

		if (shouldSuggest) {
			this.suggest.updateContext(match.sourcePath, this.plugin.settings);
		}
	}

	/**
	 * 命令触发：在当前光标位置弹出浮窗。
	 * - 光标处有链接 → 弹出编辑该链接的 popup（等同点击链接效果）
	 * - 光标处无链接 → 弹出新建链接的 popup，聚焦"URL 或笔记路径"输入框
	 *
	 * @returns 是否成功弹出（无活动编辑器时返回 false）
	 */
	showAtCursor(): boolean {
		const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView?.file) {
			new Notice(this.plugin.t("noticeNoActiveEditor"));
			return false;
		}

		const editor = markdownView.editor;
		const cursor = editor.getCursor();

		// 找到 CM6 EditorView（坐标 + 链接锚点都需要）
		const cmEditorEl = markdownView.containerEl.querySelector(".cm-editor");
		if (!(cmEditorEl instanceof HTMLElement)) {
			new Notice(this.plugin.t("noticeNoActiveEditor"));
			return false;
		}
		const editorView = EditorView.findFromDOM(cmEditorEl);
		if (!editorView) {
			new Notice(this.plugin.t("noticeNoActiveEditor"));
			return false;
		}

		const lineFrom = editorView.state.doc.line(cursor.line + 1).from;
		const cursorOffset = lineFrom + cursor.ch;
		const referenceEl = createCursorVirtualReference(editorView, cursorOffset);

		// 探测光标处是否有链接（inclusiveEnd=true：紧贴链接右侧也视为在链接内）
		const lineText = editor.getLine(cursor.line);
		const relMatch = findLinkAtOffset(lineText, cursor.ch, this.plugin.settings, true);

		if (relMatch) {
			// ── 有链接：编辑模式 ────────────────────────────────────────────
			const editorMatch = withEditorRange(relMatch, cursor.line, markdownView.file.path);
			this.show(editorMatch, referenceEl);
			return true;
		}

		// ── 无链接：新建模式 ────────────────────────────────────────────────
		// 若存在选中文本，则把选区作为链接的目标范围，并把选中文本预填到 destination 输入框。
		const hasSelection = editor.somethingSelected();
		const selectionRange = hasSelection ? editor.listSelections()[0] : null;
		const selectedText = hasSelection ? editor.getSelection() : "";
		// 归一化选区：from 始终在 to 之前
		const selectionBounds = selectionRange
			? normalizeSelection(selectionRange.anchor, selectionRange.head)
			: null;

		const useWiki = shouldUseWikiLinkFormat(this.plugin.app);
		const linkFrom: EditorPosition = selectionBounds ? { ...selectionBounds.from } : { line: cursor.line, ch: cursor.ch };
		const linkTo: EditorPosition = selectionBounds ? { ...selectionBounds.to } : { line: cursor.line, ch: cursor.ch };
		const placeholder: EditorLinkMatch = {
			type: useWiki ? "wiki" : "markdown",
			start: linkFrom.ch,
			end: linkTo.ch,
			originalText: "",
			displayText: "",
			destination: "",
			hasExplicitDisplayText: false,
			range: {
				from: { ...linkFrom },
				to: { ...linkTo },
			},
			sourcePath: markdownView.file.path,
		};

		this.cancelPendingValidation();
		this.suggest.close();
		this.destinationInvalid = false;
		this.activeSession = {
			match: placeholder,
			cursorOnClose: { ...linkFrom },
			isNew: true,
			// 有选区时记录原始选区，丢弃时恢复
			selectionOnClose: selectionBounds
				? { anchor: { ...selectionBounds.from }, head: { ...selectionBounds.to } }
				: undefined,
		};

		const showCtrlClickHint = (this.plugin.settings.triggerMethod ?? "hover") === "click"
			&& (this.plugin.settings.triggerModifier ?? "none") === "none";
		const showEmbedToggle = !!(this.plugin.settings.showEmbedToggle) && canToggleEmbed(placeholder);

		this.popoverEditor.open(referenceEl, {
			displayText: "",
			destination: selectedText,
			typeLabel: linkTypeLabel(placeholder.type, this.plugin),
			isImage: false,
			isInternal: useWiki,
			copyMarkdownLabel: copyMarkdownLabel(placeholder, this.plugin),
			copyUrlLabel: copyUrlLabel(placeholder, this.plugin),
			copyUrlIcon: copyUrlIcon(placeholder),
			showDelete: false,
			showEmbedToggle,
			isEmbedded: false,
			showCtrlClickHint,
			focusTarget: "destination",
		});

		// 预填了 destination 时，主动触发一次校验，保证警告状态与内容同步
		if (selectedText.trim().length > 0) {
			this.scheduleValidation(selectedText);
		}

		if (this.plugin.settings.enableLinkSuggestions ?? true) {
			this.suggest.updateContext(placeholder.sourcePath, this.plugin.settings);
		}

		return true;
	}

	close(): void {
		this.saveAndClose();
	}

	destroy(): void {
		this.cancelPendingValidation();
		this.suggest.close();
		this.activeSession = null;
		this.popoverEditor.destroy();
	}

	/** Auto-save current edits then close the popover. */
	private saveAndClose(): void {
		const cursorTarget = this.activeSession ? { ...this.activeSession.cursorOnClose } : null;
		if (this.activeSession && this.popoverEditor.isOpen()) {
			const { displayText, destination } = this.popoverEditor.getValues();
			const silent = !this.destinationInvalid;
			this.save(displayText, destination, silent);
		}
		// save() 可能更新了 cursorOnClose（成功插入时落在新文本末尾），优先使用更新后的值
		const finalCursor = this.activeSession?.cursorOnClose ?? cursorTarget;
		// save() 成功创建链接后会清空 selectionOnClose；若仍存在说明未创建，需恢复选区
		const finalSelection = this.activeSession?.selectionOnClose ?? null;
		this.cancelPendingValidation();
		this.closeSuggest();
		this.destinationInvalid = false;
		this.activeSession = null;
		this.popoverEditor.close();
		this.restoreEditorState(finalCursor, finalSelection);
	}

	/** 强制保存（跳过校验）并关闭。 */
	private forceSaveAndClose(): void {
		const cursorTarget = this.activeSession ? { ...this.activeSession.cursorOnClose } : null;
		if (this.activeSession && this.popoverEditor.isOpen()) {
			const { displayText, destination } = this.popoverEditor.getValues();
			this.destinationInvalid = false;
			this.save(displayText, destination, true);
		}
		const finalCursor = this.activeSession?.cursorOnClose ?? cursorTarget;
		const finalSelection = this.activeSession?.selectionOnClose ?? null;
		this.cancelPendingValidation();
		this.closeSuggest();
		this.destinationInvalid = false;
		this.activeSession = null;
		this.popoverEditor.close();
		this.restoreEditorState(finalCursor, finalSelection);
	}

	/** 丢弃编辑，直接关闭（ESC 触发）。 */
	private discardAndClose(): void {
		// ESC 不修改文档：
		//  - 编辑现有链接 → 光标放在链接末尾，方便继续打字
		//  - 新建场景（无选区）→ 光标回到原起始位置（cursorOnClose 默认值已设好）
		//  - 新建场景（有选区）→ 恢复原始选中文本状态
		const finalCursor = this.activeSession ? { ...this.activeSession.cursorOnClose } : null;
		const finalSelection = this.activeSession?.selectionOnClose ?? null;
		this.cancelPendingValidation();
		this.closeSuggest();
		this.destinationInvalid = false;
		this.activeSession = null;
		this.popoverEditor.close();
		this.restoreEditorState(finalCursor, finalSelection);
	}

	/**
	 * 关闭浮窗后把焦点交还给编辑器：
	 *  - 若有待恢复的选区 → 恢复选中文本状态
	 *  - 否则把光标放到指定位置
	 */
	private restoreEditorState(
		cursor: EditorPosition | null,
		selection: { anchor: EditorPosition; head: EditorPosition } | null,
	): void {
		if (selection) {
			const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
			const editor = markdownView?.editor;
			if (editor) {
				editor.focus();
				editor.setSelection(selection.anchor, selection.head);
				return;
			}
		}
		if (cursor) {
			this.restoreEditorFocus(cursor);
		}
	}

	/** 关闭浮窗后把焦点交还给编辑器并把光标放在指定位置，避免打断编辑流。 */
	private restoreEditorFocus(cursor: EditorPosition): void {
		const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const editor = markdownView?.editor;
		if (!editor) return;
		editor.focus();
		editor.setCursor(cursor);
	}

	private save(displayText: string, destination: string, silent = false): void {
		const session = this.activeSession;
		if (!session) return;

		// 如果目标校验失败，阻止保存
		if (this.destinationInvalid) {
			if (!silent) {
				new Notice(this.plugin.t("noticeInternalLinkNotFound"));
			}
			return;
		}

		// 新建链接场景（originalText 为空）：destination 为空时不插入任何内容
		if (session.isNew && destination.trim().length === 0) {
			return;
		}

		const nextText = serializeEditedLink(session.match, displayText, destination, {
			preferWikiLink: shouldUseWikiLinkFormat(this.plugin.app),
		});
		if (nextText === session.match.originalText) return; // no change

		// 新建场景：根据设置决定是否在两侧补空格，并计算插入后光标应在的位置（落在 trailing pad 之后）
		let replacement = nextText;
		if (session.isNew) {
			// 替换选中文本时不补空格：选区两侧的邻接关系已由原文本确定
			const padded = session.selectionOnClose
				? { text: nextText, cursorOffsetWithin: nextText.length }
				: padIfNewLink(nextText, session.match.range.from, this.plugin);
			replacement = padded.text;
			session.cursorOnClose = {
				line: session.match.range.from.line,
				ch: session.match.range.from.ch + padded.cursorOffsetWithin,
			};
			// 已成功创建链接，丢弃时不再恢复选区
			session.selectionOnClose = undefined;
		} else {
			// 编辑现有链接：光标落在替换后的文本末尾
			session.cursorOnClose = {
				line: session.match.range.from.line,
				ch: session.match.range.from.ch + replacement.length,
			};
		}

		session.match.destination = destination.trim();
		session.match.displayText = displayText.trim();
		session.match.originalText = nextText; // 保留 nextText 不含 padding 作为 link 本体
		this.replaceActiveRange(replacement);
		if (!silent) {
			new Notice(this.plugin.t("noticeLinkUpdated"));
		}
	}

	private async open(displayText: string, destination: string): Promise<void> {
		const session = this.activeSession;
		if (!session) {
			return;
		}

		const values = normalizeEditableValues(session.match, displayText, destination);
		await openLink(this.plugin.app, session.match, values, this.plugin.settings);
		this.close();
	}

	private async copyMarkdown(displayText: string, destination: string): Promise<void> {
		const session = this.activeSession;
		if (!session) {
			return;
		}

		const values = normalizeEditableValues(session.match, displayText, destination);
		await copyMarkdown(this.plugin.app, session.match, values);
	}

	private deleteCurrentLink(forceRemoveAll = false): void {
		const session = this.activeSession;
		if (!session) {
			return;
		}

		// 纯 URL（plain link，无显式 display text）：删除即整段移除，无需 Ctrl
		// 因为对于裸 URL 来说没有显示文本可以保留，preserve-text 模式会保留 URL 本身
		// 这与"删除"的直觉相悖，所以直接整段删除。
		const isPlainUrl = session.match.type === "url";
		const removeAll = forceRemoveAll || isPlainUrl;

		let replacement: string;
		let noticeKey: "noticeLinkRemoved" | "noticeLinkRemovedAll";

		if (removeAll) {
			replacement = "";
			noticeKey = "noticeLinkRemovedAll";
		} else {
			replacement = buildDeletionText(session.match, this.plugin.settings);
			noticeKey = "noticeLinkRemoved";
		}

		// 记录链接起始位置，完全移除时用于恢复光标
		const cursorPos = removeAll ? { ...session.match.range.from } : null;

		this.replaceActiveRange(replacement);

		// 完全移除链接后，将光标定位到链接原起始处
		// 需要先 focus editor，否则 popover button 持有焦点时 setCursor 不生效
		if (cursorPos) {
			const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
			const editor = markdownView?.editor;
			if (editor) {
				editor.focus();
				editor.setCursor(cursorPos);
			}
		}

		new Notice(this.plugin.t(noticeKey));
		this.close();
	}

	/** 切换当前链接的 ! 前缀（嵌入/非嵌入） */
	private toggleEmbed(): void {
		const session = this.activeSession;
		if (!session) return;

		const { displayText, destination } = this.popoverEditor.getValues();
		const isCurrentlyEmbedded = session.match.originalText.startsWith("!");
		const nextEmbedded = !isCurrentlyEmbedded;

		// 重建链接文本，切换前缀
		const nextText = rebuildWithEmbedPrefix(session.match, displayText, destination, nextEmbedded);
		if (nextText === session.match.originalText) return;

		// 更新 session 状态
		session.match.originalText = nextText;
		this.replaceActiveRange(nextText);

		// 更新按钮视觉状态（不关闭浮窗）
		this.popoverEditor.updateEmbedState(nextEmbedded);
	}

	private replaceActiveRange(replacement: string): void {
		const session = this.activeSession;
		if (!session) {
			return;
		}

		const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		const editor = markdownView?.editor;
		if (!editor) {
			new Notice(this.plugin.t("noticeNoActiveEditor"));
			return;
		}

		editor.replaceRange(replacement, session.match.range.from, session.match.range.to, "better-links");

		// 更新 range.to，因为替换后文本长度可能变化
		session.match.range.to = {
			line: session.match.range.from.line,
			ch: session.match.range.from.ch + replacement.length,
		};
	}

	/** 调度 debounce 校验（300ms） */
	private scheduleValidation(destination: string): void {
		this.cancelPendingValidation();
		this.validateDebounceTimer = window.setTimeout(() => {
			this.validateDestination(destination);
		}, 300);
	}

	private cancelPendingValidation(): void {
		if (this.validateDebounceTimer !== null) {
			window.clearTimeout(this.validateDebounceTimer);
			this.validateDebounceTimer = null;
		}
	}

	private closeSuggest(): void {
		this.suggest.close();
	}

	/** 校验内部链接目标是否存在 */
	private validateDestination(destination: string): void {
		const session = this.activeSession;
		if (!session) return;

		// 只校验内部链接类型
		const isInternal = session.match.type === "wiki" || session.match.type === "imageWiki" ||
			session.match.type === "imageMarkdown" || session.match.type === "markdown";
		if (!isInternal) return;

		// 未启用校验功能
		if (!(this.plugin.settings.validateInternalLinks ?? true)) return;

		const trimmed = destination.trim();
		if (!trimmed) {
			// 空目标不触发警告（有专门的"目标为空"逻辑）
			this.setWarning(false);
			return;
		}

		// 外部链接跳过
		if (isLikelyExternalDestination(trimmed)) {
			this.setWarning(false);
			return;
		}

		const valid = this.checkInternalTarget(trimmed, session.match.sourcePath);
		this.setWarning(!valid);
	}

	/**
	 * 检查内部链接目标是否存在。
	 * 支持格式：
	 *  - `note`             纯文件名
	 *  - `folder/note`      路径
	 *  - `note#heading`     文件内标题
	 *  - `#heading`         当前文件内标题
	 *  - `note.png` 等图片扩展名
	 */
	private checkInternalTarget(destination: string, sourcePath: string): boolean {
		const hashIndex = destination.indexOf("#");
		const filePart = hashIndex >= 0 ? destination.slice(0, hashIndex) : destination;
		const headingPart = hashIndex >= 0 ? destination.slice(hashIndex + 1) : null;

		// `#heading` 格式：锚点指向当前文件
		if (filePart === "" && headingPart !== null) {
			const currentFile = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
			if (!currentFile || !("stat" in currentFile)) return false;
			return this.headingExistsInFile(currentFile as Parameters<typeof this.plugin.app.metadataCache.getFileCache>[0], headingPart);
		}

		// 通过 metadataCache 解析 linkpath（支持模糊匹配和别名）
		const resolvedFile = this.plugin.app.metadataCache.getFirstLinkpathDest(filePart, sourcePath);

		if (!resolvedFile) return false;

		// 没有锚点，文件存在即可
		if (headingPart === null || headingPart === "") return true;

		// 校验标题是否存在
		return this.headingExistsInFile(resolvedFile, headingPart);
	}

	private headingExistsInFile(
		file: Parameters<typeof this.plugin.app.metadataCache.getFileCache>[0],
		heading: string,
	): boolean {
		const cache = this.plugin.app.metadataCache.getFileCache(file);
		if (!cache?.headings) return false;
		const normalized = heading.toLowerCase();
		return cache.headings.some((h) => h.heading.toLowerCase() === normalized);
	}

	private setWarning(hasWarning: boolean): void {
		this.destinationInvalid = hasWarning;
		this.popoverEditor.setDestinationWarning(hasWarning);
	}
}

function linkTypeLabel(type: EditorLinkMatch["type"], plugin: BetterLinksPlugin): string {
	if (type === "wiki") {
		return plugin.t("typeLabelWiki");
	}

	if (type === "markdown") {
		return plugin.t("typeLabelMarkdown");
	}

	if (type === "imageWiki") {
		return plugin.t("typeLabelImageWiki");
	}

	if (type === "imageMarkdown") {
		return plugin.t("typeLabelImageMarkdown");
	}

	return plugin.t("typeLabelUrl");
}

function copyMarkdownLabel(match: EditorLinkMatch, plugin: BetterLinksPlugin): string {
	if (isLikelyExternalDestination(match.destination)) {
		return plugin.t("popoverAriaCopyMarkdown");
	}

	return shouldUseWikiLinkFormat(plugin.app)
		? plugin.t("popoverAriaCopyWikiLink")
		: plugin.t("popoverAriaCopyMarkdown");
}

function copyUrlLabel(match: EditorLinkMatch, plugin: BetterLinksPlugin): string {
	if (match.type === "imageWiki" || match.type === "imageMarkdown") {
		return plugin.t("popoverAriaCopyFileName");
	}

	return plugin.t("popoverAriaCopyUrl");
}

function copyUrlIcon(_match: EditorLinkMatch): string {
	return "link";
}

/** 是否支持嵌入切换（只有 wiki / markdown 类型支持 ! 前缀） */
function canToggleEmbed(match: EditorLinkMatch): boolean {
	return match.type === "wiki" || match.type === "markdown" || match.type === "imageWiki" || match.type === "imageMarkdown";
}

/** 重建链接文本，强制设定是否有 ! 前缀 */
function rebuildWithEmbedPrefix(match: EditorLinkMatch, displayText: string, destination: string, embed: boolean): string {
	const prefix = embed ? "!" : "";
	const dest = destination.trim();
	const disp = displayText.trim();

	if (match.type === "wiki" || match.type === "imageWiki") {
		if (!dest) return "";
		const hasAlias = disp.length > 0 && disp !== dest;
		return hasAlias ? `${prefix}[[${dest}|${disp}]]` : `${prefix}[[${dest}]]`;
	}

	// markdown / imageMarkdown
	return `${prefix}[${disp}](${dest})`;
}

/**
 * 构造一个锚定到光标位置（0 长度区间）的 Popper VirtualElement。
 * 与 linkInterceptor.ts 的 createVirtualReference 思路一致，但简化为单点：
 * 始终用 coordsAtPos(offset) 的结果做 1px 矩形，让 popper 把浮窗放在光标旁。
 */
function createCursorVirtualReference(editorView: EditorView, offset: number): VirtualElement {
	let lastRect = new DOMRect(0, 0, 1, 1);
	return {
		contextElement: editorView.dom,
		getBoundingClientRect: () => {
			const pos = editorView.coordsAtPos(offset);
			if (pos) {
				lastRect = new DOMRect(pos.left, pos.top, 1, Math.max(1, pos.bottom - pos.top));
			}
			return lastRect;
		},
	};
}

/**
 * 归一化选区：返回 from 在前、to 在后的边界（行号优先，其次列号）。
 */
function normalizeSelection(anchor: EditorPosition, head: EditorPosition): { from: EditorPosition; to: EditorPosition } {
	const anchorBeforeHead = anchor.line < head.line || (anchor.line === head.line && anchor.ch <= head.ch);
	return anchorBeforeHead ? { from: anchor, to: head } : { from: head, to: anchor };
}

/**
 * 新建链接场景：根据设置在 linkText 两侧补空格（仅当邻接字符不是空白/标点时补）。
 *
 * 返回：
 *  - text: 实际要写入文档的文本（含可能的前后空格）
 *  - cursorOffsetWithin: 写入后光标相对 text 起始的偏移量
 *    - 若有 trailing pad → 落在 trailing pad 之后（即 text 长度）
 *    - 若没有 trailing pad → 落在 linkText 之后（也是 text 长度）
 *    实际两种情况都是 text.length，调用方按这个偏移把光标放好。
 */
function padIfNewLink(linkText: string, insertAt: EditorPosition, plugin: BetterLinksPlugin): { text: string; cursorOffsetWithin: number } {
	const enabled = plugin.settings.padNewLinkWithSpaces ?? true;
	if (!enabled) {
		return { text: linkText, cursorOffsetWithin: linkText.length };
	}

	const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	const editor = markdownView?.editor;
	if (!editor) {
		return { text: linkText, cursorOffsetWithin: linkText.length };
	}

	const lineText = editor.getLine(insertAt.line);
	const charBefore = insertAt.ch > 0 ? lineText.charAt(insertAt.ch - 1) : "";
	const charAfter = insertAt.ch < lineText.length ? lineText.charAt(insertAt.ch) : "";

	const leftPad = charBefore && !isAdjacentBoundaryChar(charBefore) ? " " : "";
	const rightPad = charAfter && !isAdjacentBoundaryChar(charAfter) ? " " : "";
	const text = `${leftPad}${linkText}${rightPad}`;
	return { text, cursorOffsetWithin: text.length };
}

/**
 * 判断字符是否为"邻接边界"，即不需要再补空格。
 * 包括：空白、中英常用标点（句末标点、引号、括号等）。
 */
function isAdjacentBoundaryChar(ch: string): boolean {
	if (/\s/.test(ch)) return true;
	// ASCII 标点
	if (/[.,;:!?\-)\]}>"'`/]/.test(ch)) return true;
	// 中文常用全角标点
	if (/[，。；：！？、）】》」』""'']/.test(ch)) return true;
	return false;
}
