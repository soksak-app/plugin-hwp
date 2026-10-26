import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const studioPage = path.join(root, "ui", "studio", "index.html");

test("the packed HWP editor page includes every local module script target", (t) => {
  if (!existsSync(studioPage)) {
    t.skip("make studio builds ui/studio/index.html before the release package graph check");
    return;
  }
  const destination = mkdtempSync(path.join(tmpdir(), "hwp-release-graph-"));
  t.after(() => rmSync(destination, { recursive: true, force: true }));

  const packed = spawnSync("npm", ["pack", "--json", "--pack-destination", destination], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(packed.error, undefined, packed.error?.message);
  assert.equal(packed.status, 0, `${packed.stdout}${packed.stderr}`);
  const [release] = JSON.parse(packed.stdout);
  assert.ok(release?.filename, "npm pack produced no release filename");
  const releasePath = path.join(destination, release.filename);
  assert.ok(existsSync(releasePath), `npm pack did not create ${release.filename}`);

  const packageFiles = new Set(release.files.map((file) => file.path));
  assert.ok(packageFiles.has("ui/studio/index.html"), "the plugin release omitted its built editor page");
  const html = execFileSync("tar", ["-xOf", releasePath, "package/ui/studio/index.html"], { encoding: "utf8" });
  const document = new JSDOM(html).window.document;
  const scriptTargets = [...document.querySelectorAll('script[type="module"][src]')]
    .map((script) => script.getAttribute("src"))
    .filter((source) => source && !/^[a-z][a-z\d+.-]*:/i.test(source) && !source.startsWith("/"))
    .map((source) => path.posix.normalize(path.posix.join("ui/studio", source)));
  assert.ok(scriptTargets.length > 0, "the packaged editor page has no local module scripts");
  for (const target of scriptTargets) {
    assert.ok(packageFiles.has(target), `the packaged editor page references missing module ${target}`);
  }
});
