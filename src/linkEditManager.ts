import { MarkdownView, Notice } from "obsidian";
import type BetterLinksPlugin from "./main";
import { copyMarkdown, copyUrl, buildDeletionText, normalizeEditableValues, openLink, shouldUseWikiLinkFormat } from "./linkActions";
import { isLikelyExternalDestination, serializeEditedLink, type EditorLinkMatch } from "./linkDetector";
import { PopoverEditor } from "./popoverEditor";
import { LinkDestinationSuggest } from "./linkSuggest";

interface ActiveSession {
	match: EditorLinkMatch;
	referenceEl: HTMLElement;
}

export class LinkEditManager {
	private readonly popoverEditor: PopoverEditor;
	private activeSession: ActiveSession | null = null;
	/** 当前 destination 输入框是否处于警告状态（校验失败） */
	private destinationInvalid = false;
	/** debounce 定时器 */
	private validateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
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
			onDelete: () => {
				this.deleteCurrentLink();
			},
			onClose: () => {
				this.saveAndClose();
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
				},
			},
			this.plugin.settings,
		);
		this.popoverEditor.setSuggestActiveChecker(() => this.suggest.isActive);
	}

	isOpen(): boolean {
		return this.popoverEditor.isOpen();
	}

	show(match: EditorLinkMatch, referenceEl: HTMLElement): void {
		this.cancelPendingValidation();
		this.suggest.close();
		this.destinationInvalid = false;
		this.activeSession = { match, referenceEl };
		const isImage = match.type === "imageWiki" || match.type === "imageMarkdown";
		this.popoverEditor.open(referenceEl, {
			displayText: match.displayText,
			destination: match.destination,
			typeLabel: linkTypeLabel(match.type, this.plugin),
			isImage,
			copyMarkdownLabel: copyMarkdownLabel(match, this.plugin),
			copyUrlLabel: copyUrlLabel(match, this.plugin),
			copyUrlIcon: copyUrlIcon(match),
			showDelete: !isImage,
		});

		// 只对 wiki / markdown 非图片链接更新 suggest 上下文
		const shouldSuggest =
			(this.plugin.settings.enableLinkSuggestions ?? true) &&
			(match.type === "wiki" || match.type === "markdown");

		if (shouldSuggest) {
			this.suggest.updateContext(match.sourcePath, this.plugin.settings);
		}
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
		if (this.activeSession && this.popoverEditor.isOpen()) {
			const { displayText, destination } = this.popoverEditor.getValues();
			// 校验失败时需要明确告知用户，不能静默
			const silent = !this.destinationInvalid;
			this.save(displayText, destination, silent);
		}
		this.cancelPendingValidation();
		this.closeSuggest();
		this.destinationInvalid = false;
		this.activeSession = null;
		this.popoverEditor.close();
	}

	/** 丢弃编辑，直接关闭（ESC 触发）。 */
	private discardAndClose(): void {
		this.cancelPendingValidation();
		this.closeSuggest();
		this.destinationInvalid = false;
		this.activeSession = null;
		this.popoverEditor.close();
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

		const nextText = serializeEditedLink(session.match, displayText, destination);
		if (nextText === session.match.originalText) return; // no change

		session.match.destination = destination.trim();
		session.match.displayText = displayText.trim();
		session.match.originalText = nextText;
		this.replaceActiveRange(nextText);
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

	private deleteCurrentLink(): void {
		const session = this.activeSession;
		if (!session) {
			return;
		}

		const replacement = buildDeletionText(session.match, this.plugin.settings);
		this.replaceActiveRange(replacement);
		new Notice(this.plugin.t("noticeLinkRemoved"));
		this.close();
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
	}

	/** 调度 debounce 校验（300ms） */
	private scheduleValidation(destination: string): void {
		this.cancelPendingValidation();
		this.validateDebounceTimer = setTimeout(() => {
			this.validateDestination(destination);
		}, 300);
	}

	private cancelPendingValidation(): void {
		if (this.validateDebounceTimer !== null) {
			clearTimeout(this.validateDebounceTimer);
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
		if (/^(https?:|mailto:|obsidian:)/i.test(trimmed)) {
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

function copyUrlIcon(match: EditorLinkMatch): string {
	if (match.type === "imageWiki" || match.type === "imageMarkdown") {
		return "file";
	}

	return isLikelyExternalDestination(match.destination) ? "link" : "file";
}