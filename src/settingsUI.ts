import { Setting } from "obsidian";
import type Pg3dPlugin from "./main";
import type { ColorMode, LabelMode, NodeFinish } from "./settings";

/**
 * Renders the full set of plugin settings controls into any container.
 * Used by both the plugin settings tab and the in-view floating panel.
 * `rerender` is called when a control needs the whole section repainted
 * (e.g. the pinned-node count after "Unpin all").
 */
export function renderSettingsControls(
	containerEl: HTMLElement,
	plugin: Pg3dPlugin,
	rerender: () => void
): void {
	const s = plugin.settings;

	const refresh = async () => {
		await plugin.saveSettings();
		plugin.applyToViews();
	};

	// ---- Forces ----
	new Setting(containerEl).setName("Forces").setHeading();

	new Setting(containerEl)
		.setName("Node size")
		.setDesc("Relative size of node spheres.")
		.addSlider((sl) =>
			sl
				.setLimits(1, 12, 0.5)
				.setValue(s.nodeRelSize)
				.setDynamicTooltip()
				.onChange(async (v) => {
					s.nodeRelSize = v;
					await refresh();
				})
		);

	new Setting(containerEl)
		.setName("Link strength")
		.setDesc("How strongly connected nodes pull toward their resting distance (spring stiffness).")
		.addSlider((sl) =>
			sl
				.setLimits(0, 2, 0.05)
				.setValue(s.linkStrength)
				.setDynamicTooltip()
				.onChange(async (v) => {
					s.linkStrength = v;
					await refresh();
				})
		);

	new Setting(containerEl)
		.setName("Link distance")
		.setDesc("Resting length of the links between connected nodes.")
		.addSlider((sl) =>
			sl
				.setLimits(5, 200, 5)
				.setValue(s.linkDistance)
				.setDynamicTooltip()
				.onChange(async (v) => {
					s.linkDistance = v;
					await refresh();
				})
		);

	new Setting(containerEl)
		.setName("Charge (repulsion)")
		.setDesc("How strongly nodes push each other apart. More negative = more spread out.")
		.addSlider((sl) =>
			sl
				.setLimits(-200, 0, 5)
				.setValue(s.chargeStrength)
				.setDynamicTooltip()
				.onChange(async (v) => {
					s.chargeStrength = v;
					await refresh();
				})
		);

	new Setting(containerEl)
		.setName("Central force")
		.setDesc("How strongly the whole graph is pulled toward the center. 0 lets it drift freely.")
		.addSlider((sl) =>
			sl
				.setLimits(0, 1, 0.05)
				.setValue(s.centerStrength)
				.setDynamicTooltip()
				.onChange(async (v) => {
					s.centerStrength = v;
					await refresh();
				})
		);

	new Setting(containerEl)
		.setName("Cluster gravity")
		.setDesc("How strongly notes that share a hub pull together into their own region. 0 turns clustering off.")
		.addSlider((sl) =>
			sl
				.setLimits(0, 1, 0.05)
				.setValue(s.clusterStrength)
				.setDynamicTooltip()
				.onChange(async (v) => {
					s.clusterStrength = v;
					await refresh();
				})
		);

	new Setting(containerEl)
		.setName("Sphere shell")
		.setDesc("Push all notes toward an invisible sphere so the graph always keeps a spherical silhouette. 0 turns it off.")
		.addSlider((sl) =>
			sl
				.setLimits(0, 1, 0.05)
				.setValue(s.sphereStrength)
				.setDynamicTooltip()
				.onChange(async (v) => {
					s.sphereStrength = v;
					await refresh();
				})
		);

	// ---- Colors ----
	new Setting(containerEl).setName("Colors").setHeading();

	new Setting(containerEl)
		.setName("Background")
		.addColorPicker((c) =>
			c.setValue(s.backgroundColor).onChange(async (v) => {
				s.backgroundColor = v;
				await refresh();
			})
		);

	new Setting(containerEl)
		.setName("Node color")
		.addColorPicker((c) =>
			c.setValue(s.nodeColor).onChange(async (v) => {
				s.nodeColor = v;
				await refresh();
			})
		);

	new Setting(containerEl)
		.setName("Pinned node color")
		.addColorPicker((c) =>
			c.setValue(s.pinnedNodeColor).onChange(async (v) => {
				s.pinnedNodeColor = v;
				await refresh();
			})
		);

	new Setting(containerEl)
		.setName("Pinned ring color")
		.addColorPicker((c) =>
			c.setValue(s.pinnedRingColor).onChange(async (v) => {
				s.pinnedRingColor = v;
				await refresh();
			})
		);

	new Setting(containerEl)
		.setName("Link color")
		.addColorPicker((c) =>
			c.setValue(s.linkColor).onChange(async (v) => {
				s.linkColor = v;
				await refresh();
			})
		);

	new Setting(containerEl)
		.setName("Link opacity")
		.addSlider((sl) =>
			sl
				.setLimits(0.05, 1, 0.05)
				.setValue(s.linkOpacity)
				.setDynamicTooltip()
				.onChange(async (v) => {
					s.linkOpacity = v;
					await refresh();
				})
		);

	new Setting(containerEl)
		.setName("Color nodes")
		.setDesc("By cluster gives each region of connected notes its own color; loose notes stay neutral.")
		.addDropdown((d) =>
			d
				.addOption("cluster", "By cluster")
				.addOption("folder", "By folder")
				.addOption("single", "Single color")
				.setValue(s.colorMode)
				.onChange(async (v) => {
					s.colorMode = v as ColorMode;
					await refresh();
				})
		);

	// ---- Effects ----
	new Setting(containerEl).setName("Effects").setHeading();

	new Setting(containerEl)
		.setName("Glow")
		.setDesc("Soft bloom that makes nodes luminous against the background.")
		.addToggle((t) =>
			t.setValue(s.glow).onChange(async (v) => {
				s.glow = v;
				await refresh();
			})
		);

	new Setting(containerEl)
		.setName("Glow intensity")
		.setDesc("How far the bloom halo spreads. 0 is barely a shimmer.")
		.addSlider((sl) =>
			sl
				.setLimits(0, 3, 0.05)
				.setValue(s.glowIntensity)
				.setDynamicTooltip()
				.onChange(async (v) => {
					s.glowIntensity = v;
					await refresh();
				})
		);

	new Setting(containerEl)
		.setName("Node brightness")
		.setDesc("Dim or brighten the node spheres themselves — also tames how hard they bloom.")
		.addSlider((sl) =>
			sl
				.setLimits(0.3, 1.5, 0.05)
				.setValue(s.nodeBrightness)
				.setDynamicTooltip()
				.onChange(async (v) => {
					s.nodeBrightness = v;
					await refresh();
				})
		);

	new Setting(containerEl)
		.setName("Node finish")
		.setDesc("Glossy adds a lacquered highlight to every sphere.")
		.addDropdown((d) =>
			d
				.addOption("glossy", "Glossy")
				.addOption("matte", "Matte")
				.setValue(s.nodeFinish)
				.onChange(async (v) => {
					s.nodeFinish = v as NodeFinish;
					await refresh();
				})
		);

	new Setting(containerEl)
		.setName("Hover focus")
		.setDesc("Highlight the hovered note and its direct connections; everything else recedes.")
		.addToggle((t) =>
			t.setValue(s.hoverFocus).onChange(async (v) => {
				s.hoverFocus = v;
				await refresh();
			})
		);

	// ---- Labels ----
	new Setting(containerEl).setName("Labels").setHeading();

	new Setting(containerEl)
		.setName("Show labels")
		.setDesc("Hubs only keeps the graph clean by labeling just the best-connected notes.")
		.addDropdown((d) =>
			d
				.addOption("hubs", "Hubs only")
				.addOption("all", "All notes")
				.addOption("hover", "On hover only")
				.setValue(s.labelMode)
				.onChange(async (v) => {
					s.labelMode = v as LabelMode;
					await refresh();
				})
		);

	new Setting(containerEl)
		.setName("Label size")
		.addSlider((sl) =>
			sl
				.setLimits(2, 16, 1)
				.setValue(s.labelSize)
				.setDynamicTooltip()
				.onChange(async (v) => {
					s.labelSize = v;
					await refresh();
				})
		);

	new Setting(containerEl)
		.setName("Label color")
		.addColorPicker((c) =>
			c.setValue(s.labelColor).onChange(async (v) => {
				s.labelColor = v;
				await refresh();
			})
		);

	// ---- Link particles ----
	new Setting(containerEl).setName("Link flow particles").setHeading();

	new Setting(containerEl)
		.setName("Show particles")
		.setDesc("Animate small dots flowing along links, to show link direction.")
		.addToggle((t) =>
			t.setValue(s.showParticles).onChange(async (v) => {
				s.showParticles = v;
				await refresh();
			})
		);

	new Setting(containerEl)
		.setName("Particle count")
		.addSlider((sl) =>
			sl
				.setLimits(1, 6, 1)
				.setValue(s.particleCount)
				.setDynamicTooltip()
				.onChange(async (v) => {
					s.particleCount = v;
					await refresh();
				})
		);

	new Setting(containerEl)
		.setName("Particle speed")
		.addSlider((sl) =>
			sl
				.setLimits(0.001, 0.02, 0.001)
				.setValue(s.particleSpeed)
				.setDynamicTooltip()
				.onChange(async (v) => {
					s.particleSpeed = v;
					await refresh();
				})
		);

	new Setting(containerEl)
		.setName("Particle color")
		.addColorPicker((c) =>
			c.setValue(s.particleColor).onChange(async (v) => {
				s.particleColor = v;
				await refresh();
			})
		);

	// ---- Camera ----
	new Setting(containerEl).setName("Camera").setHeading();

	new Setting(containerEl)
		.setName("Auto-rotate")
		.setDesc("Slowly orbit the camera around the graph automatically.")
		.addToggle((t) =>
			t.setValue(s.autoRotate).onChange(async (v) => {
				s.autoRotate = v;
				await refresh();
			})
		);

	new Setting(containerEl)
		.setName("Auto-rotate speed")
		.addSlider((sl) =>
			sl
				.setLimits(0.1, 3, 0.1)
				.setValue(s.autoRotateSpeed)
				.setDynamicTooltip()
				.onChange(async (v) => {
					s.autoRotateSpeed = v;
					await refresh();
				})
		);

	// ---- Scope ----
	new Setting(containerEl).setName("Scope").setHeading();

	new Setting(containerEl)
		.setName("Show orphan notes")
		.setDesc("Include notes that have no links to or from any other note.")
		.addToggle((t) =>
			t.setValue(s.showOrphans).onChange(async (v) => {
				s.showOrphans = v;
				plugin.reloadGraphData();
				await refresh();
			})
		);

	new Setting(containerEl)
		.setName("Show tags as nodes")
		.setDesc("Add each tag as its own node, linked to every note that uses it.")
		.addToggle((t) =>
			t.setValue(s.showTags).onChange(async (v) => {
				s.showTags = v;
				plugin.reloadGraphData();
				await refresh();
			})
		);

	new Setting(containerEl)
		.setName("Excluded folders")
		.setDesc("One folder path per line. Notes inside these folders are hidden from the graph.")
		.addTextArea((ta) =>
			ta
				.setPlaceholder("Templates\nAttachments/private")
				.setValue(s.excludeFolders.join("\n"))
				.onChange(async (v) => {
					s.excludeFolders = v
						.split("\n")
						.map((f) => f.trim())
						.filter(Boolean);
					plugin.reloadGraphData();
					await refresh();
				})
		);

	// ---- Pins ----
	new Setting(containerEl).setName("Pins").setHeading();

	new Setting(containerEl)
		.setName("Pinned nodes")
		.setDesc(`${Object.keys(s.pinnedNodes).length} node(s) currently pinned.`)
		.addButton((b) =>
			b.setButtonText("Unpin all").onClick(async () => {
				await plugin.unpinAll();
				rerender();
			})
		);
}
