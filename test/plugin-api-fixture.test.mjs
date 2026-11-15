// The plugin API fixture of this repository (test/fixtures/plugin-api/): the resolve hook maps the specifiers that the page of the
// plugin imports, as the import map of the application resolves them for the page, and the modules answer as the test arranges.
import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "./fixtures/plugin-api/hook.mjs";
import { openPage } from "./fixtures/plugin-api/page.mjs";

const FIXTURE = new URL("./fixtures/plugin-api/", import.meta.url).href;

test("the hook maps each specifier that the page imports to its module of the fixture", () => {
  const refused = () => assert.fail("a mapped specifier does not go on to the default resolution");
  for (const [specifier, file] of [["@soksak/plugin-api", "index.mjs"], ["@soksak/plugin-api/view", "view.mjs"],
    ["@soksak/plugin-api/diagnostic-view-frames", "diagnostic-view-frames.mjs"]]) {
    assert.deepEqual(resolve(specifier, {}, refused), { url: `${FIXTURE}${file}`, shortCircuit: true });
  }
});

test("the hook refuses a specifier of the plugin API that the page does not import, and passes every other specifier on", () => {
  for (const specifier of ["@soksak/plugin-api/testing", "@soksak/plugin-api/view-start.js", "@soksak/plugin-api/screen-hash"]) {
    assert.throws(() => resolve(specifier, {}, () => assert.fail("the plugin API is not resolved by default")),
      new RegExp(`^Error: ${specifier.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")} is not mapped by the plugin API fixture`));
  }
  const next = (specifier, context) => ({ url: `default:${specifier}`, context });
  assert.deepEqual(resolve("@soksak/plugin-apix", { parentURL: "x" }, next), { url: "default:@soksak/plugin-apix", context: { parentURL: "x" } });
  assert.deepEqual(resolve("node:fs", {}, next), { url: "default:node:fs", context: {} });
});

test("a page import of each mapped specifier resolves to the fixture, and an import of another entry of the plugin API fails", async () => {
  assert.deepEqual(Object.keys(await import("@soksak/plugin-api")), ["createExpose"]);
  assert.deepEqual(Object.keys(await import("@soksak/plugin-api/view")), ["createViewBridge"]);
  assert.deepEqual(Object.keys(await import("@soksak/plugin-api/diagnostic-view-frames")), ["observeViewDocumentFrames"]);
  await assert.rejects(import("@soksak/plugin-api/testing"), /@soksak\/plugin-api\/testing is not mapped by the plugin API fixture/);
});

test("the fixture serves a page only while a view of openPage is open", async () => {
  const { createExpose } = await import("@soksak/plugin-api");
  assert.throws(() => createExpose({}, () => ({})), /serves a page only while a view of openPage is open/);
});

test("the bridge of the fixture records the calls of the page and refuses an entry that the test did not arrange", async (t) => {
  const { createViewBridge } = await import("@soksak/plugin-api/view");
  const view = await openPage({ arrangement: { answers: { "tab.title": () => null } } });
  t.after(() => view.close());
  const handler = view.window.webkit.messageHandlers["sok-view"];
  assert.throws(() => createViewBridge({ handler: {}, report() {} }), /requires the sok-view handler of the window/);
  const bridge = createViewBridge({ handler, report() {} });
  assert.throws(() => createViewBridge({ handler, report() {} }), /created a second view bridge/);
  assert.equal(await bridge.calls.request("tab.title", "plan.hwp"), null);
  await assert.rejects(bridge.calls.request("tab.footer", "x"), /no arrangement for the call tab\.footer/);
  assert.deepEqual(view.api.calls, [{ command: "tab.title", params: "plan.hwp" }, { command: "tab.footer", params: "x" }]);
  assert.throws(() => bridge.runtime.sidecar("@soksak/sidecar-files"), /no arrangement for the sidecar @soksak\/sidecar-files/);
  await assert.rejects(bridge.runtime.command("core.file.place", {}), /no arrangement for the command core\.file\.place/);
  assert.throws(() => handler.postMessage({}), /answers the calls of the page/);
});

test("the observer of view frames records its start and stop, and the test emits the frame records", async (t) => {
  const { observeViewDocumentFrames } = await import("@soksak/plugin-api/diagnostic-view-frames");
  const view = await openPage();
  t.after(() => view.close());
  const records = [];
  const stop = await observeViewDocumentFrames({ log: { trace: (event, fields) => records.push([event, fields]) } });
  view.api.frames.starts[0].emit("view.content_frame", { sequence: 0 });
  assert.deepEqual(records, [["view.content_frame", { sequence: 0 }]]);
  stop();
  assert.equal(view.api.frames.stops, 1);
  assert.throws(() => observeViewDocumentFrames({}), /requires log\.trace/);
});
