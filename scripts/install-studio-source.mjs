// Installs the pinned rhwp Studio release source for release builds (docs/studio.md).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertStudioInstallerTarget, verifyPinnedSource } from "./studio-source.mjs";

const REPOSITORY = "https://github.com/min-0-max/rhwp.git";
const TAG = "soksak-studio-v0.8.7-2";
const COMMIT = "b30ff23366433e3dc451f452a9843d133eff8c1f";
const ROOT = new URL("../", import.meta.url).pathname;
const CACHE = join(ROOT, "node_modules/.cache", `rhwp-${TAG}`);

const run = (command, args, cwd) => {
  console.log(`install-studio-source: ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
};

const cacheExists = assertStudioInstallerTarget(CACHE);
let cloned = false;
if (!cacheExists) {
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
console.log(`install-studio-source: ${TAG} is installed`);
