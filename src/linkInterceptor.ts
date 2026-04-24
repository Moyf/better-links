import { EditorView } from "@codemirror/view";
import type { VirtualElement } from "@popperjs/core";
import { MarkdownView, Notice } from "obsidian";
import type BetterLinksPlugin from "./main";
import { findLinkAtOffset, findLinkByDestination, withEditorRange, type EditorLinkMatch } from "./linkDetector";
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

export class LinkInterceptor {
	/** hover 模式：延迟显示定时器 */
	private hoverShowTimer: ReturnType<typeof setTimeout> | null = null;
	/** hover 模式：延迟关闭定时器 */
	private hoverHideTimer: ReturnType<typeof setTimeout> | null = null;
	/** hover 模式：当前悬停链接的序列化 key（用于判断是否同一个链接） */
	private hoveredLinkKey: string | null = null;
	/** pointerdown 拦截成功标记，用于让后续 click 事件配合 preventDefault */
	private pointerDownIntercepted = false;

	constructor(
		private readonly plugin: BetterLinksPlugin,
		private readonly linkEditManager: LinkEditManager,
	) {}

	/**
	 * pointerdown capture：在移动端 Obsidian 处理链接跳转之前抢先拦截。
	 * 仅在 click 触发模式下生效——标记此次交互已被插件接管，
	 * 后续 click 事件中根据标记完成打开 popover 的实际逻辑。
	 */
	handlePointerDown(event: PointerEvent): void {
		this.pointerDownIntercepted = false;

		if (!this.plugin.settings.enabled) return;
		const triggerMethod = this.plugin.settings.triggerMethod ?? "hover";
		if (triggerMethod !== "click") return;
		// 移动端触屏 event.button 可能为 -1，用 pointerType 区分触屏与右键
		// 只处理 mouse 左键（button === 0）和 touch（button === -1 或 0）
		if (event.button > 0) return;

		// disableNativeClick 的裸左键拦截也需要在 pointerdown 阶段处理
		// （否则移动端 Obsidian 会在 click 之前就完成跳转）

		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		if (target.matches("img") || target.closest("img") || target.closest(".image-embed")) return;

		const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView?.file || !markdownView.containerEl.contains(target)) return;

		const cmEditorEl = target.closest(".cm-editor");
		if (!(cmEditorEl instanceof HTMLElement)) return;

		const editorView = EditorView.findFromDOM(cmEditorEl);
		if (!editorView) return;

		// 移动端触屏：优先用 target 元素的中心坐标做 fallback，
		// 避免 clientX/Y 在 pointerdown 时精度不足
		const x = event.clientX || (target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2);
		const y = event.clientY || (target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2);

		const documentOffset = editorView.posAtCoords({ x, y }, false);
		if (documentOffset == null) return;

		const position = markdownView.editor.offsetToPos(documentOffset);
		const lineText = markdownView.editor.getLine(position.line);
		const match = findLinkAtOffset(lineText, position.ch, this.plugin.settings);
		if (!match) return;

		// edgeProtection：验证鼠标坐标是否真的在链接可视区域内
		// 与 handlePointerTriggerEvent 中的逻辑一致，避免点击行尾空白时误拦截
		if (this.plugin.settings.edgeProtection ?? true) {
			const lineStartOffset = editorView.state.doc.line(position.line + 1).from;
			const matchStartOffset = lineStartOffset + match.start;
			const matchStart = editorView.coordsAtPos(matchStartOffset);
			const matchEnd = editorView.coordsAtPos(lineStartOffset + match.end);
			if (matchStart && matchEnd) {
				const LEFT_BUFFER = 4;
				const RIGHT_BUFFER = 4;
				if (Math.abs(documentOffset - matchStartOffset) <= LEFT_BUFFER && x <= matchStart.left + LEFT_BUFFER) return;
				if (Math.abs(documentOffset - (lineStartOffset + match.end)) <= RIGHT_BUFFER && x >= matchEnd.right - RIGHT_BUFFER) return;
				if (y < matchStart.top || y > matchStart.bottom) return;
				if (x > matchEnd.right) return;
			}
		}

		// 确认点在链接上 → 抢先 prevent，阻止 Obsidian 原生跳转
		event.preventDefault();
		event.stopPropagation();
		this.pointerDownIntercepted = true;
	}

	handleClick(event: MouseEvent): Promise<void> {
		// 如果 pointerdown 已抢先拦截，click 事件的 defaultPrevented 可能为 true，
		// 需要跳过 defaultPrevented 检查，让后续逻辑正常执行
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
		this.hoverHideTimer = setTimeout(() => {
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
			return;
		}
		if (!skipDefaultPreventedCheck && event.defaultPrevented) {
			return;
		}

		const triggerMethod = this.plugin.settings.triggerMethod ?? "hover";
		const triggerModifier = this.plugin.settings.triggerModifier ?? "none";

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
				event.preventDefault();
				event.stopPropagation();
				return;
			}
		}

		// hover 模式下不拦截，保留默认行为
		if (triggerMethod === "hover") {
			return;
		}
		if (triggerMethod === "click") {
			if (eventType !== "click" || event.button !== 0) {
				return;
			}
		}
		if (triggerMethod === "right-click" && eventType !== "contextmenu") {
			return;
		}

		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}

		if (target.matches("img") || target.closest("img") || target.closest(".image-embed")) {
			return;
		}

		const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView?.file || !markdownView.containerEl.contains(target)) {
			return;
		}

		const cmEditorEl = target.closest(".cm-editor");
		if (!(cmEditorEl instanceof HTMLElement)) {
			return;
		}

		const editorView = EditorView.findFromDOM(cmEditorEl);
		if (!editorView) {
			return;
		}

		const documentOffset = editorView.posAtCoords({ x: event.clientX, y: event.clientY }, false);
		if (documentOffset == null) {
			return;
		}

		// 如果当前链接在选中的文本中，不处理
		const position = markdownView.editor.offsetToPos(documentOffset);
		
		for (const sel of editorView.state.selection.ranges) {
			if (documentOffset >= sel.from && documentOffset < sel.to) {
				return;
			}
		}

		const lineText = markdownView.editor.getLine(position.line);
		const match = findLinkAtOffset(lineText, position.ch, this.plugin.settings);

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

			const referenceEl = triggerMethod === "right-click"
				? this.createVirtualReferenceForRange(editorView, editorMatch.range.from.line, editorMatch.range.from.ch, editorMatch.range.to.ch)
				: anchorEl;
			this.linkEditManager.show(editorMatch, referenceEl, anchorEl);
			return;
		}

		// 排除特定链接：click / all 模式下跳过
		const excludeMode: ExcludeMode = this.plugin.settings.excludeMode ?? "disabled";
		if (excludeMode === "click" || excludeMode === "all") {
			const keywords = parseExcludeKeywords(this.plugin.settings.excludeKeywords);
			if (matchesExcludeKeyword(match.destination, keywords)) {
				return;
			}
		}

		const editorMatch = withEditorRange(match, position.line, markdownView.file.path);

		// 验证鼠标坐标是否真的在链接范围内
		const lineStartOffset = editorView.state.doc.line(position.line + 1).from;
		const matchStartOffset = lineStartOffset + match.start;
		const matchStart = editorView.coordsAtPos(matchStartOffset);
		const matchEnd = editorView.coordsAtPos(lineStartOffset + match.end);

		if ((this.plugin.settings.edgeProtection ?? true) && matchStart && matchEnd) {
			const LEFT_BUFFER = 4;
            const RIGHT_BUFFER = 4;
			if (Math.abs(documentOffset - matchStartOffset) <= LEFT_BUFFER && event.clientX <= matchStart.left + LEFT_BUFFER) {
				return;
			}
            if (Math.abs(documentOffset - (lineStartOffset + match.end)) <= RIGHT_BUFFER && event.clientX >= matchEnd.right - RIGHT_BUFFER) {
                return;
            }
			if (event.clientY < matchStart.top || event.clientY > matchStart.bottom) {
				return;
			}
			if (event.clientX > matchEnd.right) {
				return;
			}
		}

		// 修饰键检查
		if (triggerModifier === "ctrl") {
			if (!(event.ctrlKey || event.metaKey)) {
				return;
			}
		} else if (triggerModifier === "shift") {
			if (!event.shiftKey) {
				return;
			}
		} else if (triggerModifier === "alt") {
			if (!event.altKey) {
				return;
			}
		}

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

		const referenceEl = triggerMethod === "right-click"
			? this.createVirtualReference(matchStartOffset, lineStartOffset + match.end, editorView)
			: this.resolveReferenceElement(event, target, markdownView);
		this.linkEditManager.show(editorMatch, referenceEl, target);
	}

	private resolveReferenceElement(event: MouseEvent, fallback: HTMLElement, markdownView: MarkdownView): HTMLElement {
		const pointEl = document.elementFromPoint(event.clientX, event.clientY);
		if (pointEl instanceof HTMLElement && markdownView.containerEl.contains(pointEl)) {
			return pointEl;
		}
		return fallback;
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

	private createVirtualReferenceForRange(editorView: EditorView, line: number, fromCh: number, toCh: number): VirtualElement {
		const lineFrom = editorView.state.doc.line(line + 1).from;
		return this.createVirtualReference(lineFrom + fromCh, lineFrom + toCh, editorView);
	}

	private createVirtualReference(from: number, to: number, editorView: EditorView): VirtualElement {
		let lastRect = new DOMRect(0, 0, 1, 1);
		return {
			contextElement: editorView.dom,
			getBoundingClientRect: () => {
				const start = editorView.coordsAtPos(from);
				const end = editorView.coordsAtPos(to);
				if (start && end) {
					lastRect = new DOMRect(start.left, start.top, Math.max(1, end.right - start.left), Math.max(1, start.bottom - start.top));
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

		this.hoverShowTimer = setTimeout(() => {
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
			clearTimeout(this.hoverShowTimer);
			this.hoverShowTimer = null;
		}
	}

	private clearHoverHideTimer(): void {
		if (this.hoverHideTimer !== null) {
			clearTimeout(this.hoverHideTimer);
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
		if (!embedBlock || !(embedBlock instanceof HTMLElement)) return null;

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
		const endOffset = Math.min(blockOffset + embedBlock.textContent!.length * 4, doc.length);
		const endLine = doc.lineAt(endOffset).number;

		for (let lineNum = blockLine.number; lineNum <= endLine; lineNum++) {
			const line = doc.line(lineNum);
			const lineIndex = lineNum - 1; // editor 使用 0-based 行号
			const match = findLinkByDestination(line.text, href, this.plugin.settings);
			if (match) {
				const editorMatch = withEditorRange(match, lineIndex, sourcePath);
				return { editorMatch, anchorEl: anchor as HTMLElement };
			}
		}

		return null;
	}
}
