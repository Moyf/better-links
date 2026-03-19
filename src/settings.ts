export type ExternalLinkOpenMode = "browser" | "obsidian";
export type DeleteLinkBehavior = "preserve-text" | "remove-all";

export interface BetterLinksSettings {
	enabled: boolean;
	enableWikiLinks: boolean;
	enableMarkdownLinks: boolean;
	enablePlainUrls: boolean;
	enableImages: boolean;
	externalLinkOpenMode: ExternalLinkOpenMode;
	deleteLinkBehavior: DeleteLinkBehavior;
}

export const DEFAULT_SETTINGS: BetterLinksSettings = {
	enabled: true,
	enableWikiLinks: true,
	enableMarkdownLinks: true,
	enablePlainUrls: true,
	enableImages: true,
	externalLinkOpenMode: "browser",
	deleteLinkBehavior: "preserve-text",
};
