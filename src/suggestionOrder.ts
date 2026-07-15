import type { SearchResult, TFile } from "obsidian";

const MEDIA_EXTENSIONS = new Set([
	"avif",
	"bmp",
	"flac",
	"gif",
	"jpeg",
	"jpg",
	"m4a",
	"mkv",
	"mov",
	"mp3",
	"mp4",
	"oga",
	"ogg",
	"ogv",
	"opus",
	"png",
	"svg",
	"webm",
	"webp",
	"wav",
]);

export type RankableFileSuggestion = {
	readonly file: TFile;
	readonly match: SearchResult | null;
};

export function compareFileSuggestions(
	a: RankableFileSuggestion,
	b: RankableFileSuggestion,
	recentFileRanks: ReadonlyMap<string, number>,
): number {
	const typeDifference = getFileTypeRank(a.file) - getFileTypeRank(b.file);
	if (typeDifference !== 0) return typeDifference;

	const recentDifference = getRecentRank(a.file, recentFileRanks) - getRecentRank(b.file, recentFileRanks);
	if (recentDifference !== 0) return recentDifference;

	const scoreDifference = (b.match?.score ?? 0) - (a.match?.score ?? 0);
	if (scoreDifference !== 0) return scoreDifference;

	return a.file.path.localeCompare(b.file.path);
}

function getFileTypeRank(file: TFile): number {
	if (file.extension === "md") return 0;
	return MEDIA_EXTENSIONS.has(file.extension.toLowerCase()) ? 2 : 1;
}

function getRecentRank(file: TFile, recentFileRanks: ReadonlyMap<string, number>): number {
	return recentFileRanks.get(file.path) ?? Number.POSITIVE_INFINITY;
}
