import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertStudioInstallerTarget,
  requireInstalledStudioSource,
  verifyPinnedSource,
} from "../scripts/studio-source.mjs";

const installFixture = (root, name) => {
  const source = join(root, name);
  mkdirSync(join(source, "rhwp-studio"), { recursive: true });
  for (const file of ["rhwp-studio/package.json", "rhwp-studio/package-lock.json", "LICENSE", "THIRD_PARTY_LICENSES.md"]) {
    writeFileSync(join(source, file), "fixture");
  }
  return source;
};

test("installed source accepts a plain directory and a dirty retargeted symlink", () => {
  const root = mkdtempSync(join(tmpdir(), "hwp-studio-source-"));
  try {
    const ordinary = installFixture(root, "ordinary-source");
    assert.equal(requireInstalledStudioSource(ordinary), ordinary);
    assert.equal(requireInstalledStudioSource(ordinary), ordinary);
    assert.equal(requireInstalledStudioSource(ordinary), ordinary);

    const cache = join(root, "cache");
    const first = installFixture(root, "first-source");
    const second = installFixture(root, "second-source");
    writeFileSync(join(first, "uncommitted-change"), "first");
    writeFileSync(join(second, "uncommitted-change"), "second");
    symlinkSync(first, cache);
    assert.equal(requireInstalledStudioSource(cache), cache);
    writeFileSync(join(first, "rhwp-studio/package.json"), "edited");
    assert.equal(requireInstalledStudioSource(cache), cache);
    rmSync(cache);
    symlinkSync(second, cache);
    assert.equal(requireInstalledStudioSource(cache), cache);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("build source preparation rejects a missing installation explicitly", () => {
  const root = mkdtempSync(join(tmpdir(), "hwp-studio-missing-"));
  try {
    assert.throws(() => requireInstalledStudioSource(join(root, "missing")), /source is not installed: missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release installer refuses a development symlink without replacing its target", () => {
  const root = mkdtempSync(join(tmpdir(), "hwp-studio-installer-"));
  try {
    const source = installFixture(root, "development-source");
    const cache = join(root, "cache");
    symlinkSync(source, cache);
    assert.throws(() => assertStudioInstallerTarget(cache), /refusing to install the pinned Studio source through a symlink/);
    assert.equal(requireInstalledStudioSource(cache), cache);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release installer pin checks reject mismatched and dirty checkouts", () => {
  const root = mkdtempSync(join(tmpdir(), "hwp-studio-release-"));
  try {
    const cache = join(root, "cache");
    mkdirSync(cache);
    assert.throws(() => verifyPinnedSource("different-commit", "", "pinned-commit"), /does not match pinned-commit/);
    assert.throws(() => verifyPinnedSource("pinned-commit", "modified file", "pinned-commit"), /is dirty/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
