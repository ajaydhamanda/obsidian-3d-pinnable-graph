import { ItemView, WorkspaceLeaf, Notice, setIcon } from "obsidian";
import ForceGraph3D from "3d-force-graph";
import SpriteText from "three-spritetext";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type Pg3dPlugin from "./main";
import { buildGraphData, fileFromNodeId, GraphNode } from "./graphData";
import { renderSettingsControls } from "./settingsUI";

export const VIEW_TYPE_PG3D = "pg3d-graph-view";

// deterministic color for a folder path, used when "color nodes by folder" is on
function colorForFolder(folder: string): string {
	if (!folder) return "#8a8f98";
	let hash = 0;
	for (let i = 0; i < folder.length; i++) {
		hash = (hash << 5) - hash + folder.charCodeAt(i);
		hash |= 0;
	}
	const hue = Math.abs(hash) % 360;
	return `hsl(${hue}, 65%, 60%)`;
}

// curated palette for the largest clusters; golden-angle hues cover the overflow
const CLUSTER_PALETTE = [
	"#38bdf8", // sky
	"#e8a33d", // amber
	"#a78bfa", // violet
	"#34d399", // emerald
	"#f472b6", // rose
	"#f87171", // coral
	"#facc15", // gold
	"#4ade80", // green
	"#22d3ee", // cyan
	"#fb923c", // orange
	"#818cf8", // indigo
	"#e879f9", // fuchsia
];
const LOOSE_NODE_COLOR = "#7a8090"; // nodes without a real cluster stay neutral slate

function colorForCluster(node: GraphNode): string {
	if (node.communitySize < 3) return LOOSE_NODE_COLOR;
	if (node.community < CLUSTER_PALETTE.length) return CLUSTER_PALETTE[node.community];
	const hue = Math.round((node.community * 137.508) % 360);
	return `hsl(${hue}, 62%, 60%)`;
}

// blend a color toward the background — used to recede dimmed nodes and links
function mixToward(color: string, background: string, amount: number): string {
	const c = new THREE.Color(color).lerp(new THREE.Color(background), amount);
	return `#${c.getHexString()}`;
}

/**
 * Custom d3 force: every tick, pull each node toward the centroid of its own
 * cluster. This is what makes communities condense into distinct regions
 * instead of one homogeneous blob. Pinned nodes are left alone.
 */
function forceCluster() {
	let nodes: GraphNode[] = [];
	let strength = 0.25;

	const force = (alpha: number) => {
		const centroids = new Map<number, { x: number; y: number; z: number; count: number }>();
		for (const n of nodes) {
			if (n.communitySize < 3) continue;
			let c = centroids.get(n.community);
			if (!c) centroids.set(n.community, (c = { x: 0, y: 0, z: 0, count: 0 }));
			c.x += n.x ?? 0;
			c.y += n.y ?? 0;
			c.z += n.z ?? 0;
			c.count++;
		}
		for (const c of centroids.values()) {
			c.x /= c.count;
			c.y /= c.count;
			c.z /= c.count;
		}
		const k = strength * alpha;
		for (const n of nodes as any[]) {
			if (n.fx != null) continue;
			const c = centroids.get(n.community);
			if (!c || c.count < 2) continue;
			n.vx += (c.x - n.x) * k;
			n.vy += (c.y - n.y) * k;
			if (n.vz !== undefined) n.vz += (c.z - n.z) * k;
		}
	};
	force.initialize = (n: GraphNode[]) => (nodes = n);
	force.strength = (s: number) => {
		strength = s;
		return force;
	};
	return force;
}

/**
 * Gentle pull on every node toward the origin. The stock "center" force only
 * re-centers the scene as a whole, so weakly-linked nodes can drift off to
 * infinity under charge repulsion — this keeps the graph one contained ball.
 */
function forceGravity() {
	let nodes: GraphNode[] = [];
	let strength = 0.1;

	const force = (alpha: number) => {
		const k = strength * alpha;
		for (const n of nodes as any[]) {
			if (n.fx != null) continue;
			n.vx -= (n.x ?? 0) * k;
			n.vy -= (n.y ?? 0) * k;
			if (n.vz !== undefined) n.vz -= (n.z ?? 0) * k;
		}
	};
	force.initialize = (n: GraphNode[]) => (nodes = n);
	force.strength = (s: number) => {
		strength = s;
		return force;
	};
	return force;
}

/**
 * Push every node toward an invisible spherical shell so the graph keeps a
 * clean spherical silhouette regardless of how the other forces are tuned.
 * Nodes outside the shell get pulled in, nodes buried in the core get nudged
 * out. Radius is set from the node count on every data load.
 */
function forceSphereShell() {
	let nodes: GraphNode[] = [];
	let strength = 0;
	let radius = 100;

	const force = (alpha: number) => {
		if (strength <= 0) return;
		const k = strength * alpha;
		for (const n of nodes as any[]) {
			if (n.fx != null) continue;
			const x = n.x ?? 0;
			const y = n.y ?? 0;
			const z = n.z ?? 0;
			const r = Math.sqrt(x * x + y * y + z * z);
			if (r < 1e-6) continue;
			const push = ((radius - r) / r) * k;
			n.vx += x * push;
			n.vy += y * push;
			if (n.vz !== undefined) n.vz += z * push;
		}
	};
	force.initialize = (n: GraphNode[]) => (nodes = n);
	force.strength = (s: number) => {
		strength = s;
		return force;
	};
	force.radius = (r: number) => {
		radius = r;
		return force;
	};
	return force;
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
	);
}

export class Pg3dGraphView extends ItemView {
	plugin: Pg3dPlugin;
	private graph: any;
	private graphEl: HTMLElement;
	private hintEl: HTMLElement;
	private controlsEl: HTMLElement;
	private panelEl: HTMLElement;
	private panelOpen = false;
	private pinnedIds: Set<string> = new Set();
	private resizeObserver: ResizeObserver | null = null;
	private refreshTimer: number | null = null;
	private dataSignature = "";
	private bloomPass: UnrealBloomPass | null = null;
	private adjacency: Map<string, Set<string>> = new Map();
	private hubLabelIds: Set<string> = new Set();
	private hoverNodeId: string | null = null;
	private sphereGeo = new THREE.SphereGeometry(1, 24, 16);
	private ringGeo = new THREE.TorusGeometry(1.7, 0.14, 8, 32);
	private materialCache: Map<string, THREE.Material> = new Map();

	constructor(leaf: WorkspaceLeaf, plugin: Pg3dPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_PG3D;
	}

	getDisplayText(): string {
		return "3D Pinnable Graph";
	}

	getIcon(): string {
		return "atom";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("pg3d-view-content");

		this.graphEl = container.createDiv({ cls: "pg3d-container" });
		this.hintEl = container.createDiv({ cls: "pg3d-hint" });
		this.hintEl.setText("Click to pin · Drag to place · Right-click to open");

		this.controlsEl = container.createDiv({ cls: "pg3d-controls" });
		const fitBtn = this.controlsEl.createEl("button", {
			cls: "pg3d-icon-btn",
			attr: { "aria-label": "Fit graph to view" },
		});
		setIcon(fitBtn, "maximize");
		this.registerDomEvent(fitBtn, "click", () => this.fitToView());

		const settingsBtn = this.controlsEl.createEl("button", {
			cls: "pg3d-icon-btn",
			attr: { "aria-label": "Graph settings" },
		});
		setIcon(settingsBtn, "settings-2");
		this.registerDomEvent(settingsBtn, "click", () => this.toggleSettingsPanel());

		this.panelEl = container.createDiv({ cls: "pg3d-panel" });

		this.pinnedIds = new Set(Object.keys(this.plugin.settings.pinnedNodes));

		this.graph = ForceGraph3D()(this.graphEl);

		const composer = this.graph.postProcessingComposer?.();
		if (composer) {
			this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.25);
			composer.addPass(this.bloomPass);
			// converts the linear-space composer output back to sRGB — without
			// this the whole frame renders washed-out grey
			composer.addPass(new OutputPass());
		}

		this.configureGraph();
		this.loadData();

		this.resizeObserver = new ResizeObserver(() => this.handleResize());
		this.resizeObserver.observe(this.graphEl);

		this.registerEvent(this.app.vault.on("create", () => this.scheduleRefresh()));
		this.registerEvent(this.app.vault.on("delete", () => this.scheduleRefresh()));
		this.registerEvent(this.app.vault.on("rename", () => this.scheduleRefresh()));
		this.registerEvent(this.app.metadataCache.on("resolved", () => this.scheduleRefresh()));
	}

	async onClose(): Promise<void> {
		if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
		this.resizeObserver?.disconnect();
		if (this.graph) {
			this.graph.pauseAnimation?.();
			this.graph._destructor?.();
		}
		for (const mat of this.materialCache.values()) mat.dispose();
		this.materialCache.clear();
		this.sphereGeo.dispose();
		this.ringGeo.dispose();
	}

	private scheduleRefresh() {
		if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
		this.refreshTimer = window.setTimeout(() => this.loadData(), 600);
	}

	private handleResize() {
		if (!this.graph) return;
		const { clientWidth, clientHeight } = this.graphEl;
		this.graph.width(clientWidth).height(clientHeight);
	}

	loadData(force = false) {
		const settings = this.plugin.settings;
		const data = buildGraphData(this.app, settings);

		// skip the rebuild when nothing structural changed, so background
		// metadata events (which fire on every edit) don't disturb the layout
		const signature =
			data.nodes.map((n) => n.id).join("|") +
			"§" +
			data.links.map((l) => `${l.source}>${l.target}`).join("|");
		if (!force && signature === this.dataSignature) return;
		this.dataSignature = signature;

		// carry over current positions so surviving nodes don't jump on refresh
		const prevNodes: Map<string, GraphNode> = new Map(
			(this.graph.graphData().nodes as GraphNode[]).map((n) => [n.id, n])
		);
		for (const node of data.nodes) {
			const prev = prevNodes.get(node.id);
			if (prev) {
				node.x = prev.x;
				node.y = prev.y;
				node.z = prev.z;
			}
		}

		// restore locked positions for pinned nodes so they don't jump on refresh
		for (const node of data.nodes) {
			const pinned = settings.pinnedNodes[node.id];
			if (pinned) {
				node.x = pinned.x;
				node.y = pinned.y;
				node.z = pinned.z;
				node.fx = pinned.x;
				node.fy = pinned.y;
				node.fz = pinned.z;
			}
		}
		this.pinnedIds = new Set(Object.keys(settings.pinnedNodes));

		// adjacency map for hover focus
		this.adjacency = new Map();
		for (const link of data.links) {
			if (!this.adjacency.has(link.source)) this.adjacency.set(link.source, new Set());
			if (!this.adjacency.has(link.target)) this.adjacency.set(link.target, new Set());
			this.adjacency.get(link.source)!.add(link.target);
			this.adjacency.get(link.target)!.add(link.source);
		}

		// hub labels: the best-connected ~12% of nodes (at least 8, at most 40)
		const ranked = [...data.nodes].sort((a, b) => b.val - a.val);
		const hubCount = Math.min(40, Math.max(8, Math.round(data.nodes.length * 0.12)));
		this.hubLabelIds = new Set(ranked.slice(0, hubCount).map((n) => n.id));

		// size the sphere shell to the vault
		this.graph.d3Force("shell")?.radius(Math.cbrt(data.nodes.length) * 16 + 10);

		this.hoverNodeId = null;
		this.graph.graphData(data);
		this.handleResize();
	}

	fitToView() {
		this.graph?.zoomToFit(600, 40);
	}

	private toggleSettingsPanel(open = !this.panelOpen) {
		this.panelOpen = open;
		this.panelEl.toggleClass("is-open", open);
		this.controlsEl.toggleClass("is-hidden", open);
		if (open) this.renderSettingsPanel();
	}

	private renderSettingsPanel() {
		this.panelEl.empty();

		const header = this.panelEl.createDiv({ cls: "pg3d-panel-header" });
		header.createSpan({ cls: "pg3d-panel-title", text: "Graph settings" });
		const closeBtn = header.createEl("button", {
			cls: "pg3d-icon-btn",
			attr: { "aria-label": "Close settings" },
		});
		setIcon(closeBtn, "x");
		this.registerDomEvent(closeBtn, "click", () => this.toggleSettingsPanel(false));

		const body = this.panelEl.createDiv({ cls: "pg3d-panel-body" });
		renderSettingsControls(body, this.plugin, () => this.renderSettingsPanel());
	}

	private nodeRadius(node: GraphNode): number {
		return Math.cbrt(node.val) * this.plugin.settings.nodeRelSize;
	}

	private colorForNode(node: GraphNode): string {
		const settings = this.plugin.settings;
		if (this.pinnedIds.has(node.id)) return settings.pinnedNodeColor;
		if (settings.colorMode === "cluster") return colorForCluster(node);
		if (node.type === "tag") return "#c084fc";
		if (settings.colorMode === "folder") return colorForFolder(node.folder);
		return settings.nodeColor;
	}

	configureGraph() {
		const settings = this.plugin.settings;
		if (!this.graph) return;

		if (this.bloomPass) {
			this.bloomPass.enabled = settings.glow;
			this.bloomPass.strength = settings.glowIntensity;
		}

		this.graph
			.showNavInfo(false)
			.backgroundColor(settings.backgroundColor)
			.nodeRelSize(settings.nodeRelSize)
			.nodeVal((n: GraphNode) => n.val)
			.nodeColor((n: GraphNode) => this.colorForNode(n))
			.nodeLabel(
				(n: GraphNode) =>
					`<div class="pg3d-node-tooltip">${escapeHtml(n.name)}${
						this.pinnedIds.has(n.id) ? " 📌" : ""
					}</div>`
			)
			.linkColor((l: any) => this.colorForLink(l))
			.linkOpacity(settings.linkOpacity)
			.linkDirectionalParticles(settings.showParticles ? settings.particleCount : 0)
			.linkDirectionalParticleSpeed(settings.particleSpeed)
			.linkDirectionalParticleColor(() => settings.particleColor)
			.nodeThreeObjectExtend(false)
			.nodeThreeObject((n: GraphNode) => {
				const group = new THREE.Group();
				const radius = this.nodeRadius(n);
				const color = this.colorForNode(n);

				const sphere = new THREE.Mesh(this.sphereGeo, this.nodeMaterial(color, false));
				sphere.scale.setScalar(radius);
				(sphere as any).__pg3dRole = "node";
				(sphere as any).__pg3dColor = color;
				group.add(sphere);

				const showLabel =
					settings.labelMode === "all" ||
					(settings.labelMode === "hubs" && this.hubLabelIds.has(n.id));
				if (showLabel) {
					const sprite = new SpriteText(n.name);
					sprite.color = settings.labelColor;
					sprite.textHeight = settings.labelSize;
					sprite.position.set(0, radius + settings.labelSize, 0);
					(sprite.material as THREE.Material).transparent = true;
					(sprite as any).__pg3dRole = "label";
					group.add(sprite);
				}

				if (this.pinnedIds.has(n.id)) {
					const ring = new THREE.Mesh(
						this.ringGeo,
						this.nodeMaterial(settings.pinnedRingColor, false)
					);
					ring.scale.setScalar(radius);
					ring.rotation.x = Math.PI / 2;
					(ring as any).__pg3dRole = "ring";
					group.add(ring);
				}

				return group;
			})
			.onNodeClick((node: GraphNode) => this.togglePin(node))
			.onNodeRightClick((node: GraphNode) => this.openNode(node))
			.onNodeDragEnd((node: GraphNode) => this.pinAt(node, node.x!, node.y!, node.z!))
			.onNodeHover((node: GraphNode | null) => {
				this.graphEl.toggleClass("pg3d-cursor-pointer", !!node);
				const id = node && settings.hoverFocus ? node.id : null;
				if (id !== this.hoverNodeId) {
					this.hoverNodeId = id;
					this.applyHoverFocus();
				}
			});

		this.applyForces();
		this.applyCamera();
	}

	/** Cluster-tinted links: same-community links glow in their region's color. */
	private colorForLink(l: any): string {
		const settings = this.plugin.settings;
		const source: GraphNode | null = typeof l.source === "object" ? l.source : null;
		const target: GraphNode | null = typeof l.target === "object" ? l.target : null;

		let base = settings.linkColor;
		if (
			settings.colorMode === "cluster" &&
			source &&
			target &&
			source.community === target.community &&
			source.communitySize >= 3
		) {
			base = mixToward(colorForCluster(source), settings.linkColor, 0.35);
		}

		if (this.hoverNodeId && source && target) {
			const touchesHover = source.id === this.hoverNodeId || target.id === this.hoverNodeId;
			if (!touchesHover) return mixToward(base, settings.backgroundColor, 0.88);
		}
		return base;
	}

	/** Shared, cached materials — one per finish/color/brightness/dim combination. */
	private nodeMaterial(color: string, dimmed: boolean): THREE.Material {
		const settings = this.plugin.settings;
		const finish = settings.nodeFinish;
		const brightness = settings.nodeBrightness;
		const key = `${finish}|${dimmed ? "dim" : "lit"}|${brightness.toFixed(2)}|${color}`;
		let mat = this.materialCache.get(key);
		if (!mat) {
			const bright = `#${new THREE.Color(color).multiplyScalar(brightness).getHexString()}`;
			const c = dimmed ? mixToward(bright, settings.backgroundColor, 0.78) : bright;
			if (finish === "glossy") {
				mat = new THREE.MeshPhysicalMaterial({
					color: c,
					roughness: 0.3,
					metalness: 0.05,
					clearcoat: 0.9,
					clearcoatRoughness: 0.25,
				});
			} else {
				mat = new THREE.MeshLambertMaterial({ color: c });
			}
			if (dimmed) {
				mat.transparent = true;
				mat.opacity = 0.5;
			}
			this.materialCache.set(key, mat);
		}
		return mat;
	}

	/** Swap materials/label opacity so the hovered node and its neighbors pop. */
	private applyHoverFocus() {
		const hover = this.hoverNodeId;
		const highlight = new Set<string>();
		if (hover) {
			highlight.add(hover);
			for (const nb of this.adjacency.get(hover) ?? []) highlight.add(nb);
		}
		for (const n of this.graph.graphData().nodes as any[]) {
			const obj = n.__threeObj as THREE.Object3D | undefined;
			if (!obj) continue;
			const dim = hover !== null && !highlight.has(n.id);
			obj.traverse((child: any) => {
				if (child.__pg3dRole === "node") {
					child.material = this.nodeMaterial(child.__pg3dColor, dim);
				} else if (child.__pg3dRole === "label") {
					child.material.opacity = dim ? 0.06 : 1;
				} else if (child.__pg3dRole === "ring") {
					child.visible = !dim;
				}
			});
		}
		// re-evaluate link colors without rebuilding node objects
		this.graph.linkColor(this.graph.linkColor());
	}

	applyForces() {
		const settings = this.plugin.settings;
		if (!this.graph) return;
		const chargeForce = this.graph.d3Force("charge");
		if (chargeForce) chargeForce.strength(settings.chargeStrength);
		const linkForce = this.graph.d3Force("link");
		if (linkForce) {
			linkForce.strength(settings.linkStrength);
			linkForce.distance(settings.linkDistance);
		}
		let gravityForce = this.graph.d3Force("gravity");
		if (!gravityForce) {
			gravityForce = forceGravity();
			this.graph.d3Force("gravity", gravityForce);
		}
		gravityForce.strength(settings.centerStrength);
		let clusterForce = this.graph.d3Force("cluster");
		if (!clusterForce) {
			clusterForce = forceCluster();
			this.graph.d3Force("cluster", clusterForce);
		}
		clusterForce.strength(settings.clusterStrength);
		let shellForce = this.graph.d3Force("shell");
		if (!shellForce) {
			shellForce = forceSphereShell();
			this.graph.d3Force("shell", shellForce);
		}
		shellForce.strength(settings.sphereStrength);
		this.graph.d3ReheatSimulation();
	}

	applyCamera() {
		const settings = this.plugin.settings;
		if (!this.graph) return;
		const controls = this.graph.controls();
		if (controls) {
			controls.autoRotate = settings.autoRotate;
			controls.autoRotateSpeed = settings.autoRotateSpeed;
		}
	}

	/** Called by the settings tab whenever any setting changes, to live-update the view. */
	applySettings() {
		this.configureGraph();
		this.graph?.refresh();
	}

	private togglePin(node: GraphNode) {
		if (this.pinnedIds.has(node.id)) {
			this.unpin(node);
		} else {
			this.pinAt(node, node.x ?? 0, node.y ?? 0, node.z ?? 0);
		}
	}

	private pinAt(node: GraphNode, x: number, y: number, z: number) {
		node.fx = x;
		node.fy = y;
		node.fz = z;
		this.pinnedIds.add(node.id);
		this.plugin.settings.pinnedNodes[node.id] = { x, y, z };
		this.plugin.saveSettings();
		this.graph?.refresh();
	}

	private unpin(node: GraphNode) {
		node.fx = undefined;
		node.fy = undefined;
		node.fz = undefined;
		this.pinnedIds.delete(node.id);
		delete this.plugin.settings.pinnedNodes[node.id];
		this.plugin.saveSettings();
		this.graph?.d3ReheatSimulation();
		this.graph?.refresh();
	}

	private openNode(node: GraphNode) {
		if (node.type !== "file") return;
		const file = fileFromNodeId(this.app, node.id);
		if (!file) {
			new Notice(`"${node.name}" not found`);
			return;
		}
		const leaf = this.app.workspace.getLeaf("tab");
		leaf.openFile(file);
	}
}
