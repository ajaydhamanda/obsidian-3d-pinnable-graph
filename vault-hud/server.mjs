import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PLUGIN_ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT ?? 3000);

// ---------------------------------------------------------------- vault path

function vaultPath() {
	if (process.env.OBSIDIAN_VAULT) return process.env.OBSIDIAN_VAULT;
	const f = path.join(PLUGIN_ROOT, ".vault-path");
	if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim();
	console.error("Set OBSIDIAN_VAULT or create a .vault-path file next to package.json");
	process.exit(1);
}

const VAULT = vaultPath();
const VAULT_NAME = path.basename(VAULT);

// ---------------------------------------------------------------- vault scan

function listMarkdownFiles(dir, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		if (e.name.startsWith(".")) continue;
		const p = path.join(dir, e.name);
		if (e.isDirectory()) listMarkdownFiles(p, out);
		else if (e.name.endsWith(".md")) out.push(p);
	}
	return out;
}

const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const INLINE_TAG_RE = /(^|[\s(])#([A-Za-z][\w/-]*)/g;

function parseFrontmatterTags(text, tags) {
	const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fm) return;
	const inline = fm[1].match(/^tags:\s*\[?([^\]\n]*)\]?\s*$/m);
	if (inline && inline[1].trim()) {
		for (const t of inline[1].split(/[,\s]+/)) {
			const clean = t.replace(/^#/, "").replace(/['"]/g, "").trim();
			if (clean) tags.add(clean);
		}
	}
	const list = fm[1].match(/^tags:\s*\r?\n((?:[ \t]*-[^\n]*\r?\n?)+)/m);
	if (list) {
		for (const line of list[1].split("\n")) {
			const clean = line.replace(/^[ \t]*-[ \t]*/, "").replace(/^#/, "").replace(/['"]/g, "").trim();
			if (clean) tags.add(clean);
		}
	}
}

/** Deterministic label propagation — same algorithm as the Obsidian plugin. */
function computeCommunities(ids, links) {
	const adjacency = new Map(ids.map((id) => [id, []]));
	for (const l of links) {
		adjacency.get(l.source)?.push(l.target);
		adjacency.get(l.target)?.push(l.source);
	}
	const order = [...ids].sort();
	const label = new Map(order.map((id) => [id, id]));
	for (let round = 0; round < 8; round++) {
		let changed = false;
		for (const id of order) {
			const counts = new Map();
			for (const nb of adjacency.get(id) ?? []) {
				const l = label.get(nb);
				if (l !== undefined) counts.set(l, (counts.get(l) ?? 0) + 1);
			}
			if (!counts.size) continue;
			let best = null;
			let bestCount = 0;
			for (const [l, c] of counts) {
				if (c > bestCount || (c === bestCount && best !== null && l < best)) {
					best = l;
					bestCount = c;
				}
			}
			if (best !== null && best !== label.get(id)) {
				label.set(id, best);
				changed = true;
			}
		}
		if (!changed) break;
	}
	return label;
}

function buildVaultModel() {
	const files = listMarkdownFiles(VAULT);
	const notes = files.map((f) => {
		const st = fs.statSync(f);
		return {
			path: path.relative(VAULT, f),
			base: path.basename(f, ".md"),
			text: fs.readFileSync(f, "utf8"),
			birth: st.birthtimeMs || st.ctimeMs,
			mtime: st.mtimeMs,
		};
	});

	const byBase = new Map();
	for (const n of notes) {
		const k = n.base.toLowerCase();
		if (!byBase.has(k)) byBase.set(k, n.path);
	}

	const links = [];
	const linkKeys = new Set();
	const tagMembers = new Map(); // tag -> Set(paths)
	for (const n of notes) {
		let m;
		WIKILINK_RE.lastIndex = 0;
		while ((m = WIKILINK_RE.exec(n.text))) {
			const target = byBase.get(m[1].trim().toLowerCase());
			if (!target || target === n.path) continue;
			const key = `${n.path}>${target}`;
			if (linkKeys.has(key)) continue;
			linkKeys.add(key);
			links.push({ source: n.path, target });
		}
		const tags = new Set();
		INLINE_TAG_RE.lastIndex = 0;
		while ((m = INLINE_TAG_RE.exec(n.text))) tags.add(m[2]);
		parseFrontmatterTags(n.text, tags);
		for (const t of tags) {
			if (!tagMembers.has(t)) tagMembers.set(t, new Set());
			tagMembers.get(t).add(n.path);
		}
	}

	const nodes = notes.map((n) => ({ id: n.path, name: n.base, type: "note" }));
	for (const [tag, members] of tagMembers) {
		const id = `tag:#${tag}`;
		nodes.push({ id, name: `#${tag}`, type: "tag" });
		for (const p of members) links.push({ source: p, target: id });
	}

	const degree = new Map();
	for (const l of links) {
		degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
		degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
	}
	for (const n of nodes) {
		n.degree = degree.get(n.id) ?? 0;
		n.val = 1 + Math.sqrt(n.degree);
	}

	const labels = computeCommunities(nodes.map((n) => n.id), links);
	const sizeByLabel = new Map();
	for (const n of nodes) {
		const l = labels.get(n.id) ?? n.id;
		sizeByLabel.set(l, (sizeByLabel.get(l) ?? 0) + 1);
	}
	const ordered = [...sizeByLabel.keys()].sort(
		(a, b) => (sizeByLabel.get(b) ?? 0) - (sizeByLabel.get(a) ?? 0) || (a < b ? -1 : 1)
	);
	const indexByLabel = new Map(ordered.map((l, i) => [l, i]));
	for (const n of nodes) {
		const l = labels.get(n.id) ?? n.id;
		n.community = indexByLabel.get(l) ?? 0;
		n.communitySize = sizeByLabel.get(l) ?? 1;
	}

	return { nodes, links, notes, tagMembers, ordered, sizeByLabel, labels };
}

function buildStats(model) {
	const { nodes, links, notes, tagMembers, ordered, sizeByLabel, labels } = model;
	const now = Date.now();
	const noteNodes = nodes.filter((n) => n.type === "note");
	const noteLinks = links.filter((l) => !String(l.target).startsWith("tag:"));
	const orphans = noteNodes.filter((n) => n.degree === 0).length;

	// name each cluster after its best-connected note
	const bestByLabel = new Map();
	for (const n of nodes) {
		const l = labels.get(n.id) ?? n.id;
		const cur = bestByLabel.get(l);
		if (!cur || n.degree > cur.degree) bestByLabel.set(l, n);
	}
	const clusters = ordered
		.filter((l) => (sizeByLabel.get(l) ?? 0) >= 3)
		.slice(0, 6)
		.map((l) => ({ name: bestByLabel.get(l)?.name ?? "—", size: sizeByLabel.get(l) ?? 0 }));

	const hubs = [...noteNodes].sort((a, b) => b.degree - a.degree).slice(0, 6)
		.map((n) => ({ name: n.name, degree: n.degree }));

	const recent = [...notes].sort((a, b) => b.mtime - a.mtime).slice(0, 6)
		.map((n) => ({ name: n.base, ago: now - n.mtime }));

	const WEEK = 7 * 864e5;
	const perWeek = Array.from({ length: 12 }, () => 0);
	for (const n of notes) {
		const w = Math.floor((now - n.birth) / WEEK);
		if (w >= 0 && w < 12) perWeek[11 - w]++;
	}
	const linksPerWeek = Array.from({ length: 12 }, () => 0);
	for (const n of notes) {
		const w = Math.floor((now - n.mtime) / WEEK);
		if (w >= 0 && w < 12) linksPerWeek[11 - w]++;
	}

	const last7 = notes.filter((n) => now - n.birth < WEEK).length;
	const lastNote = Math.min(...notes.map((n) => now - n.mtime));
	const words = notes.reduce((sum, n) => sum + n.text.split(/\s+/).length, 0);

	return {
		vaultName: VAULT_NAME,
		totalNotes: noteNodes.length,
		totalLinks: noteLinks.length,
		totalTags: tagMembers.size,
		totalWords: words,
		orphans,
		clusterCount: ordered.filter((l) => (sizeByLabel.get(l) ?? 0) >= 3).length,
		clusters,
		hubs,
		recent,
		perWeek,
		editsPerWeek: linksPerWeek,
		velocityPerDay: +(last7 / 7).toFixed(1),
		lastNoteAgo: lastNote,
	};
}

// ---------------------------------------------------------------- claude usage

let claudeCache = { at: 0, data: null };

function claudeUsage() {
	if (Date.now() - claudeCache.at < 5 * 60e3 && claudeCache.data) return claudeCache.data;
	const dir = path.join(os.homedir(), ".claude", "projects");
	const events = [];
	const now = Date.now();
	const cutoff = now - 7 * 864e5;
	const walk = (d) => {
		let entries;
		try {
			entries = fs.readdirSync(d, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith(".jsonl")) {
				let st;
				try {
					st = fs.statSync(p);
				} catch {
					continue;
				}
				if (st.mtimeMs < cutoff || st.size > 200 * 1024 * 1024) continue;
				let text;
				try {
					text = fs.readFileSync(p, "utf8");
				} catch {
					continue;
				}
				for (const line of text.split("\n")) {
					if (!line.includes('"usage"')) continue;
					try {
						const o = JSON.parse(line);
						const u = o.message?.usage;
						const ts = Date.parse(o.timestamp);
						if (!u || !ts || ts < cutoff) continue;
						const tokens =
							(u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
						if (tokens > 0) events.push([ts, tokens]);
					} catch {
						/* skip malformed lines */
					}
				}
			}
		}
	};
	walk(dir);
	events.sort((a, b) => a[0] - b[0]);

	const H5 = 5 * 3600e3;
	const window5h = events.filter(([t]) => now - t < H5).reduce((s, [, v]) => s + v, 0);
	const midnight = new Date();
	midnight.setHours(0, 0, 0, 0);
	const today = events.filter(([t]) => t >= midnight.getTime()).reduce((s, [, v]) => s + v, 0);

	// busiest rolling 5h window of the past 7 days
	let peak5h = 0;
	let lo = 0;
	let acc = 0;
	for (let hi = 0; hi < events.length; hi++) {
		acc += events[hi][1];
		while (events[hi][0] - events[lo][0] > H5) acc -= events[lo++][1];
		if (acc > peak5h) peak5h = acc;
	}

	const hourly = Array.from({ length: 24 }, () => 0);
	for (const [t, v] of events) {
		const h = Math.floor((now - t) / 3600e3);
		if (h >= 0 && h < 24) hourly[23 - h] += v;
	}

	const data = { window5h, today, peak5h, pct: peak5h ? Math.round((window5h / peak5h) * 100) : 0, hourly };
	claudeCache = { at: Date.now(), data };
	return data;
}

// ---------------------------------------------------------------- http server

const MIME = {
	".html": "text/html",
	".js": "text/javascript",
	".css": "text/css",
	".svg": "image/svg+xml",
	".json": "application/json",
};

function sendJSON(res, obj) {
	res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
	res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
	const url = new URL(req.url, "http://localhost");
	try {
		if (url.pathname === "/api/graph") {
			const model = buildVaultModel();
			return sendJSON(res, {
				vaultName: VAULT_NAME,
				nodes: model.nodes,
				links: model.links,
			});
		}
		if (url.pathname === "/api/stats") return sendJSON(res, buildStats(buildVaultModel()));
		if (url.pathname === "/api/claude") return sendJSON(res, claudeUsage());

		let file = url.pathname === "/" ? "/index.html" : url.pathname;
		const full = path.join(PUBLIC_DIR, path.normalize(file));
		if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full)) {
			res.writeHead(404);
			return res.end("not found");
		}
		res.writeHead(200, { "Content-Type": MIME[path.extname(full)] ?? "application/octet-stream" });
		res.end(fs.readFileSync(full));
	} catch (err) {
		console.error(err);
		res.writeHead(500);
		res.end(String(err?.message ?? err));
	}
});

server.listen(PORT, () => {
	console.log(`VAULT HUD → http://localhost:${PORT}  (vault: ${VAULT_NAME})`);
});
