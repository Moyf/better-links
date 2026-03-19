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

	handlePointerDown(event: PointerEvent): Promise<void> {
		return this.handleEvent(event);
	}

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

		const position = markdownView.editor.offsetToPos(documentOffset);
		const lineText = markdownView.editor.getLine(position.line);
		const match =
			findLinkAtOffset(lineText, position.ch, this.plugin.settings) ??
			(position.ch > 0 ? findLinkAtOffset(lineText, position.ch - 1, this.plugin.settings) : null);

		if (!match) {
			return;
		}

		const editorMatch = withEditorRange(match, position.line, markdownView.file.path);

		event.preventDefault();
		event.stopPropagation();

		if (event.ctrlKey || event.metaKey) {
			const values = normalizeEditableValues(editorMatch, editorMatch.displayText, editorMatch.destination);
			await openLink(this.plugin.app, editorMatch, values, this.plugin.settings);
			return;
		}

		if (!target.isConnected) {
			new Notice("The clicked link is no longer available.");
			return;
		}

		this.linkEditManager.show(editorMatch, target);
	}
}