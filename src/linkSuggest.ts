import { AbstractInputSuggest, App, prepareFuzzySearch, renderResults, TFile } from "obsidian";
import type { HeadingCache, SearchResult } from "obsidian";
import type { BetterLinksSettings } from "./settings";

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
	/** 原始输入中 # 之前的文件部分（用于重组 destination） */
	filePart: string;
	match: SearchResult | null;
};

export type LinkSuggestion = FileSuggestion | HeadingSuggestion;

export interface LinkSuggestCallbacks {
	/** 选中建议后，用于更新 displayText 输入框的回调 */
	setDisplayText: (value: string) => void;
	/** 选中后清除校验警告、取消 debounce */
	onSuggestionSelected: () => void;
}

export class LinkDestinationSuggest extends AbstractInputSuggest<LinkSuggestion> {
	private _active = false;
	/** 选中时临时屏蔽 input 事件触发 suggest，防止选中后下拉重开 */
	private _suppressNext = false;
	private sourcePath: string;
	private settings: BetterLinksSettings;

	constructor(
		app: App,
		private readonly inputEl: HTMLInputElement,
		sourcePath: string,
		private readonly callbacks: LinkSuggestCallbacks,
		settings: BetterLinksSettings,
	) {
		super(app, inputEl);
		this.limit = MAX_SUGGESTIONS;
		this.sourcePath = sourcePath;
		this.settings = settings;
	}

	/** 每次打开 popover 时更新上下文，复用同一实例避免重复创建 suggestion-container */
	updateContext(sourcePath: string, settings: BetterLinksSettings): void {
		this.sourcePath = sourcePath;
		this.settings = settings;
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
		if (this._suppressNext) return [];
		const hashIndex = query.indexOf("#");
		if (hashIndex >= 0) {
			return this.getHeadingSuggestions(query, hashIndex);
		}
		return this.getFileSuggestions(query);
	}

	renderSuggestion(item: LinkSuggestion, el: HTMLElement): void {
		if (item.kind === "file") {
			this.renderFileSuggestion(item, el);
		} else {
			this.renderHeadingSuggestion(item, el);
		}
	}

	selectSuggestion(item: LinkSuggestion, _evt: MouseEvent | KeyboardEvent): void {
		// ── 1. 计算 destination 值（遵循 OB 内部链接格式设置）────────────────
		let destination: string;
		let subpath: string | undefined;

		if (item.kind === "file") {
			destination = this.getDestinationPath(item.file);
		} else {
			destination = this.getDestinationPath(item.file);
			subpath = item.heading.heading;
		}

		const fullDestination = subpath ? `${destination}#${subpath}` : destination;
		this.setValue(fullDestination);

		// ── 2. 同步 displayText（按设置决定）────────────────────────────────
		const alias = this.computeAlias(item);
		if (alias !== null) {
			this.callbacks.setDisplayText(alias);
		}

		// ── 3. 先关闭下拉，再 dispatch input 事件──────────────────────────────
		// 用 _suppressNext 屏蔽本次 input 触发的 getSuggestions，防止下拉重开。
		this._suppressNext = true;
		this.close();
		this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
		// dispatch 完成后解除屏蔽（微任务队列里恢复，不影响正常后续输入）
		Promise.resolve().then(() => { this._suppressNext = false; });
		this.callbacks.onSuggestionSelected();
	}

	// ── private: rendering ───────────────────────────────────────────────────

	private renderFileSuggestion(item: FileSuggestion, el: HTMLElement): void {
		const isMarkdown = item.file.extension === "md";
		const displayName = isMarkdown ? item.file.basename : item.file.name; // name 含后缀
		const folder = item.file.parent?.path ?? "";

		if (!isMarkdown) {
			el.addClass("better-links-suggest__item--non-md");
		}

		// 主行：文件名（含高亮；非 md 显示完整 name 含后缀）
		const titleEl = el.createDiv({ cls: "better-links-suggest__title" });
		if (item.match && item.match.matches.length > 0) {
			const basenameMatch = recomputeMatchForBasename(item.file.path, displayName, item.match);
			if (basenameMatch) {
				renderResults(titleEl, displayName, basenameMatch);
			} else {
				titleEl.setText(displayName);
			}
		} else {
			titleEl.setText(displayName);
		}

		// 副行：文件夹路径（小字）
		if (folder && folder !== "/") {
			el.createDiv({ cls: "better-links-suggest__path", text: folder });
		}
	}

	private renderHeadingSuggestion(item: HeadingSuggestion, el: HTMLElement): void {
		const prefix = "#".repeat(item.heading.level) + " ";
		const headingText = item.heading.heading;

		// 主行：标题（含层级前缀）
		const titleEl = el.createDiv({ cls: "better-links-suggest__title" });
		const prefixSpan = titleEl.createSpan({ cls: "better-links-suggest__heading-prefix", text: prefix });
		prefixSpan.style.opacity = "0.5";
		const textSpan = titleEl.createSpan();
		if (item.match && item.match.matches.length > 0) {
			renderResults(textSpan, headingText, item.match);
		} else {
			textSpan.setText(headingText);
		}

		// 副行：文件名（小字）
		el.createDiv({ cls: "better-links-suggest__path", text: item.file.basename });
	}

	// ── private: alias computation ───────────────────────────────────────────

	/**
	 * 根据设置计算选中后应填入 displayText 的别名。
	 * 返回 null 表示不修改 displayText。
	 */
	private computeAlias(item: LinkSuggestion): string | null {
		if (!(this.settings.syncAlias ?? false)) return null;

		const mode = this.settings.aliasSyncMode ?? "heading-only";
		const sep = this.settings.aliasSeparator ?? " > ";

		if (item.kind === "file") {
			// 选中的是文件（无标题），别名为文件的展示名
			const fileName = this.getDisplayName(item.file);
			return fileName;
		}

		// 选中的是标题
		const headingText = item.heading.heading;
		const fileName = this.getDisplayName(item.file);

		switch (mode) {
			case "heading-only":
				return headingText;
			case "filename-then-heading":
				return `${fileName}${sep}${headingText}`;
			case "heading-then-filename":
				return `${headingText}${sep}${fileName}`;
		}
	}

	/**
	 * 获取文件的展示名：优先读 frontmatter 中指定属性，fallback 到 basename。
	 */
	private getDisplayName(file: TFile): string {
		const propertyKey = this.settings.aliasTitleProperty ?? "title";
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const titleFromFm = fm?.[propertyKey];
		if (typeof titleFromFm === "string" && titleFromFm.trim()) {
			return titleFromFm.trim();
		}
		return file.basename;
	}

	// ── private: destination path ────────────────────────────────────────────

	/**
	 * 生成遵循 OB 内部链接格式设置的 destination 路径字符串。
	 * 使用 generateMarkdownLink 生成完整链接，再从中提取路径部分。
	 */
	private getDestinationPath(file: TFile): string {
		// generateMarkdownLink 返回如 [[path]]、[[path|alias]]、[alias](path) 等
		const fullLink = this.app.fileManager.generateMarkdownLink(file, this.sourcePath);

		// 提取 wikilink 格式：[[path]] or [[path|alias]]
		const wikiMatch = /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/.exec(fullLink);
		if (wikiMatch) {
			return wikiMatch[1] ?? file.path;
		}

		// 提取 markdown 格式：[text](path) or [](path)
		const mdMatch = /^\[.*?\]\(([^)]+)\)$/.exec(fullLink);
		if (mdMatch) {
			return mdMatch[1] ?? file.path;
		}

		// fallback: 直接用完整路径
		return file.path;
	}

	// ── private: suggestions ─────────────────────────────────────────────────

	private getFileSuggestions(query: string): LinkSuggestion[] {
		// vault.getFiles() 返回所有文件（含非 md），vault.getMarkdownFiles() 只返回 md
		const files = this.app.vault.getFiles();

		if (!query) {
			return files
				.slice()
				.sort((a, b) => a.path.localeCompare(b.path))
				.slice(0, MAX_SUGGESTIONS)
				.map((file) => ({ kind: "file" as const, file, match: null }));
		}

		const search = prepareFuzzySearch(query);
		const results: FileSuggestion[] = [];

		for (const file of files) {
			// 同时对 path 和 basename 做匹配，取更高分
			const matchPath = search(file.path);
			const matchBasename = search(file.basename);
			const match = betterMatch(matchPath, matchBasename);
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

		const file = this.app.metadataCache.getFirstLinkpathDest(filePart, this.sourcePath);
		if (!file) return [];

		const headings = this.app.metadataCache.getFileCache(file)?.headings ?? [];
		if (headings.length === 0) return [];

		if (!headingQuery) {
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

// ── helpers ──────────────────────────────────────────────────────────────────

/** 返回两个 SearchResult 中分数更高的那个（或唯一非 null 的那个）。 */
function betterMatch(a: SearchResult | null, b: SearchResult | null): SearchResult | null {
	if (!a && !b) return null;
	if (!a) return b;
	if (!b) return a;
	return a.score >= b.score ? a : b;
}

/**
 * 将针对完整路径的 SearchResult 偏移到 basename 上。
 * 如果 matches 都在 basename 范围内，返回重新偏移的结果；否则返回 null（让调用方 fallback 到纯文字）。
 */
function recomputeMatchForBasename(
	fullPath: string,
	basename: string,
	result: SearchResult,
): SearchResult | null {
	const offset = fullPath.length - basename.length;
	if (offset < 0) return null;

	const shifted = result.matches
		.map(([start, end]) => [start - offset, end - offset] as [number, number])
		.filter(([start, end]) => start >= 0 && end <= basename.length);

	if (shifted.length === 0) return null;
	return { score: result.score, matches: shifted };
}
