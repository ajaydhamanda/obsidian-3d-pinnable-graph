export interface PinnedPosition {
	x: number;
	y: number;
	z: number;
}

export type ColorMode = "cluster" | "folder" | "single";
export type LabelMode = "all" | "hubs" | "hover";
export type NodeFinish = "glossy" | "matte";

export interface Pg3dSettings {
	settingsVersion: number;

	// Forces
	nodeRelSize: number; // node sphere size
	linkStrength: number; // spring strength between connected nodes (0-1 in d3-force-3d)
	linkDistance: number; // resting length of a link
	chargeStrength: number; // repulsion between all nodes (negative = repel)
	centerStrength: number; // pull toward the center of the scene (0 = off)
	clusterStrength: number; // pull toward the centroid of the node's own cluster
	sphereStrength: number; // pull toward an invisible spherical shell (0 = off)

	// Effects
	glow: boolean;
	glowIntensity: number;
	nodeBrightness: number; // scales node sphere color (1 = palette as-is)
	nodeFinish: NodeFinish;
	hoverFocus: boolean; // highlight hovered node + neighbors, dim the rest

	// Colors
	backgroundColor: string;
	nodeColor: string;
	pinnedNodeColor: string;
	pinnedRingColor: string;
	linkColor: string;
	linkOpacity: number;
	labelColor: string;

	// Node coloring
	colorMode: ColorMode;

	// Labels
	labelMode: LabelMode;
	labelSize: number;

	// Link particles (animated flow along edges)
	showParticles: boolean;
	particleSpeed: number;
	particleCount: number;
	particleColor: string;

	// Camera
	autoRotate: boolean;
	autoRotateSpeed: number;

	// Scope / filtering
	excludeFolders: string[];
	showOrphans: boolean;
	showTags: boolean;

	// Persisted pin state: file path -> locked xyz position
	pinnedNodes: Record<string, PinnedPosition>;
}

export const DEFAULT_SETTINGS: Pg3dSettings = {
	settingsVersion: 2,

	nodeRelSize: 3,
	linkStrength: 0.7,
	linkDistance: 35,
	chargeStrength: -60,
	centerStrength: 0.1,
	clusterStrength: 0.12,
	sphereStrength: 0.25,

	glow: true,
	glowIntensity: 0.55,
	nodeBrightness: 1,
	nodeFinish: "glossy",
	hoverFocus: true,

	backgroundColor: "#0d0d10",
	nodeColor: "#4c9eff",
	pinnedNodeColor: "#ff9d4c",
	pinnedRingColor: "#ffd24c",
	linkColor: "#5a5f6b",
	linkOpacity: 0.3,
	labelColor: "#e6e6e6",

	colorMode: "cluster",

	labelMode: "hubs",
	labelSize: 6,

	showParticles: false,
	particleSpeed: 0.006,
	particleCount: 2,
	particleColor: "#ffffff",

	autoRotate: false,
	autoRotateSpeed: 0.6,

	excludeFolders: [],
	showOrphans: true,
	showTags: false,

	pinnedNodes: {},
};
