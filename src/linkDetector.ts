import type { EditorPosition } from "obsidian";
import type { BetterLinksSettings } from "./settings";

export type LinkKind = "wiki" | "markdown" | "url" | "imageWiki" | "imageMarkdown";

export interface RelativeLinkMatch {
	type: LinkKind;
	start: number;
	end: number;
	originalText: string;
	displayText: string;
	destination: string;
	hasExplicitDisplayText: boolean;
}

export interface EditorLinkMatch extends RelativeLinkMatch {
	range: {
		from: EditorPosition;
		to: EditorPosition;
	};
	sourcePath: string;
}

const WIKILINK_PATTERN = /!?\[\[([^\]\r\n]+?)\]\]/g;
const MARKDOWN_LINK_PATTERN = /!?\[([^\]\r\n]*)\]\(([^)\r\n]+)\)/g;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"]+[^\s<>"),.;:!?]/g;

export function findLinkAtOffset(lineText: string, offset: number, settings: BetterLinksSettings): RelativeLinkMatch | null {
	const matches = collectMatches(lineText, settings);
	return matches.find((match) => offset >= match.start && offset < match.end) ?? null;
}

export function withEditorRange(match: RelativeLinkMatch, line: number, sourcePath: string): EditorLinkMatch {
	return {
		...match,
		range: {
			from: { line, ch: match.start },
			to: { line, ch: match.end },
		},
		sourcePath,
	};
}

export function serializeEditedLink(match: EditorLinkMatch, displayText: string, destination: string): string {
	const nextDisplayText = displayText.trim();
	const nextDestination = destination.trim();
	if (match.type === "imageWiki") {
		if (!nextDestination) {
			return "";
		}

		const useEmbedSyntax = match.originalText.startsWith("![[");
		const prefix = useEmbedSyntax ? "!" : "";
		return nextDisplayText.length > 0
			? `${prefix}[[${nextDestination}|${nextDisplayText}]]`
			: `${prefix}[[${nextDestination}]]`;
	}

	if (match.type === "imageMarkdown") {
		const useEmbedSyntax = match.originalText.startsWith("![");
		const prefix = useEmbedSyntax ? "!" : "";
		return `${prefix}[${nextDisplayText}](${nextDestination})`;
	}

	if (match.type === "wiki") {
		if (!nextDestination) {
			return "";
		}

		const shouldIncludeAlias = nextDisplayText.length > 0 && nextDisplayText !== prettifyWikiTarget(nextDestination);
		return shouldIncludeAlias ? `[[${nextDestination}|${nextDisplayText}]]` : `[[${nextDestination}]]`;
	}

	if (match.type === "markdown") {
		return `[${nextDisplayText}](${nextDestination})`;
	}

	if (nextDisplayText.length > 0 && nextDisplayText !== nextDestination) {
		return `[${nextDisplayText}](${nextDestination})`;
	}

	return nextDestination;
}

export function toMarkdownSnippet(match: EditorLinkMatch, displayText: string, destination: string): string {
	const nextDisplayText = (displayText.trim() || defaultDisplayText(match)).trim();
	const nextDestination = destination.trim();
	if (match.type === "imageWiki" || match.type === "imageMarkdown") {
		const useEmbedSyntax =
			(match.type === "imageWiki" && match.originalText.startsWith("![[")) ||
			(match.type === "imageMarkdown" && match.originalText.startsWith("!["));
		const prefix = useEmbedSyntax ? "!" : "";
		return `${prefix}[${nextDisplayText}](${nextDestination})`;
	}

	return `[${nextDisplayText}](${nextDestination})`;
}

export function deletionReplacement(match: EditorLinkMatch, preserveText: boolean): string {
	if (!preserveText) {
		return "";
	}

	return defaultDisplayText(match);
}

export function defaultDisplayText(match: Pick<EditorLinkMatch, "type" | "displayText" | "destination" | "hasExplicitDisplayText">): string {
	if (match.type === "imageWiki" || match.type === "imageMarkdown") {
		return match.displayText;
	}

	if (match.type === "wiki") {
		if (match.hasExplicitDisplayText && match.displayText.trim().length > 0) {
			return match.displayText;
		}

		return prettifyWikiTarget(match.destination);
	}

	if (match.type === "markdown") {
		return match.displayText || match.destination;
	}

	return match.destination;
}

export function isLikelyExternalDestination(destination: string): boolean {
	return /^(https?:|mailto:|obsidian:)/i.test(destination.trim());
}

export function isLikelyInternalDestination(destination: string): boolean {
	const value = destination.trim();
	if (!value) {
		return false;
	}

	if (isLikelyExternalDestination(value)) {
		return false;
	}

	return true;
}

function collectMatches(lineText: string, settings: BetterLinksSettings): RelativeLinkMatch[] {
	const matches: RelativeLinkMatch[] = [];

	if (settings.enableWikiLinks) {
		for (const match of lineText.matchAll(WIKILINK_PATTERN)) {
			const start = match.index ?? 0;
			const originalText = match[0];
			const isImageEmbed = originalText.startsWith("![[");
			const inside = match[1] ?? "";
			const separatorIndex = inside.indexOf("|");
			const destination = separatorIndex >= 0 ? inside.slice(0, separatorIndex).trim() : inside.trim();
			const isImageDestination = isImageDestinationPath(destination);
			const isImage = isImageEmbed || isImageDestination;
			if (isImage && !settings.enableImages) {
				continue;
			}

			const displayText = isImage
				? (separatorIndex >= 0 ? inside.slice(separatorIndex + 1).trim() : "")
				: (separatorIndex >= 0 ? inside.slice(separatorIndex + 1).trim() : prettifyWikiTarget(destination));

			matches.push({
				type: isImage ? "imageWiki" : "wiki",
				start,
				end: start + originalText.length,
				originalText,
				displayText,
				destination,
				hasExplicitDisplayText: separatorIndex >= 0,
			});
		}
	}

	if (settings.enableMarkdownLinks) {
		for (const match of lineText.matchAll(MARKDOWN_LINK_PATTERN)) {
			const start = match.index ?? 0;
			const originalText = match[0];
			const isImageEmbed = originalText.startsWith("![");
			const destination = (match[2] ?? "").trim();
			const isImageDestination = isImageDestinationPath(destination);
			const isImage = isImageEmbed || isImageDestination;
			if (isImage && !settings.enableImages) {
				continue;
			}

			matches.push({
				type: isImage ? "imageMarkdown" : "markdown",
				start,
				end: start + originalText.length,
				originalText,
				displayText: match[1] ?? "",
				destination,
				hasExplicitDisplayText: true,
			});
		}
	}

	if (settings.enablePlainUrls) {
		for (const match of lineText.matchAll(URL_PATTERN)) {
			const start = match.index ?? 0;
			const originalText = match[0];
			if (matches.some((existing) => rangesOverlap(existing.start, existing.end, start, start + originalText.length))) {
				continue;
			}

			matches.push({
				type: "url",
				start,
				end: start + originalText.length,
				originalText,
				displayText: originalText,
				destination: originalText,
				hasExplicitDisplayText: false,
			});
		}
	}

	return matches.sort((left, right) => left.start - right.start);
}

function prettifyWikiTarget(destination: string): string {
	const withoutSubpath = destination.split("#", 1)[0] ?? destination;
	const lastSegment = withoutSubpath.split("/").pop() ?? withoutSubpath;
	return lastSegment.replace(/\.md$/i, "");
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
	return startA < endB && startB < endA;
}

function isImageDestinationPath(destination: string): boolean {
	const cleaned = destination.split(/[?#]/, 1)[0] ?? destination;
	return /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(cleaned.trim());
}