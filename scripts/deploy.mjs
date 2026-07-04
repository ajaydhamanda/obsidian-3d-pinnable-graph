import fs from "fs";
import path from "path";

// vault path comes from the OBSIDIAN_VAULT env var or a git-ignored .vault-path file
const VAULT =
  process.env.OBSIDIAN_VAULT ??
  (fs.existsSync(".vault-path") ? fs.readFileSync(".vault-path", "utf8").trim() : null);

if (!VAULT) {
  console.error("Set OBSIDIAN_VAULT or create a .vault-path file containing your vault path.");
  process.exit(1);
}
const PLUGIN_ID = "3d-pinnable-graph";
const target = path.join(VAULT, ".obsidian", "plugins", PLUGIN_ID);

fs.mkdirSync(target, { recursive: true });

for (const file of ["main.js", "manifest.json", "styles.css"]) {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join(target, file));
    console.log(`copied ${file} -> ${target}`);
  }
}
