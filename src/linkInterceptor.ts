import { EditorView } from "@codemirror/view";
import { MarkdownView, Notice } from "obsidian";
import type BetterLinksPlugin from "./main";
import { findLinkAtOffset, withEditorRange } from "./linkDetector";
import type { LinkEditManager } from "./linkEditManager";
import { normalizeEditableValues, openLink } from "./linkActions";

export class LinkInterceptor {
	constructor(
		private readonly plugin: BetterLinksPlugin,
		private readonly linkEditManager: LinkEditManager,
	) {}

	handleClick(event: MouseEvent): Promise<void> {
		return this.handleEvent(event);
	}

	private async handleEvent(event: MouseEvent | PointerEvent): Promise<void> {
		if (!this.plugin.settings.enabled || event.button !== 0 || event.defaultPrevented) {
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
			// 检查点击位置（文档偏移）是否在任何选中範圍内
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

		// 验证鼠标坐标是否真的在链接范围内（坐标验证需要视图 DOM 就绪，可能为 null）
		const lineStartOffset = editorView.state.doc.line(position.line + 1).from;
		const matchStartOffset = lineStartOffset + match.start;
		const matchStart = editorView.coordsAtPos(matchStartOffset);
		const matchEnd = editorView.coordsAtPos(lineStartOffset + match.end);

		// 边界保护：受设置控制；若视图坐标暂不可用则跳过坐标验证
		if ((this.plugin.settings.edgeProtection ?? true) && matchStart && matchEnd) {
			// 左侧缓冲区：4px 内点击视为插入，不弹窗
			const LEFT_BUFFER = 4;
            const RIGHT_BUFFER = 4;
			if (Math.abs(documentOffset - matchStartOffset) <= LEFT_BUFFER && event.clientX <= matchStart.left + LEFT_BUFFER) {
				return;
			}
            if (Math.abs(documentOffset - (lineStartOffset + match.end)) <= RIGHT_BUFFER && event.clientX >= matchEnd.right - RIGHT_BUFFER) {
                return;
            }
			// 鼠标 Y 坐标必须在链接行高范围内
			if (event.clientY < matchStart.top || event.clientY > matchStart.bottom) {
				return;
			}
			// 鼠标 X 坐标不能超过链接右边界
			if (event.clientX > matchEnd.right) {
				return;
			}
		}

		event.preventDefault();
		event.stopPropagation();

		if (event.ctrlKey || event.metaKey) {
			const values = normalizeEditableValues(editorMatch, editorMatch.displayText, editorMatch.destination);
			await openLink(this.plugin.app, editorMatch, values, this.plugin.settings);
			return;
		}

		if (!target.isConnected) {
			new Notice(this.plugin.t("noticeClickedLinkMissing"));
			return;
		}

		this.linkEditManager.show(editorMatch, target);
	}
}