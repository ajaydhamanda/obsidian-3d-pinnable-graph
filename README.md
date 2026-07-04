# 3D Pinnable Graph

An [Obsidian](https://obsidian.md) plugin that renders your vault as a glowing 3D graph where connected notes cluster into their own regions — and where you can **pin nodes in place** while everything else keeps moving elastically around them.

## Features

### Clustered "areas of the brain" layout
- **Community detection** groups notes and tags that share a hub, and a dedicated cluster-gravity force condenses each group into its own region.
- **Sphere shell** force keeps the whole graph in a clean spherical silhouette regardless of how the physics are tuned.
- **Color by cluster** (default): each region gets its own color from a curated palette; loosely-connected notes stay neutral. By-folder and single-color modes included.
- **Cluster-tinted links**: links inside a region glow in that region's color; bridges between regions stay neutral.

### Luxury rendering
- **Glow** — bloom post-processing makes nodes softly luminous; intensity and node brightness are separate sliders.
- **Glossy nodes** — lacquered spheres with clearcoat highlights (or matte, if you prefer).
- **Hover focus** — hover a note and it plus its direct connections stay lit while everything else recedes.
- **Smart labels** — label only the best-connected hub notes (default), all notes, or on hover only.

### Pinning
- **Left-click** a node to pin it in place; **drag** to move it — it pins where you drop it. Pinned nodes get a ring.
- Pins persist across restarts and **follow notes when you rename them**.
- Release everything with the **Unpin all** command or button.

### Live everything
- An **in-view settings panel** (gear button in the graph) with every setting — physics, colors, effects, labels, scope — applying live as you drag sliders.
- The graph updates automatically as you create, delete, rename, and link notes, without re-scrambling the layout you've built.
- Scope controls: exclude folders, hide orphans, show tags as nodes.

## Usage

Open the graph from the ribbon icon (atom) or the command palette (**Open graph**).

| Action | Effect |
| --- | --- |
| Left-click a node | Pin / unpin it |
| Drag a node | Move it — it pins where you drop it |
| Right-click a node | Open the note in a new tab |
| Hover a node | Spotlight it and its connections |
| Scroll / drag background | Zoom and orbit the camera |

Commands: **Open graph**, **Fit graph to view**, **Unpin all nodes**.

## Installation

### From community plugins

Search for **3D Pinnable Graph** in Settings → Community plugins → Browse (once accepted into the directory).

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [release](../../releases).
2. Copy them into `<your vault>/.obsidian/plugins/3d-pinnable-graph/`.
3. Reload Obsidian and enable the plugin in Settings → Community plugins.

### With BRAT

Add this repository in the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin to install and receive beta updates.

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # type-check + production build
```

`npm run deploy` builds and copies the plugin into the vault named by the `OBSIDIAN_VAULT` env var (or a git-ignored `.vault-path` file).

## License

[MIT](LICENSE)
