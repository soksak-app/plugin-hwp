import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateDiagnostics } from "@soksak/plugin-api";

const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
const diagnostics = JSON.parse(readFileSync(new URL("../diagnostics.json", import.meta.url), "utf8"));

test("the public plugin API accepts the complete HWP diagnostics declaration", { timeout: 1000 }, () => {
  assert.equal(validateDiagnostics(manifest, diagnostics), diagnostics);
});
