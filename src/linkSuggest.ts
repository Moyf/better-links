import { AbstractInputSuggest, App, prepareFuzzySearch, renderResults, TFile } from "obsidian";
import type { HeadingCache, SearchResult } from "obsidian";
import { shouldUseWikiLinkFormat } from "./linkActions";

const MAX_SUGGESTIONS = 20;

type FileSuggestion = {
	kind: "file";
	file: TFile;
	match: SearchResult | null;
};

type HeadingSuggestion = {
	kind: "heading";
	file: TFile;
	heading: HeadingCache;
	filePart: string;
	match: SearchResult | null;
};

export type LinkSuggestion = FileSuggestion | HeadingSuggestion;

export class LinkDestinationSuggest extends AbstractInputSuggest<LinkSuggestion> {
	private _active = false;

	constructor(
		app: App,
		private readonly inputEl: HTMLInputElement,
		private readonly sourcePath: string,
		private readonly onSuggestionSelected: () => void,
	) {
		super(app, inputEl);
		this.limit = MAX_SUGGESTIONS;
	}

	get isActive(): boolean {
		return this._active;
	}

	open(): void {
		this._active = true;
		super.open();
	}

	close(): void {
		this._active = false;
		super.close();
	}

	getSuggestions(query: string): LinkSuggestion[] {
		const hashIndex = query.indexOf("#");

		if (hashIndex >= 0) {
			return this.getHeadingSuggestions(query, hashIndex);
		}

		return this.getFileSuggestions(query);
	}

	renderSuggestion(item: LinkSuggestion, el: HTMLElement): void {
		if (item.kind === "file") {
			if (item.match && item.match.matches.length > 0) {
				renderResults(el, item.file.path, item.match);
			} else {
				el.setText(item.file.path);
			}
			return;
		}

		// heading
		const prefix = "#".repeat(item.heading.level) + " ";
		const fullText = prefix + item.heading.heading;
		if (item.match && item.match.matches.length > 0) {
			// offset by prefix length so highlights land on the heading text
			renderResults(el, fullText, item.match, prefix.length);
		} else {
			el.setText(fullText);
		}
	}

	selectSuggestion(item: LinkSuggestion, _evt: MouseEvent | KeyboardEvent): void {
		let value: string;

		if (item.kind === "file") {
			// Use shortest unambiguous path: strip .md when wikilink format is active
			value = shouldUseWikiLinkFormat(this.app)
				? item.file.path.replace(/\.md$/i, "")
				: item.file.path;
		} else {
			// heading: reassemble file part + # + heading
			const filePart = shouldUseWikiLinkFormat(this.app)
				? item.filePart.replace(/\.md$/i, "")
				: item.filePart;
			value = `${filePart}#${item.heading.heading}`;
		}

		this.setValue(value);
		// Dispatch native input event so the existing onDestinationInput / debounce-validation pipeline triggers
		this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
		this.onSuggestionSelected();
		this.close();
	}

	// ── private helpers ──────────────────────────────────────────────────────

	private getFileSuggestions(query: string): LinkSuggestion[] {
		const files = this.app.vault.getMarkdownFiles();

		if (!query) {
			// Empty query: return first MAX_SUGGESTIONS alphabetically
			return files
				.slice()
				.sort((a, b) => a.path.localeCompare(b.path))
				.slice(0, MAX_SUGGESTIONS)
				.map((file) => ({ kind: "file" as const, file, match: null }));
		}

		const search = prepareFuzzySearch(query);
		const results: FileSuggestion[] = [];

		for (const file of files) {
			const match = search(file.path);
			if (match) {
				results.push({ kind: "file", file, match });
			}
		}

		results.sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
		return results.slice(0, MAX_SUGGESTIONS);
	}

	private getHeadingSuggestions(query: string, hashIndex: number): LinkSuggestion[] {
		const filePart = query.slice(0, hashIndex);
		const headingQuery = query.slice(hashIndex + 1);

		// Resolve file — requires at least some file part to attempt
		const file = this.app.metadataCache.getFirstLinkpathDest(filePart, this.sourcePath);
		if (!file) return [];

		const headings = this.app.metadataCache.getFileCache(file)?.headings ?? [];
		if (headings.length === 0) return [];

		if (!headingQuery) {
			// No heading query yet: show all headings in document order
			return headings.slice(0, MAX_SUGGESTIONS).map((heading) => ({
				kind: "heading" as const,
				file,
				heading,
				filePart,
				match: null,
			}));
		}

		const search = prepareFuzzySearch(headingQuery);
		const results: HeadingSuggestion[] = [];

		for (const heading of headings) {
			const match = search(heading.heading);
			if (match) {
				results.push({ kind: "heading", file, heading, filePart, match });
			}
		}

		results.sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
		return results.slice(0, MAX_SUGGESTIONS);
	}
}
