import { createPopper, type Instance } from "@popperjs/core";
import { setIcon } from "obsidian";

export interface PopoverEditorState {
	displayText: string;
	destination: string;
	typeLabel: string;
}

export interface PopoverEditorEvents {
	onSave: (displayText: string, destination: string) => void;
	onOpen: (displayText: string, destination: string) => void;
	onCopyMarkdown: (displayText: string, destination: string) => void;
	onCopyUrl: (destination: string) => void;
	onDelete: () => void;
	onClose: () => void;
}

export class PopoverEditor {
	private readonly rootEl: HTMLElement;
	private readonly typeBadgeEl: HTMLElement;
	private readonly displayInputEl: HTMLInputElement;
	private readonly destinationInputEl: HTMLInputElement;
	private popperInstance: Instance | null = null;
	private outsidePointerDownHandler: ((event: PointerEvent) => void) | null = null;
	private keydownHandler: ((event: KeyboardEvent) => void) | null = null;

	constructor(private readonly events: PopoverEditorEvents) {
		this.rootEl = document.body.createDiv({ cls: "better-links-popover" });
		this.rootEl.hide();

		/* ── badge row (type label only) ── */
		const badgeRow = this.rootEl.createDiv({ cls: "better-links-popover__badge-row" });
		this.typeBadgeEl = badgeRow.createSpan({ cls: "better-links-popover__badge" });

		/* ── form: two compact fields ── */
		const formEl = this.rootEl.createDiv({ cls: "better-links-popover__form" });

		this.displayInputEl = formEl.createEl("input", {
			cls: "better-links-popover__input",
			attr: { type: "text", placeholder: "Display text" },
		});

		this.destinationInputEl = formEl.createEl("input", {
			cls: "better-links-popover__input",
			attr: { type: "text", placeholder: "URL or note path" },
		});

		/* ── footer: left = open, right = copy + delete ── */
		const footerEl = this.rootEl.createDiv({ cls: "better-links-popover__footer" });
		const leftEl = footerEl.createDiv({ cls: "better-links-popover__footer-left" });
		const rightEl = footerEl.createDiv({ cls: "better-links-popover__footer-right" });

		this.createIconButton(leftEl, "external-link", "Open link", () => {
			this.events.onOpen(this.displayInputEl.value, this.destinationInputEl.value);
		});

		this.createIconButton(rightEl, "copy", "Copy as Markdown", () => {
			this.events.onCopyMarkdown(this.displayInputEl.value, this.destinationInputEl.value);
		});

		this.createIconButton(rightEl, "link", "Copy URL", () => {
			this.events.onCopyUrl(this.destinationInputEl.value);
		});

		this.createIconButton(rightEl, "trash-2", "Delete link", () => {
			this.events.onDelete();
		}, true);
	}

	getValues(): { displayText: string; destination: string } {
		return {
			displayText: this.displayInputEl.value,
			destination: this.destinationInputEl.value,
		};
	}

	isOpen(): boolean {
		return this.rootEl.isShown();
	}

	open(referenceEl: HTMLElement, state: PopoverEditorState): void {
		this.typeBadgeEl.setText(state.typeLabel);
		this.displayInputEl.value = state.displayText;
		this.destinationInputEl.value = state.destination;

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
	): void {
		const btn = parent.createEl("button", {
			cls: `better-links-popover__icon-btn${danger ? " mod-danger" : ""}`,
			attr: { type: "button", "aria-label": ariaLabel },
		});
		setIcon(btn, icon);
		btn.addEventListener("click", onClick);
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
			if (event.key === "Escape" || event.key === "Enter") {
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