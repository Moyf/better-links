import { EditorView } from "@codemirror/view";
import { MarkdownView, Notice } from "obsidian";
import type BetterLinksPlugin from "./main";
import { findLinkAtOffset, withEditorRange, type EditorLinkMatch } from "./linkDetector";
import type { LinkEditManager } from "./linkEditManager";
import { normalizeEditableValues, openLink } from "./linkActions";

/** 悬浮触发的延迟（ms） */
const HOVER_DELAY = 300;
/** 鼠标离开链接/popover 后关闭的延迟（ms） */
const HOVER_LEAVE_DELAY = 500;

export class LinkInterceptor {
	/** hover 模式：延迟显示定时器 */
	private hoverShowTimer: ReturnType<typeof setTimeout> | null = null;
	/** hover 模式：延迟关闭定时器 */
	private hoverHideTimer: ReturnType<typeof setTimeout> | null = null;
	/** hover 模式：当前悬停链接的序列化 key（用于判断是否同一个链接） */
	private hoveredLinkKey: string | null = null;

	constructor(
		private readonly plugin: BetterLinksPlugin,
		private readonly linkEditManager: LinkEditManager,
	) {}

	handleClick(event: MouseEvent): Promise<void> {
		return this.handleClickEvent(event);
	}

	handleMouseMove(event: MouseEvent): void {
		const triggerMode = this.plugin.settings.triggerMode ?? "click";
		if (triggerMode !== "hover") return;
		if (!this.plugin.settings.enabled) return;

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

	private async handleClickEvent(event: MouseEvent): Promise<void> {
		if (!this.plugin.settings.enabled || event.button !== 0 || event.defaultPrevented) {
			return;
		}

		const triggerMode = this.plugin.settings.triggerMode ?? "click";

		// hover 模式下点击不拦截，保留默认行为
		if (triggerMode === "hover") {
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
			return;
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

		if (triggerMode === "ctrl-click") {
			if (!(event.ctrlKey || event.metaKey)) {
				return;
			}
		} else if (triggerMode === "shift-click") {
			if (!event.shiftKey) {
				return;
			}
		}

		event.preventDefault();
		event.stopPropagation();

		if (triggerMode === "click") {
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

		this.linkEditManager.show(editorMatch, target);
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
			return null;
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
}
