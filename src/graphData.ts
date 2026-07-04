import { App, TFile } from "obsidian";
import { Pg3dSettings } from "./settings";

export interface GraphNode {
	id: string; // file path, or "#tag" for tag nodes
	name: string;
	folder: string;
	type: "file" | "tag";
	val: number; // relative size, driven by degree
	community: number; // cluster index, 0-based, ordered by cluster size (largest first)
	communitySize: number;
	// force-graph mutates these at runtime; declared so TS doesn't complain
	x?: number;
	y?: number;
	z?: number;
	fx?: number | null;
	fy?: number | null;
	fz?: number | null;
}

export interface GraphLink {
	source: string;
	target: string;
}

export interface GraphData {
	nodes: GraphNode[];
	links: GraphLink[];
}

/**
 * Deterministic label propagation: every node starts as its own community,
 * then repeatedly adopts the most common label among its neighbors. Groups
 * form around hubs — notes and topics linked to the same node end up in the
 * same community. Ties break lexicographically so colors are stable across
 * reloads.
 */
function computeCommunities(nodeIds: string[], links: GraphLink[]): Map<string, string> {
	const adjacency = new Map<string, string[]>();
	for (const id of nodeIds) adjacency.set(id, []);
	for (const link of links) {
		adjacency.get(link.source)?.push(link.target);
		adjacency.get(link.target)?.push(link.source);
	}

	const order = [...nodeIds].sort();
	const label = new Map<string, string>();
	for (const id of order) label.set(id, id);

	for (let round = 0; round < 8; round++) {
		let changed = false;
		for (const id of order) {
			const counts = new Map<string, number>();
			for (const neighbor of adjacency.get(id) ?? []) {
				const l = label.get(neighbor);
				if (l !== undefined) counts.set(l, (counts.get(l) ?? 0) + 1);
			}
			if (counts.size === 0) continue;
			let best: string | null = null;
			let bestCount = 0;
			for (const [l, count] of counts) {
				if (count > bestCount || (count === bestCount && best !== null && l < best)) {
					best = l;
					bestCount = count;
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

function isExcluded(path: string, excludeFolders: string[]): boolean {
	return excludeFolders.some((folder) => {
		const f = folder.trim();
		if (!f) return false;
		return path === f || path.startsWith(f.endsWith("/") ? f : f + "/");
	});
}

export function buildGraphData(app: App, settings: Pg3dSettings): GraphData {
	const nodesById = new Map<string, GraphNode>();
	const links: GraphLink[] = [];
	const degree = new Map<string, number>();

	const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);

	const files = app.vault.getMarkdownFiles().filter(
		(f) => !isExcluded(f.path, settings.excludeFolders)
	);
	const filePaths = new Set(files.map((f) => f.path));

	const resolved = app.metadataCache.resolvedLinks;

	for (const file of files) {
		nodesById.set(file.path, {
			id: file.path,
			name: file.basename,
			folder: file.parent?.path ?? "",
			type: "file",
			val: 1,
			community: 0,
			communitySize: 1,
		});
	}

	for (const [sourcePath, targets] of Object.entries(resolved)) {
		if (!filePaths.has(sourcePath)) continue;
		for (const targetPath of Object.keys(targets)) {
			if (!filePaths.has(targetPath)) continue;
			if (sourcePath === targetPath) continue;
			links.push({ source: sourcePath, target: targetPath });
			bump(sourcePath);
			bump(targetPath);
		}
	}

	if (settings.showTags) {
		for (const file of files) {
			const cache = app.metadataCache.getFileCache(file);
			const tags = new Set<string>();
			(cache?.tags ?? []).forEach((t) => tags.add(t.tag));
			const fmTags = cache?.frontmatter?.tags;
			if (fmTags) {
				const arr = Array.isArray(fmTags) ? fmTags : [fmTags];
				arr.forEach((t) => tags.add(`#${String(t).replace(/^#/, "")}`));
			}
			for (const tag of tags) {
				const tagId = `tag:${tag}`;
				if (!nodesById.has(tagId)) {
					nodesById.set(tagId, {
						id: tagId,
						name: tag,
						folder: "",
						type: "tag",
						val: 1,
						community: 0,
						communitySize: 1,
					});
				}
				links.push({ source: file.path, target: tagId });
				bump(file.path);
				bump(tagId);
			}
		}
	}

	if (!settings.showOrphans) {
		for (const [id, deg] of degree.entries()) {
			if (deg === 0) nodesById.delete(id);
		}
		for (const [id, node] of nodesById.entries()) {
			if (node.type === "file" && !degree.has(id)) nodesById.delete(id);
		}
	}

	for (const [id, node] of nodesById.entries()) {
		const deg = degree.get(id) ?? 0;
		node.val = 1 + Math.sqrt(deg);
	}

	// assign cluster membership: index communities by size (largest = 0) so the
	// biggest regions always claim the first palette colors
	const labels = computeCommunities(Array.from(nodesById.keys()), links);
	const sizeByLabel = new Map<string, number>();
	for (const [id] of nodesById) {
		const l = labels.get(id) ?? id;
		sizeByLabel.set(l, (sizeByLabel.get(l) ?? 0) + 1);
	}
	const orderedLabels = Array.from(sizeByLabel.keys()).sort((a, b) => {
		const diff = (sizeByLabel.get(b) ?? 0) - (sizeByLabel.get(a) ?? 0);
		return diff !== 0 ? diff : a < b ? -1 : 1;
	});
	const indexByLabel = new Map(orderedLabels.map((l, i) => [l, i]));
	for (const [id, node] of nodesById) {
		const l = labels.get(id) ?? id;
		node.community = indexByLabel.get(l) ?? 0;
		node.communitySize = sizeByLabel.get(l) ?? 1;
	}

	return { nodes: Array.from(nodesById.values()), links };
}

export function fileFromNodeId(app: App, id: string): TFile | null {
	const file = app.vault.getAbstractFileByPath(id);
	return file instanceof TFile ? file : null;
}
