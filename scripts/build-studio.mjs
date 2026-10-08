// Builds the editor of rhwp into ui/studio/ (docs/studio.md). The script checks out rhwp-studio, assets/fonts, LICENSE
// and THIRD_PARTY_LICENSES.md of the rhwp tag TAG, refuses a checkout whose commit differs from COMMIT, places the
// WebAssembly package of the exact @rhwp/core devDependency where the rhwp-studio build expects ../pkg, installs the
// rhwp-studio dependencies from its lockfile and runs its own build script, unchanged, with relative asset paths. The
// checkout and its dependencies stay in node_modules/.cache, so a later build reuses them.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const TAG = "v0.8.7";
const COMMIT = "1a76570e833917d15817415a53c09ad61ab3203f";
const ROOT = new URL("../", import.meta.url).pathname;
const CACHE = join(ROOT, "node_modules/.cache", `rhwp-${TAG}`);
const STUDIO = join(CACHE, "rhwp-studio");
const OUTPUT = join(ROOT, "ui/studio");

const run = (command, args, cwd) => {
  console.log(`build-studio: ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
};

if (!existsSync(join(CACHE, ".git"))) {
  rmSync(CACHE, { recursive: true, force: true });
  mkdirSync(dirname(CACHE), { recursive: true });
  run("git", ["clone", "--quiet", "--filter=blob:none", "--no-checkout", "--depth", "1", "--branch", TAG,
    "https://github.com/edwardkim/rhwp.git", CACHE], ROOT);
  run("git", ["sparse-checkout", "set", "--no-cone", "/rhwp-studio/*", "!/rhwp-studio/e2e/", "!/rhwp-studio/tests/",
    "/assets/fonts/", "/LICENSE", "/THIRD_PARTY_LICENSES.md"], CACHE);
  run("git", ["checkout", "--quiet", TAG], CACHE);
}
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: CACHE, encoding: "utf8" }).trim();
if (commit !== COMMIT) throw new Error(`rhwp ${TAG} is the commit ${commit}, not ${COMMIT}; remove ${CACHE} and check the tag`);

const core = JSON.parse(readFileSync(join(ROOT, "node_modules/@rhwp/core/package.json"), "utf8"));
if (`v${core.version}` !== TAG) throw new Error(`@rhwp/core ${core.version} does not match rhwp ${TAG}`);
mkdirSync(join(CACHE, "pkg"), { recursive: true });
for (const file of ["rhwp.js", "rhwp.d.ts", "rhwp_bg.wasm", "rhwp_bg.wasm.d.ts", "package.json"]) {
  cpSync(join(ROOT, "node_modules/@rhwp/core", file), join(CACHE, "pkg", file));
}
if (!existsSync(join(STUDIO, "node_modules"))) run("npm", ["ci", "--no-audit", "--no-fund"], STUDIO);
run("npm", ["run", "build:no-hwpctrl", "--", "--base", "./", "--outDir", OUTPUT, "--emptyOutDir"], STUDIO);
cpSync(join(CACHE, "LICENSE"), join(OUTPUT, "LICENSE"));
cpSync(join(CACHE, "THIRD_PARTY_LICENSES.md"), join(OUTPUT, "THIRD_PARTY_LICENSES.md"));
console.log(`build-studio: rhwp-studio ${TAG} is in ui/studio`);
