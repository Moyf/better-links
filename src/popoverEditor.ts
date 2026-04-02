import { createPopper, type Instance, type VirtualElement } from "@popperjs/core";
import { setIcon } from "obsidian";
import type { I18nKey } from "./i18n";

export interface PopoverEditorState {
	displayText: string;
	destination: string;
	typeLabel: string;
	isImage: boolean;
	isInternal: boolean;
	copyMarkdownLabel: string;
	copyUrlLabel: string;
	copyUrlIcon: string;
	showDelete: boolean;
	showEmbedToggle: boolean;
	isEmbedded: boolean;
	showCtrlClickHint: boolean;
}

export interface PopoverEditorEvents {
	onSave: (displayText: string, destination: string) => void;
	onOpen: (displayText: string, destination: string) => void;
	onCopyMarkdown: (displayText: string, destination: string) => void;
	onCopyUrl: (destination: string) => void;
	onDelete: (forceRemoveAll: boolean) => void;
	onToggleEmbed: () => void;
	onForceSave: () => void;
	onClose: () => void;
	onDiscard: () => void;
	onDestinationInput?: (destination: string) => void;
}

export type PopoverTranslateFn = (key: I18nKey) => string;

export class PopoverEditor {
	/** 外层透明容器：用于扩展鼠标交互区域，Popper 定位目标 */
	private readonly wrapperEl: HTMLElement;
	/** 内层视觉容器：实际的 popover 样式 */
	private readonly rootEl: HTMLElement;
	private readonly typeBadgeEl: HTMLElement;
	private readonly displayInputEl: HTMLInputElement;
	private readonly destinationInputEl: HTMLInputElement;
	private readonly copyMarkdownButtonEl: HTMLButtonElement;
	private readonly copyUrlButtonEl: HTMLButtonElement;
	private readonly embedButtonEl: HTMLButtonElement;
	private readonly deleteButtonEl: HTMLButtonElement;
	private readonly ctrlClickHintEl: HTMLElement;
	private readonly openButtonEl: HTMLButtonElement;
	private readonly forceSaveButtonEl: HTMLButtonElement;
	private readonly destinationWarningEl: HTMLElement;
	private popperInstance: Instance | null = null;
	private outsidePointerDownHandler: ((event: PointerEvent) => void) | null = null;
	private keydownHandler: ((event: KeyboardEvent) => void) | null = null;
	private scrollHandler: (() => void) | null = null;
	private resizeHandler: (() => void) | null = null;
	private updateRafId: number | null = null;
	private isSuggestActiveChecker: (() => boolean) | null = null;

	constructor(
		private readonly events: PopoverEditorEvents,
		private readonly t: PopoverTranslateFn,
	) {
		this.wrapperEl = document.body.createDiv({ cls: "better-links-popover-wrapper" });
		this.wrapperEl.hide();
		this.rootEl = this.wrapperEl.createDiv({ cls: "better-links-popover" });

		/* ── badge row (type label only) ── */
		const badgeRow = this.rootEl.createDiv({ cls: "better-links-popover__badge-row" });
		this.typeBadgeEl = badgeRow.createSpan({ cls: "better-links-popover__badge" });

		/* ── form: two compact fields ── */
		const formEl = this.rootEl.createDiv({ cls: "better-links-popover__form" });

		this.displayInputEl = formEl.createEl("input", {
			cls: "better-links-popover__input",
			attr: { type: "text", placeholder: this.t("popoverPlaceholderDisplay") },
		});

		const destinationRow = formEl.createDiv({ cls: "better-links-popover__input-row" });

		this.destinationInputEl = destinationRow.createEl("input", {
			cls: "better-links-popover__input",
			attr: { type: "text", placeholder: this.t("popoverPlaceholderDestination") },
		});

		this.destinationWarningEl = destinationRow.createSpan({
			cls: "better-links-popover__input-warning is-hidden",
			text: "⚠️",
			attr: { "aria-label": this.t("popoverWarningTargetNotFound") },
		});

		this.destinationInputEl.addEventListener("input", () => {
			this.events.onDestinationInput?.(this.destinationInputEl.value);
		});

		/* ── footer: left = open, right = copy + delete ── */
		const footerEl = this.rootEl.createDiv({ cls: "better-links-popover__footer" });
		const leftEl = footerEl.createDiv({ cls: "better-links-popover__footer-left" });
		const rightEl = footerEl.createDiv({ cls: "better-links-popover__footer-right" });

		this.embedButtonEl = this.createIconButton(leftEl, "file-braces", this.t("popoverAriaToggleEmbed"), () => {
			this.events.onToggleEmbed();
		});

		/* 外部链接打开按钮 */
		this.openButtonEl = this.createIconButton(leftEl, "external-link", this.t("popoverAriaOpen"), () => {
			this.events.onOpen(this.displayInputEl.value, this.destinationInputEl.value);
		});

		this.ctrlClickHintEl = leftEl.createSpan({
			cls: "better-links-popover__open-hint",
			text: this.t("popoverHintCtrlClick"),
		});

		this.copyMarkdownButtonEl = this.createIconButton(rightEl, "copy", this.t("popoverAriaCopyMarkdown"), () => {
			this.events.onCopyMarkdown(this.displayInputEl.value, this.destinationInputEl.value);
		});

		this.copyUrlButtonEl = this.createIconButton(rightEl, "link", this.t("popoverAriaCopyUrl"), () => {
			this.events.onCopyUrl(this.destinationInputEl.value);
		});

		this.deleteButtonEl = this.createIconButton(rightEl, "trash-2", this.t("popoverAriaDelete"), (event) => {
			const forceRemoveAll = event instanceof MouseEvent && (event.ctrlKey || event.metaKey);
			this.events.onDelete(forceRemoveAll);
		}, true);

		this.forceSaveButtonEl = this.createIconButton(rightEl, "check", this.t("popoverAriaForceSave"), () => {
			this.events.onForceSave();
		});
		this.forceSaveButtonEl.toggleClass("is-hidden", true);
	}

	getValues(): { displayText: string; destination: string } {
		return {
			displayText: this.displayInputEl.value,
			destination: this.destinationInputEl.value,
		};
	}

	get destinationInput(): HTMLInputElement {
		return this.destinationInputEl;
	}

	setDisplayText(value: string): void {
		this.displayInputEl.value = value;
	}

	setSuggestActiveChecker(fn: (() => boolean) | null): void {
		this.isSuggestActiveChecker = fn;
	}

	setDestinationWarning(hasWarning: boolean): void {
		this.destinationInputEl.toggleClass("mod-warning", hasWarning);
		this.destinationWarningEl.toggleClass("is-hidden", !hasWarning);
		this.forceSaveButtonEl.toggleClass("is-hidden", !hasWarning);
	}

	/** 检查 popover 中是否有输入框获焦 */
	hasInputFocus(): boolean {
		return this.rootEl.contains(document.activeElement);
	}

	updateEmbedState(isEmbedded: boolean): void {
		this.embedButtonEl.toggleClass("is-active", isEmbedded);
		const label = isEmbedded ? this.t("popoverAriaEmbedOn") : this.t("popoverAriaEmbedOff");
		this.embedButtonEl.setAttribute("aria-label", label);
	}

	isOpen(): boolean {
		return this.wrapperEl.isShown();
	}

	/** 检查某个节点是否在 popover 交互区域内（含外层 wrapper） */
	containsElement(node: Node): boolean {
		return this.wrapperEl.contains(node);
	}

	/** 获取外层交互容器用于事件绑定 */
	get rootElement(): HTMLElement {
		return this.wrapperEl;
	}

	open(referenceEl: HTMLElement | VirtualElement, state: PopoverEditorState, interactionEl?: HTMLElement): void {
		this.typeBadgeEl.setText(state.typeLabel);
		this.displayInputEl.value = state.displayText;
		this.destinationInputEl.value = state.destination;
		this.destinationInputEl.removeClass("mod-warning");
		this.destinationWarningEl.toggleClass("is-hidden", true);
		this.forceSaveButtonEl.toggleClass("is-hidden", true);
		this.displayInputEl.placeholder = state.isImage
			? this.t("popoverPlaceholderImageSize")
			: this.t("popoverPlaceholderDisplay");

		const copyUrlLabel = state.isImage ? this.t("popoverAriaCopyFileName") : this.t("popoverAriaCopyUrl");
		this.copyMarkdownButtonEl.setAttribute("aria-label", state.copyMarkdownLabel);

		this.copyUrlButtonEl.setAttribute("aria-label", state.copyUrlLabel || copyUrlLabel);
		setIcon(this.copyUrlButtonEl, state.copyUrlIcon);
		this.deleteButtonEl.toggleClass("is-hidden", !state.showDelete);

		/* Open button icon: internal vs external */
		setIcon(this.openButtonEl, state.isInternal ? "file-symlink" : "external-link");

		/* Ctrl+Click hint */
		this.ctrlClickHintEl.toggleClass("is-hidden", !state.showCtrlClickHint);

		/* Embed toggle button */
		this.embedButtonEl.toggleClass("is-hidden", !state.showEmbedToggle);
		this.updateEmbedState(state.isEmbedded);

		/* Place off-screen first to let Popper compute without flash */
		this.rootEl.removeClass("is-visible");
		this.wrapperEl.setCssStyles({ visibility: "hidden" });
		this.wrapperEl.show();

		this.popperInstance?.destroy();
		this.popperInstance = createPopper(referenceEl, this.wrapperEl, {
			placement: "top-start",
			modifiers: [
				{ name: "offset", options: { offset: [0, 6] } },
				{ name: "flip", options: { fallbackPlacements: ["bottom-start", "top-end", "bottom-end"] } },
				{ name: "preventOverflow", options: { padding: 8 } },
			],
		});

		/* Wait for Popper to finish positioning, then reveal with fade-in */
		void this.popperInstance.update().then(() => {
			this.wrapperEl.setCssStyles({ visibility: "" });
			requestAnimationFrame(() => {
				this.rootEl.addClass("is-visible");
			});
		});

		this.attachGlobalListeners(interactionEl);
		window.setTimeout(() => {
			this.displayInputEl.focus();
			this.displayInputEl.select();
		}, 0);
	}

	close(): void {
		this.detachGlobalListeners();
		this.rootEl.removeClass("is-visible");
		this.popperInstance?.destroy();
		this.popperInstance = null;
		this.wrapperEl.hide();
	}

	destroy(): void {
		this.close();
		this.wrapperEl.remove();
	}

	private createIconButton(
		parent: HTMLElement,
		icon: string,
		ariaLabel: string,
		onClick: (event: MouseEvent) => void,
		danger = false,
	): HTMLButtonElement {
		const btn = parent.createEl("button", {
			cls: `better-links-popover__icon-btn${danger ? " mod-danger" : ""}`,
			attr: { type: "button", "aria-label": ariaLabel },
		});
		setIcon(btn, icon);
		btn.addEventListener("click", onClick);
		return btn;
	}

	private attachGlobalListeners(interactionEl?: HTMLElement): void {
		this.detachGlobalListeners();

		this.outsidePointerDownHandler = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (this.wrapperEl.contains(target) || interactionEl?.contains(target)) return;
			// Suggest dropdown (Obsidian挂在 body 上的 .suggestion-container) 里的点击不关闭 popover
			if (this.isSuggestActiveChecker?.() && (target as Element).closest?.(".suggestion-container")) return;
			this.events.onClose();
		};

		this.keydownHandler = (event: KeyboardEvent) => {
			// While suggest dropdown is active, let AbstractInputSuggest handle navigation
			if (this.isSuggestActiveChecker?.()) return;

			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				this.events.onDiscard();
			} else if (event.key === "Enter") {
				event.preventDefault();
				event.stopPropagation();
				this.events.onClose();
			}
		};

		this.scrollHandler = () => {
			this.schedulePopperUpdate();
		};

		this.resizeHandler = () => {
			this.schedulePopperUpdate();
		};

		document.addEventListener("pointerdown", this.outsidePointerDownHandler, true);
		document.addEventListener("keydown", this.keydownHandler, true);
		document.addEventListener("scroll", this.scrollHandler, true);
		window.addEventListener("resize", this.resizeHandler, true);
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
		if (this.scrollHandler) {
			document.removeEventListener("scroll", this.scrollHandler, true);
			this.scrollHandler = null;
		}
		if (this.resizeHandler) {
			window.removeEventListener("resize", this.resizeHandler, true);
			this.resizeHandler = null;
		}
		if (this.updateRafId !== null) {
			cancelAnimationFrame(this.updateRafId);
			this.updateRafId = null;
		}
	}

	private schedulePopperUpdate(): void {
		if (!this.popperInstance || this.updateRafId !== null) return;
		this.updateRafId = requestAnimationFrame(() => {
			this.updateRafId = null;
			void this.popperInstance?.update();
		});
	}
}
