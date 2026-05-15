import { getLanguage, MarkdownView, Plugin } from "obsidian";
import { createTranslator, type I18nKey } from "./i18n";
import { LinkEditManager } from "./linkEditManager";
import { LinkInterceptor } from "./linkInterceptor";
import { BetterLinksSettingTab } from "./settingTab";
import { BetterLinksSettings, DEFAULT_SETTINGS } from "./settings";

export default class BetterLinksPlugin extends Plugin {
	settings: BetterLinksSettings;
	private readonly translate = createTranslator(
		getLanguage()
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

		// 为主窗口注册 document 级事件
		this.registerDocumentEvents(document);

		// 为每个新打开的 popout window 注册同样的事件
		this.registerEvent(
			this.app.workspace.on("window-open", (_win, win) => {
				this.registerDocumentEvents(win.document);
			})
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

	/**
	 * 将所有 document 级事件注册到指定 document 上。
	 * 主窗口的 document 在 onload 调用，popout window 在 window-open 时调用。
	 * registerDomEvent 会在 unload 时自动清理。
	 */
	private registerDocumentEvents(doc: Document): void {
		this.registerDomEvent(
			doc,
			"click",
			(event: MouseEvent) => {
				void this.linkInterceptor.handleClick(event);
			},
			{ capture: true }
		);

		this.registerDomEvent(
			doc,
			"pointerdown",
			(event: PointerEvent) => {
				this.linkInterceptor.handlePointerDown(event);
			},
			{ capture: true }
		);

		// iOS WebView 上 pointerdown 的 preventDefault 不能阻止原生链接跳转，
		// 需要额外监听 touchstart（capture）来补充拦截。
		this.registerDomEvent(
			doc,
			"touchstart",
			(event: TouchEvent) => {
				this.linkInterceptor.handleTouchStart(event);
			},
			{ capture: true, passive: false }
		);

		// touchmove：检测拖动手势，超过阈值时取消 touch 拦截，保留滚动行为
		this.registerDomEvent(
			doc,
			"touchmove",
			(event: TouchEvent) => {
				this.linkInterceptor.handleTouchMove(event);
			},
			{ capture: true, passive: true }
		);

		// touchend：touchstart 确认链接后，在 touchend 打开 popover
		this.registerDomEvent(
			doc,
			"touchend",
			(event: TouchEvent) => {
				this.linkInterceptor.handleTouchEnd(event);
			},
			{ capture: true }
		);

		this.registerDomEvent(
			doc,
			"contextmenu",
			(event: MouseEvent) => {
				void this.linkInterceptor.handleContextMenu(event);
			},
			{ capture: true }
		);

		this.registerDomEvent(
			doc,
			"mousemove",
			(event: MouseEvent) => {
				this.linkInterceptor.handleMouseMove(event);
			},
		);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<BetterLinksSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
