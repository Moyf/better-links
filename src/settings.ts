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
    /** 是否启用链接边界保护，防止点击最前/最后弹窗，便于插入或追加文本 */
    edgeProtection?: boolean;
}

export const DEFAULT_SETTINGS: BetterLinksSettings = {
	enabled: true,
	enableWikiLinks: true,
	enableMarkdownLinks: true,
	enablePlainUrls: true,
	enableImages: true,
	externalLinkOpenMode: "browser",
	deleteLinkBehavior: "preserve-text",
    edgeProtection: true,
};
