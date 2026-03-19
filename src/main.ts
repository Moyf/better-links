import { MarkdownView, Plugin } from "obsidian";
import { LinkEditManager } from "./linkEditManager";
import { LinkInterceptor } from "./linkInterceptor";
import { BetterLinksSettingTab } from "./settingTab";
import { BetterLinksSettings, DEFAULT_SETTINGS } from "./settings";

export default class BetterLinksPlugin extends Plugin {
	settings: BetterLinksSettings;
	private linkEditManager: LinkEditManager;
	private linkInterceptor: LinkInterceptor;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.linkEditManager = new LinkEditManager(this);
		this.linkInterceptor = new LinkInterceptor(this, this.linkEditManager);

		this.addSettingTab(new BetterLinksSettingTab(this.app, this));

		this.addCommand({
			id: "close-link-editor",
			name: "Close link editor",
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
			"pointerdown",
			(event: PointerEvent) => {
				void this.linkInterceptor.handlePointerDown(event);
			},
			{ capture: true }
		);

		this.registerDomEvent(
			document,
			"click",
			(event: MouseEvent) => {
				void this.linkInterceptor.handleClick(event);
			},
			{ capture: true }
		);

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
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<BetterLinksSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
