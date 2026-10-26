// Validates the opt-in HWP view graph with the browser-module checker of the current core API source.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = process.env.CORE_PLUGIN_API_DIR;
if (!apiDir) throw new Error("CORE_PLUGIN_API_DIR must name the current core packages/plugin-api source");

const { checkViewModules } = await import(pathToFileURL(path.join(apiDir, "view-modules.js")).href);
if (typeof checkViewModules !== "function") {
  throw new Error(`the core API at ${apiDir} does not export checkViewModules`);
}

const read = (modulePath) => {
  const file = path.resolve(root, modulePath);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    throw new Error(`the HWP view module path escapes the plugin: ${modulePath}`);
  }
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

const errors = checkViewModules(read, "ui/hwp-diagnostics.js", { diagnostics: true });
if (errors.length > 0) throw new Error(errors.join("\n"));
console.log("HWP diagnostic browser module graph passed");
