import { existsSync, lstatSync } from "node:fs";
import { join } from "node:path";

const REQUIRED_SOURCE_FILES = [
  "rhwp-studio/package.json",
  "rhwp-studio/package-lock.json",
  "LICENSE",
  "THIRD_PARTY_LICENSES.md",
];

export function requireInstalledStudioSource(source) {
  for (const file of REQUIRED_SOURCE_FILES) {
    if (!existsSync(join(source, file))) throw new Error(`rhwp Studio source is not installed: missing ${file}`);
  }
  return source;
}

export function assertStudioInstallerTarget(cache) {
  const pathStat = lstatSync(cache, { throwIfNoEntry: false });
  if (pathStat?.isSymbolicLink()) {
    throw new Error(`refusing to install the pinned Studio source through a symlink: ${cache}`);
  }
  if (pathStat && !existsSync(join(cache, ".git"))) {
    throw new Error(`Studio source path exists without a Git checkout; refusing to replace it: ${cache}`);
  }
  return Boolean(pathStat);
}

export function verifyPinnedSource(current, status, commit) {
  if (current !== commit) throw new Error(`rhwp Studio source commit ${current} does not match ${commit}`);
  if (status) throw new Error(`rhwp Studio source checkout is dirty:\n${status}`);
}
