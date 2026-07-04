import { App, PluginSettingTab } from "obsidian";
import type Pg3dPlugin from "./main";
import { renderSettingsControls } from "./settingsUI";

export class Pg3dSettingTab extends PluginSettingTab {
	plugin: Pg3dPlugin;

	constructor(app: App, plugin: Pg3dPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		this.containerEl.empty();
		renderSettingsControls(this.containerEl, this.plugin, () => this.display());
	}
}
