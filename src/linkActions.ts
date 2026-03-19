import { Notice, type App } from "obsidian";
import { defaultDisplayText, deletionReplacement, isLikelyExternalDestination, isLikelyInternalDestination, toMarkdownSnippet, type EditorLinkMatch } from "./linkDetector";
import { createTranslator } from "./i18n";
import type { BetterLinksSettings } from "./settings";

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

const t = createTranslator(navigator.language || "en-US");
export async function openLink(app: App, match: EditorLinkMatch, values: EditableLinkValues, settings: BetterLinksSettings): Promise<void> {
	const destination = values.destination.trim();
	if (!destination) {
		new Notice(t("noticeEmptyDestination"));
		return;
	}

	if (match.type === "wiki" || isLikelyInternalDestination(destination)) {
		await app.workspace.openLinkText(destination, match.sourcePath, false);
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