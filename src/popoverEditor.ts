import { createPopper, type Instance } from "@popperjs/core";
import { setIcon } from "obsidian";
import type { I18nKey } from "./i18n";

export interface PopoverEditorState {
	displayText: string;
	destination: string;
	typeLabel: string;
	isImage: boolean;
	copyMarkdownLabel: string;
	copyUrlLabel: string;
	copyUrlIcon: string;
	showDelete: boolean;
}

export interface PopoverEditorEvents {
	onSave: (displayText: string, destination: string) => void;
	onOpen: (displayText: string, destination: string) => void;
	onCopyMarkdown: (displayText: string, destination: string) => void;
	onCopyUrl: (destination: string) => void;
	onDelete: () => void;
	onClose: () => void;
	onDiscard: () => void;
	onDestinationInput?: (destination: string) => void;
}

export type PopoverTranslateFn = (key: I18nKey) => string;

export class PopoverEditor {
	private readonly rootEl: HTMLElement;
	private readonly typeBadgeEl: HTMLElement;
	private readonly displayInputEl: HTMLInputElement;
	private readonly destinationInputEl: HTMLInputElement;
	private readonly copyMarkdownButtonEl: HTMLButtonElement;
	private readonly copyUrlButtonEl: HTMLButtonElement;
	private readonly deleteButtonEl: HTMLButtonElement;
	private popperInstance: Instance | null = null;
	private outsidePointerDownHandler: ((event: PointerEvent) => void) | null = null;
	private keydownHandler: ((event: KeyboardEvent) => void) | null = null;

	constructor(
		private readonly events: PopoverEditorEvents,
		private readonly t: PopoverTranslateFn,
	) {
		this.rootEl = document.body.createDiv({ cls: "better-links-popover" });
		this.rootEl.hide();

		/* ── badge row (type label only) ── */
		const badgeRow = this.rootEl.createDiv({ cls: "better-links-popover__badge-row" });
		this.typeBadgeEl = badgeRow.createSpan({ cls: "better-links-popover__badge" });

		/* ── form: two compact fields ── */
		const formEl = this.rootEl.createDiv({ cls: "better-links-popover__form" });

		this.displayInputEl = formEl.createEl("input", {
			cls: "better-links-popover__input",
			attr: { type: "text", placeholder: this.t("popoverPlaceholderDisplay") },
		});

		this.destinationInputEl = formEl.createEl("input", {
			cls: "better-links-popover__input",
			attr: { type: "text", placeholder: this.t("popoverPlaceholderDestination") },
		});

		this.destinationInputEl.addEventListener("input", () => {
			this.events.onDestinationInput?.(this.destinationInputEl.value);
		});

		/* ── footer: left = open, right = copy + delete ── */
		const footerEl = this.rootEl.createDiv({ cls: "better-links-popover__footer" });
		const leftEl = footerEl.createDiv({ cls: "better-links-popover__footer-left" });
		const rightEl = footerEl.createDiv({ cls: "better-links-popover__footer-right" });

		this.createIconButton(leftEl, "external-link", this.t("popoverAriaOpen"), () => {
			this.events.onOpen(this.displayInputEl.value, this.destinationInputEl.value);
		});

		leftEl.createSpan({
			cls: "better-links-popover__open-hint",
			text: this.t("popoverHintCtrlClick"),
		});

		this.copyMarkdownButtonEl = this.createIconButton(rightEl, "copy", this.t("popoverAriaCopyMarkdown"), () => {
			this.events.onCopyMarkdown(this.displayInputEl.value, this.destinationInputEl.value);
		});

		this.copyUrlButtonEl = this.createIconButton(rightEl, "link", this.t("popoverAriaCopyUrl"), () => {
			this.events.onCopyUrl(this.destinationInputEl.value);
		});

		this.deleteButtonEl = this.createIconButton(rightEl, "trash-2", this.t("popoverAriaDelete"), () => {
			this.events.onDelete();
		}, true);
	}

	getValues(): { displayText: string; destination: string } {
		return {
			displayText: this.displayInputEl.value,
			destination: this.destinationInputEl.value,
		};
	}

	setDestinationWarning(hasWarning: boolean): void {
		this.destinationInputEl.toggleClass("mod-warning", hasWarning);
	}

	isOpen(): boolean {
		return this.rootEl.isShown();
	}

	open(referenceEl: HTMLElement, state: PopoverEditorState): void {
		this.typeBadgeEl.setText(state.typeLabel);
		this.displayInputEl.value = state.displayText;
		this.destinationInputEl.value = state.destination;
		this.destinationInputEl.removeClass("mod-warning");
		this.displayInputEl.placeholder = state.isImage
			? this.t("popoverPlaceholderImageSize")
			: this.t("popoverPlaceholderDisplay");

		const copyUrlLabel = state.isImage ? this.t("popoverAriaCopyFileName") : this.t("popoverAriaCopyUrl");
		this.copyMarkdownButtonEl.setAttribute("aria-label", state.copyMarkdownLabel);
		this.copyMarkdownButtonEl.setAttribute("title", state.copyMarkdownLabel);

		this.copyUrlButtonEl.setAttribute("aria-label", state.copyUrlLabel || copyUrlLabel);
		this.copyUrlButtonEl.setAttribute("title", state.copyUrlLabel || copyUrlLabel);
		setIcon(this.copyUrlButtonEl, state.copyUrlIcon);
		this.deleteButtonEl.toggleClass("is-hidden", !state.showDelete);

		/* Place off-screen first to let Popper compute without flash */
		this.rootEl.setCssStyles({ visibility: "hidden" });
		this.rootEl.show();

		this.popperInstance?.destroy();
		this.popperInstance = createPopper(referenceEl, this.rootEl, {
			placement: "top-start",
			modifiers: [
				{ name: "offset", options: { offset: [0, 6] } },
				{ name: "flip", options: { fallbackPlacements: ["bottom-start", "top-end", "bottom-end"] } },
				{ name: "preventOverflow", options: { padding: 8 } },
			],
		});

		/* Wait for Popper to finish positioning, then reveal */
		void this.popperInstance.update().then(() => {
			this.rootEl.setCssStyles({ visibility: "" });
		});

		this.attachGlobalListeners(referenceEl);
		window.setTimeout(() => {
			this.displayInputEl.focus();
			this.displayInputEl.select();
		}, 0);
	}

	close(): void {
		this.detachGlobalListeners();
		this.popperInstance?.destroy();
		this.popperInstance = null;
		this.rootEl.hide();
	}

	destroy(): void {
		this.close();
		this.rootEl.remove();
	}

	private createIconButton(
		parent: HTMLElement,
		icon: string,
		ariaLabel: string,
		onClick: () => void,
		danger = false,
	): HTMLButtonElement {
		const btn = parent.createEl("button", {
			cls: `better-links-popover__icon-btn${danger ? " mod-danger" : ""}`,
			attr: { type: "button", "aria-label": ariaLabel },
		});
		setIcon(btn, icon);
		btn.addEventListener("click", onClick);
		btn.setAttribute("title", ariaLabel);
		return btn;
	}

	private attachGlobalListeners(referenceEl: HTMLElement): void {
		this.detachGlobalListeners();

		this.outsidePointerDownHandler = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (this.rootEl.contains(target) || referenceEl.contains(target)) return;
			this.events.onClose();
		};

		this.keydownHandler = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				this.events.onDiscard();
			} else if (event.key === "Enter") {
				event.preventDefault();
				this.events.onClose();
			}
		};

		document.addEventListener("pointerdown", this.outsidePointerDownHandler, true);
		document.addEventListener("keydown", this.keydownHandler, true);
	}

	private detachGlobalListeners(): void {
		if (this.outsidePointerDownHandler) {
			document.removeEventListener("pointerdown", this.outsidePointerDownHandler, true);
			this.outsidePointerDownHandler = null;
		}
		if (this.keydownHandler) {
			document.removeEventListener("keydown", this.keydownHandler, true);
			this.keydownHandler = null;
		}
	}
}