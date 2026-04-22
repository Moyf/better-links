import { App, PluginSettingTab, Setting, SettingGroup } from "obsidian";
import type BetterLinksPlugin from "./main";

export class BetterLinksSettingTab extends PluginSettingTab {
	icon: string = "link";

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
                .setName(t("settingsTriggerMethodName"))
                .setDesc(t("settingsTriggerMethodDesc"))
                .addDropdown((dropdown) => {
                    dropdown
                        .addOption("hover", t("settingsTriggerMethodHover"))
                        .addOption("click", t("settingsTriggerMethodClick"))
                        .addOption("right-click", t("settingsTriggerMethodRightClick"))
                        .setValue(this.plugin.settings.triggerMethod ?? "hover")
                        .onChange(async (value) => {
                            this.plugin.settings.triggerMethod = value as typeof this.plugin.settings.triggerMethod;
                            await this.plugin.saveSettings();
                            updateDisableNativeClickVisibility();
                        });
                });
        });

        let disableNativeClickEl: HTMLElement | null = null;
        const updateDisableNativeClickVisibility = () => {
            const isClickMode = (this.plugin.settings.triggerMethod ?? "hover") === "click";
            disableNativeClickEl?.toggleClass("is-hidden", isClickMode);
        };

        behaviorGroup.addSetting((setting) => {
            disableNativeClickEl = setting.settingEl;
            setting
                .setName(t("settingsDisableNativeClickName"))
                .setDesc(t("settingsDisableNativeClickDesc"))
                .addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.disableNativeClick ?? false).onChange(async (value) => {
                        this.plugin.settings.disableNativeClick = value;
                        await this.plugin.saveSettings();
                    });
                });
        });
        updateDisableNativeClickVisibility();

        behaviorGroup.addSetting((setting) => {
            setting
                .setName(t("settingsTriggerModifierName"))
                .setDesc(t("settingsTriggerModifierDesc"))
                .addDropdown((dropdown) => {
                    dropdown
                        .addOption("none", t("settingsTriggerModifierNone"))
                        .addOption("ctrl", t("settingsTriggerModifierCtrl"))
                        .addOption("shift", t("settingsTriggerModifierShift"))
                        .addOption("alt", t("settingsTriggerModifierAlt"))
                        .setValue(this.plugin.settings.triggerModifier ?? "none")
                        .onChange(async (value) => {
                            this.plugin.settings.triggerModifier = value as typeof this.plugin.settings.triggerModifier;
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
                .setName(t("settingsAlwaysShowDisplayTextName"))
                .setDesc(t("settingsAlwaysShowDisplayTextDesc"))
                .addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.alwaysShowDisplayText ?? false).onChange(async (value) => {
                        this.plugin.settings.alwaysShowDisplayText = value;
                        await this.plugin.saveSettings();
                    });
                });
        });

        // ── 链接建议 group ────────────────────────────────────────────────────
        const suggestGroup = new SettingGroup(containerEl)
            .setHeading(t("settingsLinkSuggestionsGroup"))
            .addClass("better-links-settings-group");

        // 子项元素列表（启用开关关闭时全部隐藏）
        const suggestSubEls: HTMLElement[] = [];

        const updateSuggestSubSettings = () => {
            const enabled = this.plugin.settings.enableLinkSuggestions ?? true;
            const syncEnabled = this.plugin.settings.syncAlias ?? false;
            const mode = this.plugin.settings.aliasSyncMode ?? "heading-only";
            const showAliasSub = syncEnabled && mode !== "heading-only";
            for (const el of suggestSubEls) {
                el.toggleClass("is-hidden", !enabled);
            }
            if (enabled) {
                aliasModeSettingEl?.toggleClass("is-hidden", !syncEnabled);
                aliasSepSettingEl?.toggleClass("is-hidden", !showAliasSub);
                aliasTitlePropSettingEl?.toggleClass("is-hidden", !showAliasSub);
            }
        };

        suggestGroup.addSetting((setting) => {
            setting
                .setName(t("settingsEnableLinkSuggestionsName"))
                .setDesc(t("settingsEnableLinkSuggestionsDesc"))
                .addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.enableLinkSuggestions ?? true).onChange(async (value) => {
                        this.plugin.settings.enableLinkSuggestions = value;
                        await this.plugin.saveSettings();
                        updateSuggestSubSettings();
                    });
                });
        });

        // ── 别名同步子设置 ──────────────────────────────────────────────────
        let aliasModeSettingEl: HTMLElement | null = null;
        let aliasSepSettingEl: HTMLElement | null = null;
        let aliasTitlePropSettingEl: HTMLElement | null = null;

        suggestGroup.addSetting((setting) => {
            suggestSubEls.push(setting.settingEl);
            setting
                .setName(t("settingsSyncAliasName"))
                .setDesc(t("settingsSyncAliasDesc"))
                .addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.syncAlias ?? false).onChange(async (value) => {
                        this.plugin.settings.syncAlias = value;
                        await this.plugin.saveSettings();
                        updateSuggestSubSettings();
                    });
                });
        });

        suggestGroup.addSetting((setting) => {
            aliasModeSettingEl = setting.settingEl;
            suggestSubEls.push(setting.settingEl);
            setting
                .setName(t("settingsAliasSyncModeName"))
                .setDesc(t("settingsAliasSyncModeDesc"))
                .addDropdown((dropdown) => {
                    dropdown
                        .addOption("heading-only", t("settingsAliasModeHeadingOnly"))
                        .addOption("filename-then-heading", t("settingsAliasModeFileThenHeading"))
                        .addOption("heading-then-filename", t("settingsAliasModeHeadingThenFile"))
                        .setValue(this.plugin.settings.aliasSyncMode ?? "heading-only")
                        .onChange(async (value) => {
                            this.plugin.settings.aliasSyncMode = value as typeof this.plugin.settings.aliasSyncMode;
                            await this.plugin.saveSettings();
                            updateSuggestSubSettings();
                        });
                });
        });

        suggestGroup.addSetting((setting) => {
            aliasSepSettingEl = setting.settingEl;
            suggestSubEls.push(setting.settingEl);
            setting
                .setName(t("settingsAliasSeparatorName"))
                .setDesc(t("settingsAliasSeparatorDesc"))
                .addText((text) => {
                    text.setValue(this.plugin.settings.aliasSeparator ?? " > ").onChange(async (value) => {
                        this.plugin.settings.aliasSeparator = value;
                        await this.plugin.saveSettings();
                    });
                });
        });

        suggestGroup.addSetting((setting) => {
            aliasTitlePropSettingEl = setting.settingEl;
            suggestSubEls.push(setting.settingEl);
            setting
                .setName(t("settingsAliasTitlePropertyName"))
                .setDesc(t("settingsAliasTitlePropertyDesc"))
                .addText((text) => {
                    text.setPlaceholder("title").setValue(this.plugin.settings.aliasTitleProperty ?? "title").onChange(async (value) => {
                        this.plugin.settings.aliasTitleProperty = value || "title";
                        await this.plugin.saveSettings();
                    });
                });
        });

        // 初始化可见状态
        updateSuggestSubSettings();

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

		actionGroup.addSetting((setting) => {
			setting
				.setName(t("settingsShowEmbedToggleName"))
				.setDesc(t("settingsShowEmbedToggleDesc"))
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.showEmbedToggle ?? false).onChange(async (value) => {
						this.plugin.settings.showEmbedToggle = value;
						await this.plugin.saveSettings();
					});
				});
		});

		// ── 排除特定链接 group ──────────────────────────────────────────────
		const excludeGroup = new SettingGroup(containerEl)
			.setHeading(t("settingsExcludeGroup"))
			.addClass("better-links-settings-group");

		let excludeKeywordsEl: HTMLElement | null = null;

		const updateExcludeSubSettings = () => {
			const mode = this.plugin.settings.excludeMode ?? "disabled";
			excludeKeywordsEl?.toggleClass("is-hidden", mode === "disabled");
		};

		excludeGroup.addSetting((setting) => {
			setting
				.setName(t("settingsExcludeModeName"))
				.setDesc(t("settingsExcludeModeDesc"))
				.addDropdown((dropdown) => {
					dropdown
						.addOption("disabled", t("settingsExcludeModeDisabled"))
						.addOption("hover", t("settingsExcludeModeHover"))
						.addOption("click", t("settingsExcludeModeClick"))
						.addOption("all", t("settingsExcludeModeAll"))
						.setValue(this.plugin.settings.excludeMode ?? "disabled")
						.onChange(async (value) => {
							this.plugin.settings.excludeMode = value as typeof this.plugin.settings.excludeMode;
							await this.plugin.saveSettings();
							updateExcludeSubSettings();
						});
				});
		});

		excludeGroup.addSetting((setting) => {
			excludeKeywordsEl = setting.settingEl;
			setting
				.setName(t("settingsExcludeKeywordsName"))
				.setDesc(t("settingsExcludeKeywordsDesc"))
				.addTextArea((textArea) => {
					textArea
						.setPlaceholder(".base, .canvas")
						.setValue(this.plugin.settings.excludeKeywords ?? ".base, .canvas")
						.onChange(async (value) => {
							this.plugin.settings.excludeKeywords = value;
							await this.plugin.saveSettings();
						});
					textArea.inputEl.rows = 3;
					textArea.inputEl.cols = 30;
				});
		});

		updateExcludeSubSettings();
	}
}
