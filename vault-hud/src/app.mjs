import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ helpers

function fmt(n) {
	if (n >= 1e6) return (n / 1e6).toFixed(n >= 10e6 ? 0 : 1) + "M";
	if (n >= 1e3) return (n / 1e3).toFixed(n >= 10e3 ? 0 : 1) + "K";
	return String(n);
}

function ago(ms) {
	const m = Math.floor(ms / 60e3);
	if (m < 1) return "now";
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h`;
	return `${Math.floor(h / 24)}d`;
}

function sparkline(el, values, width = 150, height = 26) {
	const max = Math.max(...values, 1);
	const pts = values
		.map((v, i) => `${((i / (values.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - (v / max) * (height - 6)).toFixed(1)}`)
		.join(" ");
	el.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.4" vector-effect="non-scaling-stroke"/></svg>`;
}

// ------------------------------------------------------------------ clock

function tickClock() {
	const now = new Date();
	const hh = String(now.getHours()).padStart(2, "0");
	const mm = String(now.getMinutes()).padStart(2, "0");
	const ss = String(now.getSeconds()).padStart(2, "0");
	$("clock-hm").textContent = `${hh}:${mm}`;
	$("clock-s").textContent = ss;
	const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
	const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
	$("clock-date").textContent = `${days[now.getDay()]} · ${months[now.getMonth()]} ${now.getDate()}`;
}
setInterval(tickClock, 1000);
tickClock();

// ------------------------------------------------------------------ forces

function forceGravity() {
	let nodes = [];
	let strength = 0.1;
	const force = (alpha) => {
		const k = strength * alpha;
		for (const n of nodes) {
			n.vx -= (n.x ?? 0) * k;
			n.vy -= (n.y ?? 0) * k;
			if (n.vz !== undefined) n.vz -= (n.z ?? 0) * k;
		}
	};
	force.initialize = (n) => (nodes = n);
	force.strength = (s) => ((strength = s), force);
	return force;
}

function forceSphereShell(radius) {
	let nodes = [];
	let strength = 0.25;
	const force = (alpha) => {
		const k = strength * alpha;
		for (const n of nodes) {
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
	force.initialize = (n) => (nodes = n);
	force.strength = (s) => ((strength = s), force);
	return force;
}

function forceCluster() {
	let nodes = [];
	let strength = 0.1;
	const force = (alpha) => {
		const centroids = new Map();
		for (const n of nodes) {
			if ((n.communitySize ?? 1) < 3) continue;
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
		for (const n of nodes) {
			const c = centroids.get(n.community);
			if (!c || c.count < 2) continue;
			n.vx += (c.x - n.x) * k;
			n.vy += (c.y - n.y) * k;
			if (n.vz !== undefined) n.vz += (c.z - n.z) * k;
		}
	};
	force.initialize = (n) => (nodes = n);
	force.strength = (s) => ((strength = s), force);
	return force;
}

// ------------------------------------------------------------------ graph

const GOLD_DIM = "#8f7530";
const GOLD = "#d9b45b";
const GOLD_HOT = "#ffe9a8";

let vaultName = "VAULT";

const graph = ForceGraph3D()($("graph"))
	.backgroundColor("#000000")
	.showNavInfo(false)
	.nodeRelSize(1.7)
	.nodeVal((n) => n.val)
	.nodeColor((n) => {
		if (n.degree >= 12) return GOLD_HOT;
		if (n.degree >= 4) return GOLD;
		return GOLD_DIM;
	})
	.nodeOpacity(0.95)
	.nodeLabel((n) => `<div class="node-tip">${n.name}</div>`)
	.linkColor(() => GOLD)
	.linkOpacity(0.12)
	.onNodeClick((n) => {
		if (n.type !== "note") return;
		const file = encodeURIComponent(n.id.replace(/\.md$/, ""));
		window.open(`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${file}`, "_self");
	})
	.onNodeHover((n) => {
		$("graph").style.cursor = n ? "pointer" : "default";
	});

const composer = graph.postProcessingComposer?.();
if (composer) {
	const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.45, 0.12);
	composer.addPass(bloom);
	composer.addPass(new OutputPass());
}

const controls = graph.controls();
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;
// pause idle rotation while the user is orbiting, resume after 8s
let resumeTimer = null;
controls.addEventListener("start", () => {
	controls.autoRotate = false;
	if (resumeTimer) clearTimeout(resumeTimer);
});
controls.addEventListener("end", () => {
	resumeTimer = setTimeout(() => (controls.autoRotate = true), 8000);
});

function sizeGraph() {
	graph.width(window.innerWidth).height(window.innerHeight);
}
window.addEventListener("resize", sizeGraph);
sizeGraph();

async function loadGraph() {
	const data = await fetch("/api/graph").then((r) => r.json());
	vaultName = data.vaultName;
	const radius = Math.cbrt(data.nodes.length) * 16 + 10;

	graph.d3Force("charge")?.strength(-55);
	const linkForce = graph.d3Force("link");
	if (linkForce) {
		linkForce.strength(0.6);
		linkForce.distance(34);
	}
	graph.d3Force("gravity", forceGravity().strength(0.1));
	graph.d3Force("shell", forceSphereShell(radius).strength(0.3));
	graph.d3Force("cluster", forceCluster().strength(0.1));

	graph.graphData({ nodes: data.nodes, links: data.links });
	setTimeout(() => graph.zoomToFit(1200, 90), 2500);
}

// ------------------------------------------------------------------ panels

async function loadStats() {
	const s = await fetch("/api/stats").then((r) => r.json());
	$("vault-name").textContent = s.vaultName.toUpperCase();

	$("stat-notes").textContent = fmt(s.totalNotes);
	$("stat-notes-side").textContent = `+${s.perWeek[11]} /wk`;
	sparkline($("spark-notes"), s.perWeek);

	$("stat-links").textContent = fmt(s.totalLinks);
	$("stat-links-side").textContent = `${s.totalTags} tags`;
	sparkline($("spark-links"), s.editsPerWeek);

	$("stat-words").textContent = fmt(s.totalWords);
	$("stat-words-side").textContent = `${s.orphans} orphans`;

	$("big-number").textContent = s.totalNotes.toLocaleString();
	$("velocity").textContent =
		`VELOCITY ${s.velocityPerDay}/DAY · LAST NOTE ${ago(s.lastNoteAgo)} AGO · ${s.clusterCount} CLUSTERS`;

	$("clusters").innerHTML = s.clusters
		.map(
			(c) =>
				`<div class="row"><span class="dot"></span><span class="row-name">${c.name.toUpperCase()}</span><span class="row-val">${c.size}</span></div>`
		)
		.join("");
	$("hubs").innerHTML = s.hubs
		.map(
			(h) =>
				`<div class="row"><span class="dot"></span><span class="row-name">${h.name.toUpperCase()}</span><span class="row-val">${h.degree}</span></div>`
		)
		.join("");
	$("documents").innerHTML = s.recent
		.map(
			(r) =>
				`<div class="row"><span class="row-name">${r.name}</span><span class="row-val">${ago(r.ago)}</span></div>`
		)
		.join("");
}

async function loadClaude() {
	try {
		const c = await fetch("/api/claude").then((r) => r.json());
		$("claude-pct").textContent = `${c.pct}`;
		$("claude-side").textContent = `${fmt(c.window5h)} of ${fmt(c.peak5h)} peak`;
		sparkline($("spark-claude"), c.hourly);
	} catch {
		$("claude-side").textContent = "no session data";
	}
}

loadGraph();
loadStats();
loadClaude();
setInterval(loadStats, 60e3);
setInterval(loadClaude, 60e3);
window.addEventListener("keydown", (e) => {
	if (e.key === "r") loadGraph();
	if (e.key === "f") graph.zoomToFit(800, 90);
});
