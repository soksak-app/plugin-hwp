import { lstatSync } from "node:fs";

export function prepareStudioSource(cache, preparePinnedSource) {
  let linked = false;
  try {
    linked = lstatSync(cache).isSymbolicLink();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (linked) return "linked-development";
  preparePinnedSource();
  return "pinned-release";
}

export function verifyPinnedSource(current, status, commit) {
  if (current !== commit) throw new Error(`rhwp Studio source commit ${current} does not match ${commit}`);
  if (status) throw new Error(`rhwp Studio source checkout is dirty:\n${status}`);
}
