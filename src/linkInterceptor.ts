import { EditorView } from "@codemirror/view";
import type { VirtualElement } from "@popperjs/core";
import { MarkdownView, Notice } from "obsidian";
import type BetterLinksPlugin from "./main";
import { findLinkAtOffset, findLinkByDestination, withEditorRange, type EditorLinkMatch, type RelativeLinkMatch } from "./linkDetector";
import type { LinkEditManager } from "./linkEditManager";
import { normalizeEditableValues, openLink } from "./linkActions";

import type { ExcludeMode } from "./settings";

/** 悬浮触发的延迟（ms） */
const HOVER_DELAY = 300;
/** 鼠标离开链接/popover 后关闭的延迟（ms） */
const HOVER_LEAVE_DELAY = 500;

/**
 * 解析排除关键字字符串（逗号或换行分隔）为 trimmed 非空数组
 */
function parseExcludeKeywords(raw: string | undefined): string[] {
	if (!raw) return [];
	return raw
		.split(/[,\n]/)
		.map((k) => k.trim().toLowerCase())
		.filter((k) => k.length > 0);
}

/**
 * 检查链接目标是否匹配任一排除关键字
 */
function matchesExcludeKeyword(destination: string, keywords: string[]): boolean {
	if (keywords.length === 0) return false;
	const lower = destination.toLowerCase();
	return keywords.some((kw) => lower.includes(kw));
}

function dbg(enabled: boolean, ...args: unknown[]): void {
	if (enabled) console.debug("[BetterLinks]", ...args);
}

/**
 * 计算链接在 Live Preview 中的可见结束偏移（文档绝对偏移）。
 * Markdown 链接的 `](url)` 在 Live Preview 下被折叠，`coordsAtPos(match.end)` 可能返回 null；
 * 用 `]` 的位置 + 1 作为可见结束位置，确保 `coordsAtPos` 能返回有效坐标。
 */
function computeVisibleEndOffset(match: RelativeLinkMatch, lineStartOffset: number): number {
	if (match.type === "markdown" || match.type === "imageMarkdown") {
		const closeBracket = match.originalText.indexOf("]");
		if (closeBracket >= 0) {
			return lineStartOffset + match.start + closeBracket + 1;
		}
	}
	return lineStartOffset + match.end;
}

/**
 * 同 computeVisibleEndOffset，但返回行内字符偏移（ch）。
 */
function computeVisibleEndCh(match: EditorLinkMatch): number {
	if (match.type === "markdown" || match.type === "imageMarkdown") {
		const closeBracket = match.originalText.indexOf("]");
		if (closeBracket >= 0) {
			return match.range.from.ch + closeBracket + 1;
		}
	}
	return match.range.to.ch;
}

export class LinkInterceptor {
	/** hover 模式：延迟显示定时器 */
	private hoverShowTimer: number | null = null;
	/** hover 模式：延迟关闭定时器 */
	private hoverHideTimer: number | null = null;
	/** hover 模式：当前悬停链接的序列化 key（用于判断是否同一个链接） */
	private hoveredLinkKey: string | null = null;
	/** pointerdown 拦截成功标记，用于让后续 click 事件配合 preventDefault */
	private pointerDownIntercepted = false;
	/** touchstart 阶段记录的起始坐标，用于 touchmove 判断是否为拖动 */
	private touchStartX = 0;
	private touchStartY = 0;
	/** touchstart 确认了链接，等待 touchend 打开 popover */
	private touchIntercepted = false;
	/** touchstart 阶段保存的链接匹配和上下文，供 touchend 使用 */
	private touchLinkContext: {
		match: ReturnType<typeof findLinkAtOffset>;
		position: { line: number; ch: number };
		markdownView: MarkdownView;
		target: HTMLElement;
	} | null = null;

	constructor(
		private readonly plugin: BetterLinksPlugin,
		private readonly linkEditManager: LinkEditManager,
	) {}

	/**
	 * pointerdown capture：在移动端 Obsidian 处理链接跳转之前抢先拦截。
	 *
	 * click 触发模式：拦截左键（button === 0）和 touch，标记此次交互已被插件接管，
	 * 后续 click 事件中根据标记完成打开 popover 的实际逻辑。
	 *
	 * right-click 触发模式：拦截右键（button === 2）的 pointerdown，
	 * preventDefault 阻止后续 mousedown 事件传播给 CM6，
	 * 防止光标移动导致 Live Preview 展开链接（文本跳动）。
	 */
	handlePointerDown(event: PointerEvent): void {
		this.pointerDownIntercepted = false;

		dbg(this.plugin.settings.debugMode ?? false, "pointerdown", { pointerType: event.pointerType, button: event.button, clientX: event.clientX, clientY: event.clientY });

		if (!this.plugin.settings.enabled) { dbg(this.plugin.settings.debugMode ?? false, "⏹ disabled"); return; }
		const triggerMethod = this.plugin.settings.triggerMethod ?? "hover";
		dbg(this.plugin.settings.debugMode ?? false, "triggerMethod:", triggerMethod);

		// right-click 模式：拦截右键 pointerdown，阻止 CM6 光标移动和 Live Preview 展开
		if (triggerMethod === "right-click" && event.button === 2) {
			this.preventRightClickExpansion(event);
			return;
		}

		if (triggerMethod !== "click") { dbg(this.plugin.settings.debugMode ?? false, "⏹ not click mode, skip pointerdown intercept"); return; }
		// 移动端触屏 event.button 可能为 -1，用 pointerType 区分触屏与右键
		// 只处理 mouse 左键（button === 0）和 touch（button === -1 或 0）
		if (event.button > 0) { dbg(this.plugin.settings.debugMode ?? false, "⏹ non-left button:", event.button); return; }

		// disableNativeClick 的裸左键拦截也需要在 pointerdown 阶段处理
		// （否则移动端 Obsidian 会在 click 之前就完成跳转）

		const target = event.target;
		if (!(target instanceof HTMLElement)) { dbg(this.plugin.settings.debugMode ?? false, "⏹ target not HTMLElement"); return; }
		if (target.matches("img") || target.closest("img") || target.closest(".image-embed")) { dbg(this.plugin.settings.debugMode ?? false, "⏹ image target"); return; }

		const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView?.file) { dbg(this.plugin.settings.debugMode ?? false, "⏹ no active MarkdownView/file"); return; }
		if (!markdownView.containerEl.contains(target)) { dbg(this.plugin.settings.debugMode ?? false, "⏹ target not inside MarkdownView"); return; }

		const cmEditorEl = target.closest(".cm-editor");
		if (!(cmEditorEl instanceof HTMLElement)) { dbg(this.plugin.settings.debugMode ?? false, "⏹ no .cm-editor ancestor"); return; }

		const editorView = EditorView.findFromDOM(cmEditorEl);
		if (!editorView) { dbg(this.plugin.settings.debugMode ?? false, "⏹ EditorView.findFromDOM returned null"); return; }

		// 移动端触屏：优先用 target 元素的中心坐标做 fallback，
		// 避免 clientX/Y 在 pointerdown 时精度不足
		const rect = target.getBoundingClientRect();
		const x = event.clientX || (rect.left + rect.width / 2);
		const y = event.clientY || (rect.top + rect.height / 2);
		dbg(this.plugin.settings.debugMode ?? false, "coords used:", { x, y, rawClientX: event.clientX, rawClientY: event.clientY });

		const documentOffset = editorView.posAtCoords({ x, y }, false);
		dbg(this.plugin.settings.debugMode ?? false, "documentOffset:", documentOffset);
		if (documentOffset == null) { dbg(this.plugin.settings.debugMode ?? false, "⏹ posAtCoords returned null"); return; }

		const position = markdownView.editor.offsetToPos(documentOffset);
		const lineText = markdownView.editor.getLine(position.line);
		dbg(this.plugin.settings.debugMode ?? false, "line", position.line, "ch", position.ch, JSON.stringify(lineText));
		const match = findLinkAtOffset(lineText, position.ch, this.plugin.settings);
		dbg(this.plugin.settings.debugMode ?? false, "findLinkAtOffset result:", match);
		if (!match) { dbg(this.plugin.settings.debugMode ?? false, "⏹ no link match at offset"); return; }

		// edgeProtection：验证鼠标坐标是否真的在链接可视区域内
		// 支持跨行（软换行）链接：首行检查左边界，末行检查右边界，中间行不检查 X 轴
		if (this.plugin.settings.edgeProtection ?? true) {
			const lineStartOffset = editorView.state.doc.line(position.line + 1).from;
			const matchStartOffset = lineStartOffset + match.start;
			const matchStart = editorView.coordsAtPos(matchStartOffset);
			const matchEnd = editorView.coordsAtPos(lineStartOffset + match.end);
			dbg(this.plugin.settings.debugMode ?? false, "edgeProtection check:", { matchStart, matchEnd, x, y });
			if (matchStart && matchEnd) {
				const inside = this.isPointInsideLinkRect(x, y, documentOffset, matchStartOffset, lineStartOffset + match.end, matchStart, matchEnd);
				dbg(this.plugin.settings.debugMode ?? false, "isPointInsideLinkRect:", inside);
				if (!inside) { dbg(this.plugin.settings.debugMode ?? false, "⏹ edge protection rejected"); return; }
			}
		}

		// 确认点在链接上 → 抢先 prevent，阻止 Obsidian 原生跳转
		// 触屏时不调用 stopPropagation：iOS 上 pointerdown stopPropagation 会阻断后续 click 事件，
		// 导致 handleClick 不触发、popover 无法打开。仅用 preventDefault 标记意图即可。
		if (event.pointerType === "touch") {
			dbg(this.plugin.settings.debugMode ?? false, "✅ pointerdown intercepted (touch — preventDefault only, no stopPropagation)");
			event.preventDefault();
		} else {
			dbg(this.plugin.settings.debugMode ?? false, "✅ pointerdown intercepted (mouse — preventDefault + stopPropagation)");
			event.preventDefault();
			event.stopPropagation();
		}
		this.pointerDownIntercepted = true;
	}

	/**
	 * right-click 模式专用：在 pointerdown(button=2) 阶段检测右键是否落在链接上，
	 * 如果是则 preventDefault 阻止后续 mousedown 传播给 CM6，
	 * 防止光标移动导致 Live Preview 展开/折叠（文本跳动）。
	 */
	private preventRightClickExpansion(event: PointerEvent): void {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		if (target.matches("img") || target.closest("img") || target.closest(".image-embed")) return;

		const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView?.file || !markdownView.containerEl.contains(target)) return;

		const cmEditorEl = target.closest(".cm-editor");
		if (!(cmEditorEl instanceof HTMLElement)) return;

		const editorView = EditorView.findFromDOM(cmEditorEl);
		if (!editorView) return;

		const documentOffset = editorView.posAtCoords({ x: event.clientX, y: event.clientY }, false);
		if (documentOffset == null) return;

		const position = markdownView.editor.offsetToPos(documentOffset);
		const lineText = markdownView.editor.getLine(position.line);
		const match = findLinkAtOffset(lineText, position.ch, this.plugin.settings);
		if (!match) return;

		// 确认右键落在链接上 → preventDefault 阻止 mousedown 传播给 CM6
		// 仅 preventDefault，不 stopPropagation：contextmenu 事件需要正常传播
		dbg(this.plugin.settings.debugMode ?? false, "✅ right-click pointerdown on link — preventDefault to block CM6 cursor move");
		event.preventDefault();
	}

	/**
	 * touchstart capture：iOS 上 Live Preview 折叠链接的跳转发生在 Obsidian 内部的
	 * pointerdown/mousedown handler 中，比 document capture 更早执行（widget 内部监听）。
	 * 唯一能在它之前拦截的只有 touchstart（capture + passive:false）。
	 *
	 * 策略：
	 * - 检测到手指落在链接上 → preventDefault 阻止后续所有默认行为（包括 Obsidian 跳转）
	 * - 保存链接上下文，在 touchend 里直接打开 popover
	 * - touchmove 超过阈值时取消标记（恢复滚动能力——但注意 preventDefault 已调用，
	 *   所以本次 touch 序列的滚动无法恢复；这是为了阻止跳转的必要代价）
	 */
	handleTouchStart(event: TouchEvent): void {
		this.touchIntercepted = false;
		this.touchLinkContext = null;

		if (!this.plugin.settings.enabled) return;
		const triggerMethod = this.plugin.settings.triggerMethod ?? "hover";
		if (triggerMethod !== "click") return;

		const touch = event.touches[0];
		if (!touch) return;

		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		if (target.matches("img") || target.closest("img") || target.closest(".image-embed")) return;

		const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView?.file || !markdownView.containerEl.contains(target)) return;

		const cmEditorEl = target.closest(".cm-editor");
		if (!(cmEditorEl instanceof HTMLElement)) return;

		const editorView = EditorView.findFromDOM(cmEditorEl);
		if (!editorView) return;

		const rect = target.getBoundingClientRect();
		const x = touch.clientX || (rect.left + rect.width / 2);
		const y = touch.clientY || (rect.top + rect.height / 2);

		dbg(this.plugin.settings.debugMode ?? false, "touchstart", { x, y, targetTag: target.tagName, targetClass: target.className });

		const documentOffset = editorView.posAtCoords({ x, y }, false);
		if (documentOffset == null) { dbg(this.plugin.settings.debugMode ?? false, "touchstart ⏹ posAtCoords null"); return; }

		const position = markdownView.editor.offsetToPos(documentOffset);
		const lineText = markdownView.editor.getLine(position.line);
		const match = findLinkAtOffset(lineText, position.ch, this.plugin.settings);
		if (!match) { dbg(this.plugin.settings.debugMode ?? false, "touchstart ⏹ no link match"); return; }

		if (this.plugin.settings.edgeProtection ?? true) {
			const lineStartOffset = editorView.state.doc.line(position.line + 1).from;
			const matchStartOffset = lineStartOffset + match.start;
			const matchStart = editorView.coordsAtPos(matchStartOffset);
			const matchEnd = editorView.coordsAtPos(lineStartOffset + match.end);
			if (matchStart && matchEnd) {
				if (!this.isPointInsideLinkRect(x, y, documentOffset, matchStartOffset, lineStartOffset + match.end, matchStart, matchEnd)) {
					dbg(this.plugin.settings.debugMode ?? false, "touchstart ⏹ edge protection rejected");
					return;
				}
			}
		}

		// 排除特定链接
		const excludeMode: ExcludeMode = this.plugin.settings.excludeMode ?? "disabled";
		if (excludeMode === "click" || excludeMode === "all") {
			const keywords = parseExcludeKeywords(this.plugin.settings.excludeKeywords);
			if (matchesExcludeKeyword(match.destination, keywords)) {
				dbg(this.plugin.settings.debugMode ?? false, "touchstart ⏹ excluded by keyword");
				return;
			}
		}

		// 确认是链接 → preventDefault 阻止 Obsidian 跳转
		this.touchStartX = x;
		this.touchStartY = y;
		this.touchIntercepted = true;
		this.touchLinkContext = { match, position, markdownView, target };

		dbg(this.plugin.settings.debugMode ?? false, "touchstart ✅ preventDefault — blocking Obsidian navigation, will open popover on touchend");
		event.preventDefault();
		event.stopPropagation();
	}

	/**
	 * touchmove：如果手指移动超过阈值（拖动手势），取消本次 touch 拦截。
	 * 注意：由于 touchstart 已经 preventDefault，本次 touch 序列的滚动无法恢复，
	 * 但标记取消后 touchend 不会打开 popover。
	 */
	handleTouchMove(event: TouchEvent): void {
		if (!this.touchIntercepted) return;
		const touch = event.touches[0];
		if (!touch) return;
		const dx = Math.abs(touch.clientX - this.touchStartX);
		const dy = Math.abs(touch.clientY - this.touchStartY);
		const DRAG_THRESHOLD = 10;
		if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
			dbg(this.plugin.settings.debugMode ?? false, "touchmove ⏹ drag detected, cancelling intercept", { dx, dy });
			this.touchIntercepted = false;
			this.touchLinkContext = null;
		}
	}

	/**
	 * touchend：touchstart 确认链接 + 未被 touchmove 取消 → 打开 popover。
	 */
	handleTouchEnd(_event: TouchEvent): void {
		if (!this.touchIntercepted || !this.touchLinkContext) {
			this.touchIntercepted = false;
			this.touchLinkContext = null;
			return;
		}

		const { match, position, markdownView, target } = this.touchLinkContext;
		this.touchIntercepted = false;
		this.touchLinkContext = null;

		if (!match || !markdownView.file) return;

		const editorMatch = withEditorRange(match, position.line, markdownView.file.path);

		dbg(this.plugin.settings.debugMode ?? false, "touchend ✅ opening popover for:", match.destination);

		if (!target.isConnected) {
			new Notice(this.plugin.t("noticeClickedLinkMissing"));
			return;
		}

		this.linkEditManager.show(editorMatch, target, target);
	}

	handleClick(event: MouseEvent): Promise<void> {
		dbg(this.plugin.settings.debugMode ?? false, "click", { button: event.button, clientX: event.clientX, clientY: event.clientY, defaultPrevented: event.defaultPrevented, pointerDownIntercepted: this.pointerDownIntercepted });
		// pointerDownIntercepted：桌面 pointer 路径已在 pointerdown 阶段拦截
		const skipDefaultPreventedCheck = this.pointerDownIntercepted;
		this.pointerDownIntercepted = false;
		return this.handlePointerTriggerEvent(event, "click", skipDefaultPreventedCheck);
	}

	handleContextMenu(event: MouseEvent): Promise<void> {
		return this.handlePointerTriggerEvent(event, "contextmenu", false);
	}

	handleMouseMove(event: MouseEvent): void {
		const triggerMethod = this.plugin.settings.triggerMethod ?? "hover";
		if (triggerMethod !== "hover") return;
		if (!this.plugin.settings.enabled) return;

		// 修饰键检查
		const modifier = this.plugin.settings.triggerModifier ?? "none";
		const hasAnyModifier = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
		const modifierHeld = modifier === "none"
			? !hasAnyModifier          // 无修饰键模式：按住任何修饰键时不触发
			: (modifier === "ctrl" && (event.ctrlKey || event.metaKey))
			|| (modifier === "shift" && event.shiftKey)
			|| (modifier === "alt" && event.altKey);

		if (!modifierHeld) {
			// 未按修饰键时，清除悬浮计时并触发离开逻辑
			this.clearHoverShowTimer();
			if (this.hoveredLinkKey !== null) {
				this.hoveredLinkKey = null;
				if (this.linkEditManager.isOpen()) {
					this.scheduleHoverHide();
				}
			}
			return;
		}

		this.processHover(event);
	}

	/**
	 * hover 模式下鼠标进入 popover 区域时取消关闭计时
	 */
	cancelHoverHide(): void {
		this.clearHoverHideTimer();
	}

	/**
	 * hover 模式下鼠标离开 popover 区域时启动关闭计时
	 */
	scheduleHoverHide(): void {
		// 用户正在与 popover 交互（输入框获焦或 suggest 打开）时不关闭
		if (this.linkEditManager.isUserInteracting()) {
			return;
		}
		this.clearHoverHideTimer();
		const delay = HOVER_LEAVE_DELAY;
		this.hoverHideTimer = window.setTimeout(() => {
			// 关闭前再次检查，防止计时期间用户开始交互
			if (this.linkEditManager.isUserInteracting()) {
				return;
			}
			this.linkEditManager.close();
			this.hoveredLinkKey = null;
		}, delay);
	}

	destroy(): void {
		this.clearHoverShowTimer();
		this.clearHoverHideTimer();
	}

	private async handlePointerTriggerEvent(event: MouseEvent, eventType: "click" | "contextmenu", skipDefaultPreventedCheck: boolean): Promise<void> {
		if (!this.plugin.settings.enabled) {
			dbg(this.plugin.settings.debugMode ?? false, "handlePointerTriggerEvent ⏹ disabled");
			return;
		}
		if (!skipDefaultPreventedCheck && event.defaultPrevented) {
			dbg(this.plugin.settings.debugMode ?? false, "handlePointerTriggerEvent ⏹ defaultPrevented");
			return;
		}

		const triggerMethod = this.plugin.settings.triggerMethod ?? "hover";
		const triggerModifier = this.plugin.settings.triggerModifier ?? "none";
		dbg(this.plugin.settings.debugMode ?? false, "handlePointerTriggerEvent", { eventType, triggerMethod, triggerModifier, skipDefaultPreventedCheck });

		// ── 禁用左键原生点击 ──
		// 非 click 模式 + 启用了 disableNativeClick + 左键无修饰键 → 吞掉事件
		if (
			eventType === "click"
			&& event.button === 0
			&& triggerMethod !== "click"
			&& (this.plugin.settings.disableNativeClick ?? false)
			&& !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
		) {
			// 确认点击目标确实在编辑器链接上，才拦截
			if (this.isClickOnEditorLink(event)) {
				dbg(this.plugin.settings.debugMode ?? false, "⏹ disableNativeClick intercepted");
				event.preventDefault();
				event.stopPropagation();
				return;
			}
		}

		// hover 模式下不拦截，保留默认行为
		if (triggerMethod === "hover") {
			dbg(this.plugin.settings.debugMode ?? false, "⏹ hover mode, skip click handling");
			return;
		}
		if (triggerMethod === "click") {
			if (eventType !== "click" || event.button !== 0) {
				dbg(this.plugin.settings.debugMode ?? false, "⏹ click mode but event mismatch", { eventType, button: event.button });
				return;
			}
		}
		if (triggerMethod === "right-click" && eventType !== "contextmenu") {
			dbg(this.plugin.settings.debugMode ?? false, "⏹ right-click mode but not contextmenu");
			return;
		}

		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			dbg(this.plugin.settings.debugMode ?? false, "⏹ target not HTMLElement");
			return;
		}

		if (target.matches("img") || target.closest("img") || target.closest(".image-embed")) {
			dbg(this.plugin.settings.debugMode ?? false, "⏹ image target");
			return;
		}

		const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView?.file) { dbg(this.plugin.settings.debugMode ?? false, "⏹ no active MarkdownView/file"); return; }
		if (!markdownView.containerEl.contains(target)) { dbg(this.plugin.settings.debugMode ?? false, "⏹ target not inside MarkdownView"); return; }

		const cmEditorEl = target.closest(".cm-editor");
		if (!(cmEditorEl instanceof HTMLElement)) { dbg(this.plugin.settings.debugMode ?? false, "⏹ no .cm-editor ancestor"); return; }

		const editorView = EditorView.findFromDOM(cmEditorEl);
		if (!editorView) { dbg(this.plugin.settings.debugMode ?? false, "⏹ EditorView.findFromDOM returned null"); return; }

		const documentOffset = editorView.posAtCoords({ x: event.clientX, y: event.clientY }, false);
		dbg(this.plugin.settings.debugMode ?? false, "click posAtCoords:", { clientX: event.clientX, clientY: event.clientY, documentOffset });
		if (documentOffset == null) {
			dbg(this.plugin.settings.debugMode ?? false, "⏹ posAtCoords returned null");
			return;
		}

		// 如果当前链接在选中的文本中，不处理
		const position = markdownView.editor.offsetToPos(documentOffset);
		
		for (const sel of editorView.state.selection.ranges) {
			if (documentOffset >= sel.from && documentOffset < sel.to) {
				dbg(this.plugin.settings.debugMode ?? false, "⏹ offset is inside selection range");
				return;
			}
		}

		const lineText = markdownView.editor.getLine(position.line);
		dbg(this.plugin.settings.debugMode ?? false, "line", position.line, "ch", position.ch, JSON.stringify(lineText));
		const match = findLinkAtOffset(lineText, position.ch, this.plugin.settings);
		dbg(this.plugin.settings.debugMode ?? false, "findLinkAtOffset result:", match);

		if (!match) {
			// fallback：尝试检测 embed-block（callout 等）内的渲染链接
			const embedResult = this.resolveEmbedBlockLink(target, editorView, markdownView.file.path);
			if (!embedResult) return;

			const { editorMatch, anchorEl } = embedResult;

			// 排除检查
			const exMode: ExcludeMode = this.plugin.settings.excludeMode ?? "disabled";
			if (exMode === "click" || exMode === "all") {
				const kw = parseExcludeKeywords(this.plugin.settings.excludeKeywords);
				if (matchesExcludeKeyword(editorMatch.destination, kw)) return;
			}

			// 修饰键检查
			if (triggerModifier === "ctrl") {
				if (!(event.ctrlKey || event.metaKey)) return;
			} else if (triggerModifier === "shift") {
				if (!event.shiftKey) return;
			} else if (triggerModifier === "alt") {
				if (!event.altKey) return;
			}

			event.preventDefault();
			event.stopPropagation();

			// click + 无修饰键时，Ctrl+Click 直接打开链接
			if (triggerMethod === "click" && triggerModifier === "none" && (event.ctrlKey || event.metaKey)) {
				const values = normalizeEditableValues(editorMatch, editorMatch.displayText, editorMatch.destination);
				await openLink(this.plugin.app, editorMatch, values, this.plugin.settings);
				return;
			}

			const embedVisibleEndCh = computeVisibleEndCh(editorMatch);
			const referenceEl = triggerMethod === "right-click"
				? this.createVirtualReferenceForRange(editorView, editorMatch.range.from.line, editorMatch.range.from.ch, embedVisibleEndCh, event.clientX, event.clientY)
				: anchorEl;
			this.linkEditManager.show(editorMatch, referenceEl, anchorEl);
			return;
		}

		// 排除特定链接：click / all 模式下跳过
		const excludeMode: ExcludeMode = this.plugin.settings.excludeMode ?? "disabled";
		if (excludeMode === "click" || excludeMode === "all") {
			const keywords = parseExcludeKeywords(this.plugin.settings.excludeKeywords);
			if (matchesExcludeKeyword(match.destination, keywords)) {
				dbg(this.plugin.settings.debugMode ?? false, "⏹ excluded by keyword:", match.destination);
				return;
			}
		}

		const editorMatch = withEditorRange(match, position.line, markdownView.file.path);

		// 验证鼠标坐标是否真的在链接范围内
		const lineStartOffset = editorView.state.doc.line(position.line + 1).from;
		const matchStartOffset = lineStartOffset + match.start;
		const matchStart = editorView.coordsAtPos(matchStartOffset);
		const matchEnd = editorView.coordsAtPos(lineStartOffset + match.end);
		dbg(this.plugin.settings.debugMode ?? false, "click edgeProtection check:", { matchStart, matchEnd, clientX: event.clientX, clientY: event.clientY });

		if ((this.plugin.settings.edgeProtection ?? true) && matchStart && matchEnd) {
			const inside = this.isPointInsideLinkRect(event.clientX, event.clientY, documentOffset, matchStartOffset, lineStartOffset + match.end, matchStart, matchEnd);
			dbg(this.plugin.settings.debugMode ?? false, "isPointInsideLinkRect:", inside);
			if (!inside) {
				dbg(this.plugin.settings.debugMode ?? false, "⏹ edge protection rejected");
				return;
			}
		}

		// 修饰键检查
		if (triggerModifier === "ctrl") {
			if (!(event.ctrlKey || event.metaKey)) {
				dbg(this.plugin.settings.debugMode ?? false, "⏹ ctrl modifier not held");
				return;
			}
		} else if (triggerModifier === "shift") {
			if (!event.shiftKey) {
				dbg(this.plugin.settings.debugMode ?? false, "⏹ shift modifier not held");
				return;
			}
		} else if (triggerModifier === "alt") {
			if (!event.altKey) {
				dbg(this.plugin.settings.debugMode ?? false, "⏹ alt modifier not held");
				return;
			}
		}

		dbg(this.plugin.settings.debugMode ?? false, "✅ preventDefault + show popover, destination:", match.destination);
		event.preventDefault();
		event.stopPropagation();

		// click + 无修饰键时，Ctrl+Click 直接打开链接
		if (triggerMethod === "click" && triggerModifier === "none") {
			if (event.ctrlKey || event.metaKey) {
				const values = normalizeEditableValues(editorMatch, editorMatch.displayText, editorMatch.destination);
				await openLink(this.plugin.app, editorMatch, values, this.plugin.settings);
				return;
			}
		}

		if (!target.isConnected) {
			new Notice(this.plugin.t("noticeClickedLinkMissing"));
			return;
		}

		const virtualEndOffset = computeVisibleEndOffset(match, lineStartOffset);
		const referenceEl = triggerMethod === "right-click"
			? this.createVirtualReference(matchStartOffset, virtualEndOffset, editorView, event.clientX, event.clientY)
			: this.resolveReferenceElement(event.clientX, event.clientY, target, markdownView);
		this.linkEditManager.show(editorMatch, referenceEl, target);
	}

	private resolveReferenceElement(x: number, y: number, fallback: HTMLElement, markdownView: MarkdownView): HTMLElement {
		const pointEl = activeDocument.elementFromPoint(x, y);
		if (pointEl instanceof HTMLElement && markdownView.containerEl.contains(pointEl)) {
			return pointEl;
		}
		return fallback;
	}

	/**
	 * 判断点 (x, y) 是否在链接的可视矩形内。
	 * 支持跨行（软换行）链接：
	 * - 单行链接：检查左/右/上/下边界
	 * - 跨行链接：首行检查左边界，末行检查右边界，中间行整行命中
	 */
	private isPointInsideLinkRect(
		x: number, y: number,
		documentOffset: number,
		matchStartOffset: number, matchEndOffset: number,
		matchStart: { top: number; bottom: number; left: number; right: number },
		matchEnd: { top: number; bottom: number; left: number; right: number },
	): boolean {
		const BUFFER = 4;

		// Y 轴：超出整个链接的垂直范围则不命中
		if (y < matchStart.top || y > matchEnd.bottom) return false;

		const isMultiLine = matchEnd.top > matchStart.bottom;

		if (!isMultiLine) {
			// 单行：沿用原有逻辑
			if (Math.abs(documentOffset - matchStartOffset) <= BUFFER && x <= matchStart.left + BUFFER) return false;
			if (Math.abs(documentOffset - matchEndOffset) <= BUFFER && x >= matchEnd.right - BUFFER) return false;
			if (x > matchEnd.right) return false;
			return true;
		}

		// 跨行链接
		const onFirstLine = y <= matchStart.bottom;
		const onLastLine = y >= matchEnd.top;

		if (onFirstLine) {
			// 首行：只检查左边界（右侧延伸到行尾）
			if (Math.abs(documentOffset - matchStartOffset) <= BUFFER && x <= matchStart.left + BUFFER) return false;
			return true;
		}
		if (onLastLine) {
			// 末行：只检查右边界（左侧从行首开始）
			if (Math.abs(documentOffset - matchEndOffset) <= BUFFER && x >= matchEnd.right - BUFFER) return false;
			if (x > matchEnd.right) return false;
			return true;
		}

		// 中间行：整行都是链接内容，不检查 X 轴
		return true;
	}

	/**
	 * 快速判断点击事件是否落在编辑器内的链接上。
	 * 用于 disableNativeClick 拦截：只吞掉"点在链接上"的裸左键，不影响其他位置。
	 */
	private isClickOnEditorLink(event: MouseEvent): boolean {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return false;

		const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView?.file || !markdownView.containerEl.contains(target)) return false;

		const cmEditorEl = target.closest(".cm-editor");
		if (!(cmEditorEl instanceof HTMLElement)) return false;

		const editorView = EditorView.findFromDOM(cmEditorEl);
		if (!editorView) return false;

		const documentOffset = editorView.posAtCoords({ x: event.clientX, y: event.clientY }, false);
		if (documentOffset == null) return false;

		const position = markdownView.editor.offsetToPos(documentOffset);
		const lineText = markdownView.editor.getLine(position.line);
		return !!findLinkAtOffset(lineText, position.ch, this.plugin.settings);
	}

	private createVirtualReferenceForRange(editorView: EditorView, line: number, fromCh: number, toCh: number, fallbackX?: number, fallbackY?: number): VirtualElement {
		const lineFrom = editorView.state.doc.line(line + 1).from;
		return this.createVirtualReference(lineFrom + fromCh, lineFrom + toCh, editorView, fallbackX, fallbackY);
	}

	private createVirtualReference(from: number, to: number, editorView: EditorView, fallbackX?: number, fallbackY?: number): VirtualElement {
		const fallbackRect = (fallbackX != null && fallbackY != null)
			? new DOMRect(fallbackX, fallbackY, 1, 1)
			: new DOMRect(0, 0, 1, 1);
		let lastRect = fallbackRect;
		return {
			contextElement: editorView.dom,
			getBoundingClientRect: () => {
				const start = editorView.coordsAtPos(from);
				const end = editorView.coordsAtPos(to);
				if (start && end) {
					lastRect = new DOMRect(start.left, start.top, Math.max(1, end.right - start.left), Math.max(1, start.bottom - start.top));
				} else if (start) {
					// end 可能因 Live Preview 折叠区域在行尾而返回 null，用 start 构建矩形
					lastRect = new DOMRect(start.left, start.top, 1, Math.max(1, start.bottom - start.top));
				}
				return lastRect;
			},
		};
	}

	// ── hover 逻辑 ──────────────────────────────────────────────────────────

	private processHover(event: MouseEvent): void {
		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			this.onHoverLeaveLink();
			return;
		}

		// 鼠标在 popover 上时，不需要处理（由 popover 的 mouseenter/mouseleave 管理）
		if (this.linkEditManager.isMouseOverPopover(target)) {
			this.clearHoverHideTimer();
			return;
		}

		if (target.matches("img") || target.closest("img") || target.closest(".image-embed")) {
			this.onHoverLeaveLink();
			return;
		}

		const result = this.resolveHoverLink(event, target);
		if (!result) {
			this.onHoverLeaveLink();
			return;
		}

		const { editorMatch, targetEl } = result;
		const linkKey = `${editorMatch.sourcePath}:${editorMatch.range.from.line}:${editorMatch.range.from.ch}`;

		// 同一链接不重复处理
		if (linkKey === this.hoveredLinkKey) {
			// 仍在同一链接上，取消关闭计时
			this.clearHoverHideTimer();
			return;
		}

		// 新链接 → 重置计时
		this.clearHoverShowTimer();
		this.clearHoverHideTimer();
		this.hoveredLinkKey = linkKey;

		this.hoverShowTimer = window.setTimeout(() => {
			this.hoverShowTimer = null;
			if (!targetEl.isConnected) return;
			this.linkEditManager.show(editorMatch, targetEl);
		}, HOVER_DELAY);
	}

	private resolveHoverLink(event: MouseEvent, target: HTMLElement): { editorMatch: EditorLinkMatch; targetEl: HTMLElement } | null {
		const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView?.file || !markdownView.containerEl.contains(target)) {
			return null;
		}

		const cmEditorEl = target.closest(".cm-editor");
		if (!(cmEditorEl instanceof HTMLElement)) {
			return null;
		}

		const editorView = EditorView.findFromDOM(cmEditorEl);
		if (!editorView) {
			return null;
		}

		const documentOffset = editorView.posAtCoords({ x: event.clientX, y: event.clientY }, false);
		if (documentOffset == null) {
			return null;
		}

		const position = markdownView.editor.offsetToPos(documentOffset);
		const lineText = markdownView.editor.getLine(position.line);
		const match = findLinkAtOffset(lineText, position.ch, this.plugin.settings);

		if (!match) {
			// fallback：尝试检测 embed-block（callout 等）内的渲染链接
			const embedResult = this.resolveEmbedBlockLink(target, editorView, markdownView.file.path);
			if (!embedResult) return null;

			const { editorMatch, anchorEl } = embedResult;

			// 排除检查
			const exMode: ExcludeMode = this.plugin.settings.excludeMode ?? "disabled";
			if (exMode === "hover" || exMode === "all") {
				const kw = parseExcludeKeywords(this.plugin.settings.excludeKeywords);
				if (matchesExcludeKeyword(editorMatch.destination, kw)) return null;
			}

			return { editorMatch, targetEl: anchorEl };
		}

		// 排除特定链接：hover / all 模式下跳过
		const excludeMode: ExcludeMode = this.plugin.settings.excludeMode ?? "disabled";
		if (excludeMode === "hover" || excludeMode === "all") {
			const keywords = parseExcludeKeywords(this.plugin.settings.excludeKeywords);
			if (matchesExcludeKeyword(match.destination, keywords)) {
				return null;
			}
		}

		// 坐标验证：取链接在视图中的像素坐标
		const lineStartOffset = editorView.state.doc.line(position.line + 1).from;
		const matchStartOffset = lineStartOffset + match.start;
		const matchEndOffset = lineStartOffset + match.end;

		// Markdown 链接在 Live Preview 下 ](url) 被折叠，
		// 用可见文本结束位置（ ] 的偏移）作为右边界
		let visibleEndOffset = matchEndOffset;
		if (match.type === "markdown" || match.type === "imageMarkdown") {
			// originalText 格式: [text](url) 或 ![text](url)
			const closeBracket = match.originalText.indexOf("]");
			if (closeBracket >= 0) {
				visibleEndOffset = lineStartOffset + match.start + closeBracket + 1;
			}
		}

		const matchStart = editorView.coordsAtPos(matchStartOffset);
		const matchEnd = editorView.coordsAtPos(visibleEndOffset);

		if (matchStart && matchEnd) {
			if (event.clientY < matchStart.top || event.clientY > matchStart.bottom) {
				return null;
			}
			if (event.clientX > matchEnd.right || event.clientX < matchStart.left) {
				return null;
			}
		}

		const editorMatch = withEditorRange(match, position.line, markdownView.file.path);
		return { editorMatch, targetEl: target };
	}

	private onHoverLeaveLink(): void {
		this.clearHoverShowTimer();
		this.hoveredLinkKey = null;

		// 如果 popover 已打开，启动延迟关闭（给用户移入 popover 的时间）
		if (this.linkEditManager.isOpen()) {
			this.scheduleHoverHide();
		}
	}

	private clearHoverShowTimer(): void {
		if (this.hoverShowTimer !== null) {
			window.clearTimeout(this.hoverShowTimer);
			this.hoverShowTimer = null;
		}
	}

	private clearHoverHideTimer(): void {
		if (this.hoverHideTimer !== null) {
			window.clearTimeout(this.hoverHideTimer);
			this.hoverHideTimer = null;
		}
	}

	// ── embed-block fallback ───────────────────────────────────────────────

	/**
	 * 当标准的 posAtCoords → findLinkAtOffset 路径无法命中时（例如 callout 等
	 * cm-embed-block 内的渲染链接），从 DOM `<a>` 元素反向查找源文本中的链接。
	 *
	 * 返回 null 表示不适用或未找到。
	 */
	private resolveEmbedBlockLink(
		target: HTMLElement,
		editorView: EditorView,
		sourcePath: string,
	): { editorMatch: EditorLinkMatch; anchorEl: HTMLElement } | null {
		// 1. 找到 <a> 元素（target 本身或其祖先）
		const anchor = target.closest("a") ?? (target.matches("a") ? target : null);
		if (!anchor) return null;

		// 2. 必须在 cm-embed-block 内（callout / embed 等）
		const embedBlock = anchor.closest(".cm-embed-block");
		if (!embedBlock || !embedBlock.instanceOf(HTMLElement)) return null;

		// 3. 获取链接目标
		const href = anchor.getAttribute("data-href") ?? anchor.getAttribute("href");
		if (!href) return null;

		// 4. 用 posAtDOM 将 embed-block 映射到文档偏移
		let blockOffset: number;
		try {
			blockOffset = editorView.posAtDOM(embedBlock);
		} catch {
			return null;
		}

		const doc = editorView.state.doc;
		const blockLine = doc.lineAt(blockOffset);

		// 5. 从 embed-block 起始行往下扫描，查找 destination 匹配的链接
		//    callout 通常跨多行，需要扫描整个 block 范围
		const endOffset = Math.min(blockOffset + (embedBlock.textContent?.length ?? 0) * 4, doc.length);
		const endLine = doc.lineAt(endOffset).number;

		for (let lineNum = blockLine.number; lineNum <= endLine; lineNum++) {
			const line = doc.line(lineNum);
			const lineIndex = lineNum - 1; // editor 使用 0-based 行号
			const match = findLinkByDestination(line.text, href, this.plugin.settings);
			if (match) {
				const editorMatch = withEditorRange(match, lineIndex, sourcePath);
				return { editorMatch, anchorEl: anchor };
			}
		}

		return null;
	}
}
