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

export async function copyMarkdown(match: EditorLinkMatch, values: EditableLinkValues): Promise<void> {
	const markdown = toMarkdownSnippet(match, values.displayText, values.destination);
	await copyText(markdown, t("noticeCopiedMarkdown"));
}

export async function copyUrl(url: string): Promise<void> {
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