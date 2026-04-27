export type ExternalLinkOpenMode = "browser" | "obsidian";
export type InternalLinkOpenMode = "current" | "tab" | "window" | "split-horizontal" | "split-vertical";
export type DeleteLinkBehavior = "preserve-text" | "remove-all";
/** 选中 suggest 时别名的生成模式 */
export type AliasSyncMode = "heading-only" | "filename-then-heading" | "heading-then-filename";
/** 触发编辑浮窗的交互方式 */
export type TriggerMethod = "hover" | "click" | "right-click";
/** 触发编辑浮窗时需要按住的修饰键 */
export type TriggerModifier = "none" | "ctrl" | "shift" | "alt";
/** 排除特定链接的模式 */
export type ExcludeMode = "disabled" | "hover" | "click" | "all";

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
    /** 从 suggest 选中文件/标题时，是否自动同步别名（displayText） */
    syncAlias?: boolean;
    /** 别名生成模式（syncAlias 为 true 时有效） */
    aliasSyncMode?: AliasSyncMode;
    /** 合并 文件名 + 标题 时的连接符（默认 " > "） */
    aliasSeparator?: string;
    /** 读取文件名的 frontmatter 属性名（默认 "title"，找不到时 fallback 到文件名） */
    aliasTitleProperty?: string;
    /** 是否在浮窗中显示嵌入切换按钮（! 前缀切换） */
    showEmbedToggle?: boolean;
    /** 触发编辑浮窗的交互方式 */
    triggerMethod?: TriggerMethod;
    /** 触发编辑浮窗时需要按住的修饰键 */
    triggerModifier?: TriggerModifier;
    /** 总是在编辑窗显示 displayText（含自动推导的默认值） */
    alwaysShowDisplayText?: boolean;
    /** 非 click 触发模式下，是否禁用左键点击链接的原生跳转行为 */
    disableNativeClick?: boolean;
    /** 排除特定链接的模式（disabled = 不排除） */
    excludeMode?: ExcludeMode;
    /** 排除关键字列表，逗号或换行分隔 */
    excludeKeywords?: string;
    /** 内部链接打开方式 */
    internalLinkOpenMode?: InternalLinkOpenMode;
    /** 智能分屏：已有同方向分屏时复用已有 leaf，而非再新建 */
    smartSplit?: boolean;
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
    syncAlias: true,
    aliasSyncMode: "heading-only",
    aliasSeparator: " > ",
    aliasTitleProperty: "title",
    showEmbedToggle: true,
    triggerMethod: "hover",
    triggerModifier: "none",
    alwaysShowDisplayText: false,
    disableNativeClick: false,
    excludeMode: "disabled",
    excludeKeywords: ".base, .canvas",
    internalLinkOpenMode: "tab",
    smartSplit: true,
};
