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
    /** 是否在编辑内部链接时校验目标文件/标题是否存在 */
    validateInternalLinks?: boolean;
    /** 是否在编辑内部链接目标时显示笔记和标题的自动补全建议 */
    enableLinkSuggestions?: boolean;
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
    validateInternalLinks: true,
    enableLinkSuggestions: true,
};
