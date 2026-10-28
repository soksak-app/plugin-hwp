// Builds the editor of rhwp into ui/studio/ (docs/studio.md) from an already installed source directory. The build does not
// acquire source or inspect Git state, so plain installed directories and development symlinks use the same contract.
// Release source acquisition and exact pin checks belong to install-studio-source.mjs. This script places the exact
// CORE_VERSION @rhwp/core WebAssembly package where rhwp-studio expects ../pkg, installs dependencies from its lockfile,
// and runs the Studio build script unchanged with relative asset paths. It then adds ui/studio-host.js as a module script.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requireInstalledStudioSource } from "./studio-source.mjs";

const SOURCE_RELEASE = "soksak-studio-v0.8.7-2";
const CORE_VERSION = "0.8.7";
const ROOT = new URL("../", import.meta.url).pathname;
const CACHE = join(ROOT, "node_modules/.cache", `rhwp-${SOURCE_RELEASE}`);
const SOURCE = requireInstalledStudioSource(CACHE);
const STUDIO = join(SOURCE, "rhwp-studio");
const OUTPUT = join(ROOT, "ui/studio");

const run = (command, args, cwd) => {
  console.log(`build-studio: ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
};

console.log("build-studio: using installed rhwp Studio source");

const core = JSON.parse(readFileSync(join(ROOT, "node_modules/@rhwp/core/package.json"), "utf8"));
if (core.version !== CORE_VERSION) throw new Error(`@rhwp/core ${core.version} does not match ${CORE_VERSION}`);
mkdirSync(join(CACHE, "pkg"), { recursive: true });
for (const file of ["rhwp.js", "rhwp.d.ts", "rhwp_bg.wasm", "rhwp_bg.wasm.d.ts", "package.json"]) {
  cpSync(join(ROOT, "node_modules/@rhwp/core", file), join(CACHE, "pkg", file));
}
if (!existsSync(join(STUDIO, "node_modules"))) run("npm", ["ci", "--no-audit", "--no-fund"], STUDIO);
run("npm", ["run", "build:no-hwpctrl", "--", "--base", "./", "--outDir", OUTPUT, "--emptyOutDir"], STUDIO);
const page = join(OUTPUT, "index.html");
const html = readFileSync(page, "utf8");
if (html.split("</head>").length !== 2) throw new Error(`${page} does not have exactly one </head>`);
writeFileSync(page, html.replace("</head>", '<script type="module" src="../studio-host.js"></script></head>'));
cpSync(join(CACHE, "LICENSE"), join(OUTPUT, "LICENSE"));
cpSync(join(CACHE, "THIRD_PARTY_LICENSES.md"), join(OUTPUT, "THIRD_PARTY_LICENSES.md"));
console.log(`build-studio: rhwp-studio ${SOURCE_RELEASE} is in ui/studio`);
