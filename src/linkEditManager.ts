import { MarkdownView, Notice } from "obsidian";
import type BetterLinksPlugin from "./main";
import { copyMarkdown, copyUrl, buildDeletionText, normalizeEditableValues, openLink } from "./linkActions";
import { serializeEditedLink, type EditorLinkMatch } from "./linkDetector";
import { PopoverEditor } from "./popoverEditor";

interface ActiveSession {
	match: EditorLinkMatch;
	referenceEl: HTMLElement;
}

export class LinkEditManager {
	private readonly popoverEditor: PopoverEditor;
	private activeSession: ActiveSession | null = null;

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
				void copyUrl(destination);
			},
			onDelete: () => {
				this.deleteCurrentLink();
			},
			onClose: () => {
				this.saveAndClose();
			},
		}, this.plugin.t.bind(this.plugin));
	}

	isOpen(): boolean {
		return this.popoverEditor.isOpen();
	}

	show(match: EditorLinkMatch, referenceEl: HTMLElement): void {
		this.activeSession = { match, referenceEl };
		this.popoverEditor.open(referenceEl, {
			displayText: match.displayText,
			destination: match.destination,
			typeLabel: linkTypeLabel(match.type, this.plugin),
		});
	}

	close(): void {
		this.saveAndClose();
	}

	destroy(): void {
		this.activeSession = null;
		this.popoverEditor.destroy();
	}

	/** Auto-save current edits then close the popover. */
	private saveAndClose(): void {
		if (this.activeSession && this.popoverEditor.isOpen()) {
			const { displayText, destination } = this.popoverEditor.getValues();
			this.save(displayText, destination, true);
		}
		this.activeSession = null;
		this.popoverEditor.close();
	}

	private save(displayText: string, destination: string, silent = false): void {
		const session = this.activeSession;
		if (!session) return;

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
		await copyMarkdown(session.match, values);
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
}

function linkTypeLabel(type: EditorLinkMatch["type"], plugin: BetterLinksPlugin): string {
	if (type === "wiki") {
		return plugin.t("typeLabelWiki");
	}

	if (type === "markdown") {
		return plugin.t("typeLabelMarkdown");
	}

	return plugin.t("typeLabelUrl");
}