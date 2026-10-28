// Builds the editor of rhwp into ui/studio/ (docs/studio.md). A symlink at the source cache path selects linked development
// source without Git operations or source identity checks; an ordinary cache uses the pinned release and rejects a changed
// commit or dirty checkout. The script places the exact CORE_VERSION @rhwp/core WebAssembly package where rhwp-studio
// expects ../pkg, installs dependencies from its lockfile, and runs the Studio build script unchanged with relative asset
// paths. It then adds ui/studio-host.js as a module script after the scripts of the built page.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { prepareStudioSource, verifyPinnedSource } from "./studio-source.mjs";

const REPOSITORY = "https://github.com/min-0-max/rhwp.git";
const TAG = "soksak-studio-v0.8.7-2";
const COMMIT = "b30ff23366433e3dc451f452a9843d133eff8c1f";
const CORE_VERSION = "0.8.7";
const ROOT = new URL("../", import.meta.url).pathname;
const CACHE = join(ROOT, "node_modules/.cache", `rhwp-${TAG}`);
const STUDIO = join(CACHE, "rhwp-studio");
const OUTPUT = join(ROOT, "ui/studio");

const run = (command, args, cwd) => {
  console.log(`build-studio: ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
};

const sourceMode = prepareStudioSource(CACHE, () => {
  let cloned = false;
  if (!existsSync(join(CACHE, ".git"))) {
    rmSync(CACHE, { recursive: true, force: true });
    mkdirSync(dirname(CACHE), { recursive: true });
    run("git", ["clone", "--quiet", "--filter=blob:none", "--no-checkout", "--depth", "1", "--branch", TAG,
      REPOSITORY, CACHE], ROOT);
    cloned = true;
  }
  const verifySource = () => {
    const current = execFileSync("git", ["rev-parse", "HEAD"], { cwd: CACHE, encoding: "utf8" }).trim();
    const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: CACHE,
      encoding: "utf8",
    }).trim();
    verifyPinnedSource(current, status, COMMIT);
  };
  if (!cloned) verifySource();
  run("git", ["sparse-checkout", "set", "--no-cone", "/rhwp-studio/*", "!/rhwp-studio/e2e/", "!/rhwp-studio/tests/",
    "/rhwp-studio/tests/studio-startup.test.mjs", "/assets/fonts/", "/LICENSE", "/THIRD_PARTY_LICENSES.md"], CACHE);
  if (cloned) run("git", ["checkout", "--quiet", TAG], CACHE);
  verifySource();
});
console.log(`build-studio: source mode ${sourceMode}`);

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
console.log(`build-studio: rhwp-studio ${TAG} is in ui/studio`);
