import { App, PluginSettingTab, Setting, SettingGroup } from "obsidian";
import type BetterLinksPlugin from "./main";

export class BetterLinksSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: BetterLinksPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.addClass("better-links-settings");

		new Setting(containerEl).setName("Link editor").setHeading();

		const behaviorGroup = new SettingGroup(containerEl)
			.setHeading("General")
			.addClass("better-links-settings-group");

		behaviorGroup.addSetting((setting) => {
			setting
				.setName("Enable link editor")
				.setDesc("Intercept supported links in the Markdown editor and open the floating editor.")
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
						this.plugin.settings.enabled = value;
						await this.plugin.saveSettings();
					});
				});
		});

		const linkTypeGroup = new SettingGroup(containerEl)
			.setHeading("Supported link types")
			.addClass("better-links-settings-group");

		linkTypeGroup.addSetting((setting) => {
			setting
				.setName("Wikilinks")
				.setDesc("Support links like [[note]] and [[note|alias]].")
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.enableWikiLinks).onChange(async (value) => {
						this.plugin.settings.enableWikiLinks = value;
						await this.plugin.saveSettings();
					});
				});
		});

		linkTypeGroup.addSetting((setting) => {
			setting
				.setName("Markdown links")
				.setDesc("Support links like [label](target).")
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.enableMarkdownLinks).onChange(async (value) => {
						this.plugin.settings.enableMarkdownLinks = value;
						await this.plugin.saveSettings();
					});
				});
		});

		linkTypeGroup.addSetting((setting) => {
			setting
				.setName("Plain web links")
				.setDesc("Support plain links like https://example.com.")
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.enablePlainUrls).onChange(async (value) => {
						this.plugin.settings.enablePlainUrls = value;
						await this.plugin.saveSettings();
					});
				});
		});

		const actionGroup = new SettingGroup(containerEl)
			.setHeading("Actions")
			.addClass("better-links-settings-group");

		actionGroup.addSetting((setting) => {
			setting
				.setName("Open external links in")
				.setDesc("Choose whether external web links open in the system browser or in an Obsidian window.")
				.addDropdown((dropdown) => {
					dropdown
						.addOption("browser", "System browser")
						.addOption("obsidian", "Obsidian window")
						.setValue(this.plugin.settings.externalLinkOpenMode)
						.onChange(async (value) => {
							this.plugin.settings.externalLinkOpenMode = value as typeof this.plugin.settings.externalLinkOpenMode;
							await this.plugin.saveSettings();
						});
				});
		});

		actionGroup.addSetting((setting) => {
			setting
				.setName("Delete link behavior")
				.setDesc("Choose whether deleting a link keeps its visible text or removes it completely.")
				.addDropdown((dropdown) => {
					dropdown
						.addOption("preserve-text", "Preserve text")
						.addOption("remove-all", "Remove everything")
						.setValue(this.plugin.settings.deleteLinkBehavior)
						.onChange(async (value) => {
							this.plugin.settings.deleteLinkBehavior = value as typeof this.plugin.settings.deleteLinkBehavior;
							await this.plugin.saveSettings();
						});
				});
		});
	}
}