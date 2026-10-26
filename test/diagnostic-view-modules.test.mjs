import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the HWP diagnostic browser module graph passes the current core checker", (t) => {
  const apiDir = process.env.CORE_PLUGIN_API_DIR;
  if (!apiDir) {
    t.skip("CORE_PLUGIN_API_DIR must name the current core API source for the browser graph check");
    return;
  }
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "check-diagnostic-view-modules.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /HWP diagnostic browser module graph passed/);
});
