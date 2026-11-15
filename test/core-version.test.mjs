import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("the core compatibility documents state the engines.soksak that the package declares", () => {
  const statements = (file) => [...readFileSync(new URL(`../docs/spec/${file}`, import.meta.url), "utf8").matchAll(/`engines\.soksak: "([^"]*)"`/g)]
    .map((match) => match[1]);
  assert.deepEqual(
    { english: statements("core-compatibility.md"), korean: statements("core-compatibility.ko.md") },
    { english: [pkg.engines.soksak], korean: [pkg.engines.soksak] },
  );
});

// events.json requires the surface that core 0.0.41 adds to each view record (H65). Core 0.0.40 is the first core release that
// accepts exposes.element (H49), and 0.0.39 and earlier refuse it, so 0.0.41 also admits exposes.element.
test("the package requires core 0.0.41, the release whose view records events.json follows (H65)", () => {
  assert.equal(pkg.engines.soksak, "^0.0.41");
});

// A range ^0.0.z admits core 0.0.z and every later 0.0 release (core docs/spec/installation.md#versions-and-ranges), so the
// documents state the later releases and name no exclusion of them (H60).
test("the core compatibility documents state that the range admits every later 0.0 core release (H60)", () => {
  const first = /^\^(0\.0\.\d+)$/.exec(pkg.engines.soksak)?.[1];
  assert.ok(first, `engines.soksak ${pkg.engines.soksak} is not a range ^0.0.z`);
  const text = (file) => readFileSync(new URL(`../docs/spec/${file}`, import.meta.url), "utf8").replace(/\s+/g, " ");
  assert.ok(text("core-compatibility.md").includes(`admits core ${first} and every later 0.0 release`), "core-compatibility.md");
  assert.ok(text("core-compatibility.ko.md").includes(`core ${first}부터 그 뒤의 모든 0.0 release를 허용한다`), "core-compatibility.ko.md");
  for (const file of ["core-compatibility.md", "core-compatibility.ko.md"]) {
    assert.doesNotMatch(text(file), /unverified|검증하지 않은/, `${file} excludes the later releases`);
  }
});

// The package names no release of the plugin API, and engines.soksak is its only relation to core (H70).
test("the package declares no dependency on the plugin API, and the compatibility documents name no release of it (H70)", () => {
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    assert.deepEqual(Object.keys(pkg[field] ?? {}).filter((name) => name.startsWith("@soksak/plugin-api")), [], field);
  }
  for (const file of ["core-compatibility.md", "core-compatibility.ko.md"]) {
    const text = readFileSync(new URL(`../docs/spec/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(text, /pin|고정/, `${file} states a pin`);
    assert.match(text, /test\/fixtures\/plugin-api\//, `${file} names the fixture of the plugin API`);
  }
});
