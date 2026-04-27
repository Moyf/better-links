import { Notice, type App, type WorkspaceLeaf } from "obsidian";
import { defaultDisplayText, deletionReplacement, isLikelyExternalDestination, isLikelyInternalDestination, toMarkdownSnippet, type EditorLinkMatch } from "./linkDetector";
import { createTranslator } from "./i18n";
import type { BetterLinksSettings, InternalLinkOpenMode } from "./settings";

interface ElectronModule {
	clipboard?: {
		writeText: (value: string) => void;
	};
	shell?: {
		openExternal: (value: string) => Promise<void> | void;
	};
}

export interface EditableLinkValues {
	displayText: string;
	destination: string;
}

const t = createTranslator(
	window.localStorage.getItem("language") ?? "en"
);
export async function openLink(app: App, match: EditorLinkMatch, values: EditableLinkValues, settings: BetterLinksSettings): Promise<void> {
	const destination = values.destination.trim();
	if (!destination) {
		new Notice(t("noticeEmptyDestination"));
		return;
	}

	if (match.type === "wiki" || isLikelyInternalDestination(destination)) {
		const mode = settings.internalLinkOpenMode ?? "tab";
		if (mode === "current") {
			await app.workspace.openLinkText(destination, match.sourcePath, false);
		} else if (mode === "tab") {
			await app.workspace.openLinkText(destination, match.sourcePath, "tab");
		} else {
			const leaf = getInternalLinkLeaf(app, settings, mode);
			await openInternalInLeaf(app, leaf, destination, match.sourcePath);
		}
		return;
	}

	// 非 http(s) 的外部协议（file:、ftp:、ssh: 等）始终通过系统 shell 打开
	if (isNonHttpExternalDestination(destination)) {
		if (await openInSystemBrowser(destination)) {
			return;
		}
		// shell 不可用时无其他 fallback，直接返回
		return;
	}

	if (settings.externalLinkOpenMode === "browser") {
		if (await openInSystemBrowser(destination)) {
			return;
		}
	}

	window.open(destination, "_blank", "noopener,noreferrer");
}

export async function copyMarkdown(app: App, match: EditorLinkMatch, values: EditableLinkValues): Promise<void> {
	const destination = values.destination.trim();
	const snippet = isLikelyExternalDestination(destination)
		? toMarkdownSnippet(match, values.displayText, destination)
		: toPreferredInternalSnippet(app, match, values);
	await copyText(snippet, t("noticeCopiedMarkdown"));
}

export async function copyUrl(app: App, match: EditorLinkMatch, url: string): Promise<void> {
	if (isImageType(match)) {
		const fileName = extractFileName(url);
		await copyText(fileName, t("noticeCopiedFileName"));
		return;
	}

	await copyText(url.trim(), t("noticeCopiedUrl"));
}

export function buildDeletionText(match: EditorLinkMatch, settings: BetterLinksSettings): string {
	return deletionReplacement(match, settings.deleteLinkBehavior === "preserve-text");
}

export function normalizeEditableValues(match: EditorLinkMatch, displayText: string, destination: string): EditableLinkValues {
	return {
		displayText: displayText.trim() || defaultDisplayText(match),
		destination: destination.trim(),
	};
}

async function openInSystemBrowser(url: string): Promise<boolean> {
	if (!isLikelyExternalDestination(url)) {
		return false;
	}

	try {
		const electronModule = getElectronModule();
		await electronModule?.shell?.openExternal?.(url);
		return Boolean(electronModule?.shell?.openExternal);
	} catch {
		return false;
	}
}

/** 检测是否为非 http(s) 的外部协议（file:、ftp:、ssh: 等） */
function isNonHttpExternalDestination(destination: string): boolean {
	const trimmed = destination.trim();
	return isLikelyExternalDestination(trimmed) && !/^https?:/i.test(trimmed);
}

async function copyText(value: string, successMessage: string): Promise<void> {
	if (!value) {
		new Notice(t("noticeNothingToCopy"));
		return;
	}

	try {
		await navigator.clipboard.writeText(value);
		new Notice(successMessage);
		return;
	} catch {
		const electronModule = getElectronModule();
		if (electronModule?.clipboard) {
			electronModule.clipboard.writeText(value);
			new Notice(successMessage);
			return;
		}
	}

	new Notice(t("noticeCopyFailed"));
}

function getElectronModule(): ElectronModule | null {
	const scopedWindow = window as Window & {
		require?: (id: string) => unknown;
	};
	const loaded = scopedWindow.require?.("electron");
	if (!loaded || typeof loaded !== "object") {
		return null;
	}

	return loaded as ElectronModule;
}

function isImageType(match: Pick<EditorLinkMatch, "type">): boolean {
	return match.type === "imageWiki" || match.type === "imageMarkdown";
}

function toPreferredInternalSnippet(app: App, match: EditorLinkMatch, values: EditableLinkValues): string {
	if (isImageType(match)) {
		return toPreferredImageSnippet(app, values);
	}

	const destination = values.destination.trim();
	const displayText = values.displayText.trim();
	if (shouldUseWikiLinkFormat(app)) {
		if (displayText.length === 0) {
			return `[[${destination}]]`;
		}

		return `[[${destination}|${displayText}]]`;
	}

	return `[${displayText}](${destination})`;
}

function toPreferredImageSnippet(app: App, values: EditableLinkValues): string {
	const destination = values.destination.trim();
	const sizeText = values.displayText.trim();

	if (shouldUseWikiLinkFormat(app)) {
		return sizeText.length > 0 ? `![[${destination}|${sizeText}]]` : `![[${destination}]]`;
	}

	return `![${sizeText}](${destination})`;
}

export function shouldUseWikiLinkFormat(app: App): boolean {
	const vaultWithConfig = app.vault as typeof app.vault & {
		getConfig?: (key: string) => unknown;
	};

	const useMarkdownLinks = vaultWithConfig.getConfig?.("useMarkdownLinks");
	if (typeof useMarkdownLinks === "boolean") {
		return !useMarkdownLinks;
	}

	const useWikiLinks = vaultWithConfig.getConfig?.("useWikiLinks");
	if (typeof useWikiLinks === "boolean") {
		return useWikiLinks;
	}

	return false;
}

function extractFileName(destination: string): string {
	const cleaned = destination.trim().split(/[?#]/, 1)[0] ?? destination.trim();
	if (!cleaned) {
		return "";
	}

	const normalized = cleaned.replace(/\\/g, "/");
	const parts = normalized.split("/");
	return parts[parts.length - 1] ?? cleaned;
}

/**
 * 在指定 leaf 中打开内部链接，支持 # 子路径（heading / block）。
 */
async function openInternalInLeaf(app: App, leaf: WorkspaceLeaf, destination: string, sourcePath: string): Promise<void> {
	const hashIndex = destination.indexOf("#");
	const linkpath = hashIndex >= 0 ? destination.slice(0, hashIndex) : destination;
	const subpath = hashIndex >= 0 ? destination.slice(hashIndex) : undefined;

	const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
	if (file) {
		await leaf.openFile(file, {
			active: true,
			...(subpath ? { eState: { subpath } } : {}),
		});
	} else {
		// 文件不存在时，fallback 让 Obsidian 自行处理（会提示创建）
		app.workspace.setActiveLeaf(leaf, { focus: true });
		await app.workspace.openLinkText(destination, sourcePath, false);
	}
}

/**
 * 根据设置获取内部链接应当打开的 WorkspaceLeaf。
 * - window: 新窗口
 * - split-horizontal / split-vertical: 分屏（智能分屏时复用已有同方向邻居）
 */
function getInternalLinkLeaf(
	app: App,
	settings: BetterLinksSettings,
	mode: Exclude<InternalLinkOpenMode, "tab">,
): WorkspaceLeaf {
	if (mode === "window") {
		return app.workspace.getLeaf("window");
	}

	const direction = mode === "split-horizontal" ? "vertical" : "horizontal";
	const smartSplit = settings.smartSplit ?? true;

	if (smartSplit) {
		const sibling = findSiblingLeaf(app, direction);
		if (sibling) return sibling;
	}

	return app.workspace.getLeaf("split", direction);
}

/**
 * 在当前 active leaf 的同层 parent 中，寻找同方向的另一个 leaf。
 * 返回 null 表示没找到可复用的。
 */
function findSiblingLeaf(app: App, direction: "vertical" | "horizontal"): WorkspaceLeaf | null {
	const active = app.workspace.getLeaf(false);
	const parent = active.parent;
	if (!parent) return null;

	// parent.direction 表示子节点的排列方向
	// "vertical" = 子节点左右排列（即左右分屏），"horizontal" = 子节点上下排列（即上下分屏）
	const parentWithDir = parent as typeof parent & { direction?: string };
	if (parentWithDir.direction !== direction) return null;

	const children: WorkspaceLeaf[] = (parent as typeof parent & { children?: WorkspaceLeaf[] }).children ?? [];
	if (children.length < 2) return null;

	// 返回第一个非 active 的 leaf
	for (const child of children) {
		if (child !== active) return child;
	}

	return null;
}