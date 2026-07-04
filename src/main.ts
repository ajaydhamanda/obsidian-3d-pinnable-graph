import { Notice, Plugin, TAbstractFile, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, Pg3dSettings } from "./settings";
import { Pg3dGraphView, VIEW_TYPE_PG3D } from "./GraphView";
import { Pg3dSettingTab } from "./SettingsTab";

export default class Pg3dPlugin extends Plugin {
	settings: Pg3dSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_PG3D, (leaf) => new Pg3dGraphView(leaf, this));

		this.addRibbonIcon("atom", "Open 3D pinnable graph", () => {
			this.activateView();
		});

		this.addCommand({
			id: "open-graph",
			name: "Open graph",
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: "fit-graph-to-view",
			name: "Fit graph to view",
			checkCallback: (checking) => {
				const views = this.graphLeaves();
				if (views.length === 0) return false;
				if (!checking) views.forEach((v) => v.fitToView());
				return true;
			},
		});

		this.addCommand({
			id: "export-graph-image",
			name: "Export graph image",
			checkCallback: (checking) => {
				const views = this.graphLeaves();
				if (views.length === 0) return false;
				if (!checking) views[0].exportImage();
				return true;
			},
		});

		this.addCommand({
			id: "unpin-all-nodes",
			name: "Unpin all nodes",
			checkCallback: (checking) => {
				const count = Object.keys(this.settings.pinnedNodes).length;
				if (count === 0) return false;
				if (!checking) this.unpinAll();
				return true;
			},
		});

		// Keep persisted pins in sync with the vault: follow renames, drop deletions.
		this.registerEvent(
			this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				const pin = this.settings.pinnedNodes[oldPath];
				if (pin) {
					this.settings.pinnedNodes[file.path] = pin;
					delete this.settings.pinnedNodes[oldPath];
					this.saveSettings();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file: TAbstractFile) => {
				if (this.settings.pinnedNodes[file.path]) {
					delete this.settings.pinnedNodes[file.path];
					this.saveSettings();
				}
			})
		);

		this.addSettingTab(new Pg3dSettingTab(this.app, this));
	}

	onunload() {
		// views are cleaned up automatically by Obsidian calling onClose()
	}

	async activateView() {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_PG3D);
		if (existing.length > 0) {
			await workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE_PG3D, active: true });
		await workspace.revealLeaf(leaf);
	}

	async unpinAll() {
		this.settings.pinnedNodes = {};
		await this.saveSettings();
		this.reloadGraphData();
		new Notice("All nodes unpinned");
	}

	private graphLeaves(): Pg3dGraphView[] {
		return this.app.workspace
			.getLeavesOfType(VIEW_TYPE_PG3D)
			.map((leaf: WorkspaceLeaf) => leaf.view as Pg3dGraphView);
	}

	/** Push current settings into every open graph view without rebuilding its data. */
	applyToViews() {
		for (const view of this.graphLeaves()) view.applySettings();
	}

	/** Rebuild graph data (e.g. after scope/filter settings change) in every open graph view. */
	reloadGraphData() {
		for (const view of this.graphLeaves()) view.loadData(true);
	}

	async loadSettings() {
		const data = ((await this.loadData()) ?? {}) as Record<string, unknown>;
		const version = (data.settingsVersion as number | undefined) ?? 0;
		if (version < 1) {
			// v0 -> v1: clustered layout became the default. Drop values that
			// still sit at the old defaults so the new defaults apply, and map
			// the old folder-coloring toggle onto the color-mode dropdown.
			if (data.colorNodesByFolder === true) data.colorMode = "folder";
			delete data.colorNodesByFolder;
			if (data.nodeRelSize === 4) delete data.nodeRelSize;
			if (data.linkStrength === 1) delete data.linkStrength;
			if (data.linkDistance === 30) delete data.linkDistance;
			if (data.chargeStrength === -30) delete data.chargeStrength;
			if (data.centerStrength === 0.3) delete data.centerStrength;
			if (data.linkOpacity === 0.35) delete data.linkOpacity;
		}
		if (version < 2) {
			// v1 -> v2: the show-labels toggle became the label-mode dropdown
			if (data.showLabels === false) data.labelMode = "hover";
			delete data.showLabels;
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		this.settings.settingsVersion = DEFAULT_SETTINGS.settingsVersion;
		if (version < DEFAULT_SETTINGS.settingsVersion) await this.saveData(this.settings);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
