import { AbstractInputSuggest, App, prepareFuzzySearch, renderResults, TFile } from "obsidian";
import type { HeadingCache, SearchResult } from "obsidian";
import type { BetterLinksSettings } from "./settings";
import { compareRecentFileSuggestions, compareSearchFileSuggestions, isExcludedFile } from "./suggestionOrder";

const MAX_SUGGESTIONS = 20;

type FileSuggestion = {
	kind: "file";
	file: TFile;
	match: SearchResult | null;
	excluded: boolean;
	matchRank: number;
	/** 当本条建议是通过 alias 命中时，这里记录命中的那个 alias 字符串。
	 *  此时 match 是对 alias 的 fuzzy 结果（用于主标题高亮）。 */
	matchedAlias?: string;
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
		const isSameFile = item.file.path === this.sourcePath;

		if (item.kind === "file") {
			destination = this.getDestinationPath(item.file);
		} else {
			// 当前笔记内的标题：使用 #heading 格式，省略笔记名
			destination = isSameFile ? "" : this.getDestinationPath(item.file);
			subpath = item.heading.heading;
		}

		const fullDestination = subpath ? `${destination}#${subpath}` : destination;
		this.setValue(fullDestination);

		// ── 2. 同步 displayText（按设置决定）────────────────────────────────
		const alias = this.computeAlias(item, isSameFile);
		if (alias !== null) {
			this.callbacks.setDisplayText(alias);
		}

		// ── 3. 先关闭下拉，再 dispatch input 事件──────────────────────────────
		// 用 _suppressNext 屏蔽本次 input 触发的 getSuggestions，防止下拉重开。
		this._suppressNext = true;
		this.close();
		this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
		// dispatch 完成后解除屏蔽（微任务队列里恢复，不影响正常后续输入）
		void Promise.resolve().then(() => { this._suppressNext = false; });
		this.callbacks.onSuggestionSelected();
	}

	// ── private: rendering ───────────────────────────────────────────────────

	private renderFileSuggestion(item: FileSuggestion, el: HTMLElement): void {
		const isMarkdown = item.file.extension === "md";
		const basenameDisplay = isMarkdown ? item.file.basename : item.file.name; // name 含后缀
		const folder = item.file.parent?.path ?? "";

		if (!isMarkdown) {
			el.addClass("better-links-suggest__item--non-md");
		}

		const titleEl = el.createDiv({ cls: "better-links-suggest__title" });

		if (item.matchedAlias !== undefined) {
			// 通过 alias 命中：主行显示 alias（高亮），副行显示 basename + folder
			el.addClass("better-links-suggest__item--alias");
			if (item.match && item.match.matches.length > 0) {
				renderResults(titleEl, item.matchedAlias, item.match);
			} else {
				titleEl.setText(item.matchedAlias);
			}

			// 副行：basename — folder（用 emdash / 中点分隔；这里用 "·"）
			const subText = folder && folder !== "/" ? `${basenameDisplay} · ${folder}` : basenameDisplay;
			el.createDiv({ cls: "better-links-suggest__path", text: subText });
			return;
		}

		// 主行：文件名（含高亮；非 md 显示完整 name 含后缀）
		if (item.match && item.match.matches.length > 0) {
			const basenameMatch = recomputeMatchForBasename(item.file.path, basenameDisplay, item.match);
			if (basenameMatch) {
				renderResults(titleEl, basenameDisplay, basenameMatch);
			} else {
				titleEl.setText(basenameDisplay);
			}
		} else {
			titleEl.setText(basenameDisplay);
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
		prefixSpan.addClass("better-links-suggest__heading-prefix--dim");
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
	private computeAlias(item: LinkSuggestion, isSameFile = false): string | null {
		if (!(this.settings.syncAlias ?? false)) return null;

		const mode = this.settings.aliasSyncMode ?? "heading-only";
		const sep = this.settings.aliasSeparator ?? " > ";

		if (item.kind === "file") {
			// 通过 frontmatter alias 命中：直接用该 alias 作 displayText
			if (item.matchedAlias !== undefined) {
				return item.matchedAlias;
			}
			// 选中的是文件（无标题），别名为文件的展示名
			const fileName = this.getDisplayName(item.file);
			return fileName;
		}

		// 选中的是标题
		const headingText = item.heading.heading;

		// 当前笔记内的标题：只用标题本身，不拼接笔记名
		if (isSameFile) {
			return headingText;
		}

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
		const titleFromFm: unknown = fm?.[propertyKey];
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
		const recentFileRanks = new Map(
			this.app.workspace.getLastOpenFiles().map((path, index) => [path, index]),
		);

		if (!query) {
			return files
				.map((file) => ({
					kind: "file" as const,
					file,
					match: null,
					excluded: isExcludedFile(this.app.metadataCache, file),
					matchRank: 0,
				}))
				.sort((a, b) => compareRecentFileSuggestions(a, b, recentFileRanks))
				.slice(0, MAX_SUGGESTIONS);
		}

		const search = prepareFuzzySearch(query);
		const normalizedQuery = query.toLowerCase();
		const results: FileSuggestion[] = [];

		for (const file of files) {
			const excluded = isExcludedFile(this.app.metadataCache, file);
			// basename 命中优先于 path-only 命中，避免目录中的零散字符抬高无关文件。
			const matchBasename = search(file.basename);
			const nameMatch = matchBasename ?? search(file.path);
			const nameMatchRank = matchBasename ? getMatchRank(normalizedQuery, file.basename) : 6;

			// 通过 metadataCache 检索 aliases，挑出分数最高的命中 alias
			const aliasHit = this.findBestAliasMatch(file, search);

			// 同等匹配质量下 basename 优先于 alias；质量相同时再比较 fuzzy score。
			const aliasMatchRank = aliasHit ? getMatchRank(normalizedQuery, aliasHit.alias) + 1 : Number.POSITIVE_INFINITY;
			if (aliasHit && (!nameMatch
				|| aliasMatchRank < nameMatchRank
				|| (aliasMatchRank === nameMatchRank && aliasHit.match.score > nameMatch.score))) {
				results.push({
					kind: "file",
					file,
					match: aliasHit.match,
					excluded,
					matchRank: aliasMatchRank,
					matchedAlias: aliasHit.alias,
				});
			} else if (nameMatch) {
				results.push({ kind: "file", file, match: nameMatch, excluded, matchRank: nameMatchRank });
			}
		}

		results.sort((a, b) => compareSearchFileSuggestions(a, b, recentFileRanks));
		return results.slice(0, MAX_SUGGESTIONS);
	}

	/**
	 * 从文件 frontmatter.aliases 中找出与 query 最佳匹配的别名。
	 * aliases 字段允许是 string 或 string[]（OB 标准）。
	 */
	private findBestAliasMatch(
		file: TFile,
		search: (text: string) => SearchResult | null,
	): { alias: string; match: SearchResult } | null {
		const aliases = readAliases(this.app.metadataCache.getFileCache(file)?.frontmatter);
		if (aliases.length === 0) return null;

		let best: { alias: string; match: SearchResult } | null = null;
		for (const alias of aliases) {
			const m = search(alias);
			if (!m) continue;
			if (!best || m.score > best.match.score) {
				best = { alias, match: m };
			}
		}
		return best;
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

function getMatchRank(normalizedQuery: string, value: string): number {
	const normalizedValue = value.toLowerCase();
	if (normalizedValue === normalizedQuery) return 0;
	if (normalizedValue.startsWith(normalizedQuery)) return 2;
	return 4;
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

/**
 * 从 frontmatter 中读取 aliases，规范化为字符串数组。
 * OB 允许 aliases 是 string 或 string[]，也兼容 alias 单数键。
 */
function readAliases(frontmatter: Record<string, unknown> | undefined): string[] {
	if (!frontmatter) return [];
	const raw = frontmatter.aliases ?? frontmatter.alias;
	const out: string[] = [];
	if (typeof raw === "string") {
		const v = raw.trim();
		if (v) out.push(v);
	} else if (Array.isArray(raw)) {
		for (const item of raw) {
			if (typeof item === "string") {
				const v = item.trim();
				if (v) out.push(v);
			}
		}
	}
	return out;
}
