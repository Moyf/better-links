import type { MetadataCache, SearchResult, TFile } from "obsidian";

type UserIgnoreMatcher = {
	readonly isUserIgnored: (path: string) => boolean;
};

export type RankableFileSuggestion = {
	readonly file: TFile;
	readonly match: SearchResult | null;
	readonly excluded: boolean;
};

export function isExcludedFile(metadataCache: MetadataCache, file: TFile): boolean {
	return hasUserIgnoreMatcher(metadataCache) && metadataCache.isUserIgnored(file.path);
}

export function compareFileSuggestions(
	a: RankableFileSuggestion,
	b: RankableFileSuggestion,
	recentFileRanks: ReadonlyMap<string, number>,
): number {
	const excludedDifference = Number(a.excluded) - Number(b.excluded);
	if (excludedDifference !== 0) return excludedDifference;

	const recentDifference = getRecentRank(a.file, recentFileRanks) - getRecentRank(b.file, recentFileRanks);
	if (recentDifference !== 0) return recentDifference;

	const scoreDifference = (b.match?.score ?? 0) - (a.match?.score ?? 0);
	if (scoreDifference !== 0) return scoreDifference;

	return a.file.path.localeCompare(b.file.path);
}

function hasUserIgnoreMatcher(metadataCache: MetadataCache): metadataCache is MetadataCache & UserIgnoreMatcher {
	return "isUserIgnored" in metadataCache && typeof metadataCache.isUserIgnored === "function";
}

function getRecentRank(file: TFile, recentFileRanks: ReadonlyMap<string, number>): number {
	return recentFileRanks.get(file.path) ?? Number.POSITIVE_INFINITY;
}
