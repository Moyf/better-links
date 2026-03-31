import { MarkdownView, Plugin } from "obsidian";
import { createTranslator, type I18nKey } from "./i18n";
import { LinkEditManager } from "./linkEditManager";
import { LinkInterceptor } from "./linkInterceptor";
import { BetterLinksSettingTab } from "./settingTab";
import { BetterLinksSettings, DEFAULT_SETTINGS } from "./settings";

export default class BetterLinksPlugin extends Plugin {
	settings: BetterLinksSettings;
	private readonly translate = createTranslator(
		window.localStorage.getItem("language") ?? "en"
	);
	private linkEditManager: LinkEditManager;
	private linkInterceptor: LinkInterceptor;

	t(key: I18nKey): string {
		return this.translate(key);
	}

	async onload(): Promise<void> {
		await this.loadSettings();

		this.linkEditManager = new LinkEditManager(this);
		this.linkInterceptor = new LinkInterceptor(this, this.linkEditManager);

		this.addSettingTab(new BetterLinksSettingTab(this.app, this));

		this.addCommand({
			id: "close-link-editor",
			name: this.t("commandCloseLinkEditor"),
			checkCallback: (checking) => {
				const isOpen = this.linkEditManager.isOpen();
				if (checking) {
					return isOpen;
				}

				this.linkEditManager.close();
				return true;
			},
		});

		this.registerDomEvent(
			document,
			"click",
			(event: MouseEvent) => {
				void this.linkInterceptor.handleClick(event);
			},
			{ capture: true }
		);

		this.registerDomEvent(
			document,
			"mousemove",
			(event: MouseEvent) => {
				this.linkInterceptor.handleMouseMove(event);
			},
		);

		// hover 模式：popover 区域的鼠标事件（阻止离开时关闭）
		const popoverRoot = this.linkEditManager.popoverRootElement;
		this.registerDomEvent(popoverRoot, "mouseenter", () => {
			this.linkInterceptor.cancelHoverHide();
		});
		this.registerDomEvent(popoverRoot, "mouseleave", () => {
			if ((this.settings.triggerMethod ?? "hover") === "hover") {
				this.linkInterceptor.scheduleHoverHide();
			}
		});

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.linkEditManager.close();
			})
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!activeView) {
					this.linkEditManager.close();
				}
			})
		);
	}

	onunload(): void {
		this.linkEditManager?.destroy();
		this.linkInterceptor?.destroy();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<BetterLinksSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
