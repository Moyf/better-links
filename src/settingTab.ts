import { App, PluginSettingTab, Setting, SettingGroup } from "obsidian";
import type BetterLinksPlugin from "./main";

export class BetterLinksSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: BetterLinksPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
			const t = this.plugin.t.bind(this.plugin);

		containerEl.empty();
		containerEl.addClass("better-links-settings");

			new Setting(containerEl).setName(t("settingsHeading")).setHeading();

		const behaviorGroup = new SettingGroup(containerEl)
				.setHeading(t("settingsGeneral"))
			.addClass("better-links-settings-group");

		behaviorGroup.addSetting((setting) => {
			setting
					.setName(t("settingsEnableEditorName"))
					.setDesc(t("settingsEnableEditorDesc"))
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
						this.plugin.settings.enabled = value;
						await this.plugin.saveSettings();
					});
				});
		});

        behaviorGroup.addSetting((setting) => {
            setting
                .setName(t("settingsEdgeProtectionName"))
                .setDesc(t("settingsEdgeProtectionDesc"))
                .addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.edgeProtection ?? true).onChange(async (value) => {
                        this.plugin.settings.edgeProtection = value;
                        await this.plugin.saveSettings();
                    });
                });
        });

        behaviorGroup.addSetting((setting) => {
            setting
                .setName(t("settingsValidateInternalLinksName"))
                .setDesc(t("settingsValidateInternalLinksDesc"))
                .addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.validateInternalLinks ?? true).onChange(async (value) => {
                        this.plugin.settings.validateInternalLinks = value;
                        await this.plugin.saveSettings();
                    });
                });
        });

        behaviorGroup.addSetting((setting) => {
            setting
                .setName(t("settingsEnableLinkSuggestionsName"))
                .setDesc(t("settingsEnableLinkSuggestionsDesc"))
                .addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.enableLinkSuggestions ?? true).onChange(async (value) => {
                        this.plugin.settings.enableLinkSuggestions = value;
                        await this.plugin.saveSettings();
                    });
                });
        });

		const linkTypeGroup = new SettingGroup(containerEl)
				.setHeading(t("settingsSupportedTypes"))
			.addClass("better-links-settings-group");

		linkTypeGroup.addSetting((setting) => {
			setting
					.setName(t("settingsWikiName"))
					.setDesc(t("settingsWikiDesc"))
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.enableWikiLinks).onChange(async (value) => {
						this.plugin.settings.enableWikiLinks = value;
						await this.plugin.saveSettings();
					});
				});
		});

		linkTypeGroup.addSetting((setting) => {
			setting
					.setName(t("settingsMarkdownName"))
					.setDesc(t("settingsMarkdownDesc"))
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.enableMarkdownLinks).onChange(async (value) => {
						this.plugin.settings.enableMarkdownLinks = value;
						await this.plugin.saveSettings();
					});
				});
		});

		linkTypeGroup.addSetting((setting) => {
			setting
					.setName(t("settingsUrlName"))
					.setDesc(t("settingsUrlDesc"))
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.enablePlainUrls).onChange(async (value) => {
						this.plugin.settings.enablePlainUrls = value;
						await this.plugin.saveSettings();
					});
				});
		});

		linkTypeGroup.addSetting((setting) => {
			setting
				.setName(t("settingsImageName"))
				.setDesc(t("settingsImageDesc"))
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.enableImages).onChange(async (value) => {
						this.plugin.settings.enableImages = value;
						await this.plugin.saveSettings();
					});
				});
		});

		const actionGroup = new SettingGroup(containerEl)
				.setHeading(t("settingsActions"))
			.addClass("better-links-settings-group");

		actionGroup.addSetting((setting) => {
			setting
					.setName(t("settingsOpenExternalName"))
					.setDesc(t("settingsOpenExternalDesc"))
				.addDropdown((dropdown) => {
					dropdown
							.addOption("browser", t("settingsOpenExternalBrowser"))
							.addOption("obsidian", t("settingsOpenExternalObsidian"))
						.setValue(this.plugin.settings.externalLinkOpenMode)
						.onChange(async (value) => {
							this.plugin.settings.externalLinkOpenMode = value as typeof this.plugin.settings.externalLinkOpenMode;
							await this.plugin.saveSettings();
						});
				});
		});

		actionGroup.addSetting((setting) => {
			setting
					.setName(t("settingsDeleteBehaviorName"))
					.setDesc(t("settingsDeleteBehaviorDesc"))
				.addDropdown((dropdown) => {
					dropdown
							.addOption("preserve-text", t("settingsDeletePreserve"))
							.addOption("remove-all", t("settingsDeleteRemoveAll"))
						.setValue(this.plugin.settings.deleteLinkBehavior)
						.onChange(async (value) => {
							this.plugin.settings.deleteLinkBehavior = value as typeof this.plugin.settings.deleteLinkBehavior;
							await this.plugin.saveSettings();
						});
				});
		});
	}
}