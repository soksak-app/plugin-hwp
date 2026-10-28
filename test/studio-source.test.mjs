import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { prepareStudioSource, verifyPinnedSource } from "../scripts/studio-source.mjs";

test("linked development source skips pinned release preparation after edits and retargeting", () => {
  const root = mkdtempSync(join(tmpdir(), "hwp-studio-source-"));
  try {
    const cache = join(root, "cache");
    const first = join(root, "first-source");
    const second = join(root, "second-source");
    mkdirSync(first);
    mkdirSync(second);
    writeFileSync(join(first, "uncommitted-change"), "first");
    writeFileSync(join(second, "uncommitted-change"), "second");
    symlinkSync(first, cache);

    let gitOperations = 0;
    const preparePinnedRelease = () => { gitOperations += 1; };
    assert.equal(prepareStudioSource(cache, preparePinnedRelease), "linked-development");
    rmSync(cache);
    symlinkSync(second, cache);
    assert.equal(prepareStudioSource(cache, preparePinnedRelease), "linked-development");
    assert.equal(gitOperations, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ordinary release source retains exact commit and clean checkout checks", () => {
  const root = mkdtempSync(join(tmpdir(), "hwp-studio-release-"));
  try {
    const cache = join(root, "cache");
    mkdirSync(cache);
    let prepared = false;
    assert.throws(() => prepareStudioSource(cache, () => {
      prepared = true;
      verifyPinnedSource("different-commit", "", "pinned-commit");
    }), /does not match pinned-commit/);
    assert.equal(prepared, true);
    assert.throws(() => verifyPinnedSource("pinned-commit", "modified file", "pinned-commit"), /is dirty/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
