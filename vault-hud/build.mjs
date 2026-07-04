// bundles the HUD frontend using the plugin's own esbuild + deps — no extra installs
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.join(__dirname, "..");
const require = createRequire(path.join(pluginRoot, "package.json"));
const esbuild = require("esbuild");

await esbuild.build({
	entryPoints: [path.join(__dirname, "src", "app.mjs")],
	bundle: true,
	format: "iife",
	minify: true,
	absWorkingDir: pluginRoot,
	outfile: path.join(__dirname, "public", "app.js"),
	logLevel: "info",
});
