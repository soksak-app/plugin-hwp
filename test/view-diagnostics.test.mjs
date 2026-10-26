import assert from "node:assert/strict";
import test from "node:test";

const source = await import("../build/test/ui/view-diagnostics.js").catch((error) => ({ importError: error }));

test("the release view has no diagnostic commands when its declaration is absent", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ status: 404, ok: false });
  t.after(() => { globalThis.fetch = originalFetch; });
  assert.equal(await source.loadDiagnostics("soksak://hwp/ui/index.html"), null);
});

test("the diagnostic view loader reads its declaration and attaches the declared module", async (t) => {
  const originalFetch = globalThis.fetch;
  const declaration = { module: "ui/hwp-diagnostics.js", exposes: { commands: [] } };
  globalThis.fetch = async (url) => {
    assert.equal(url, "soksak://hwp/diagnostics.json");
    return { status: 200, ok: true, json: async () => declaration };
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const attach = () => {};
  const loaded = await source.loadDiagnostics("soksak://hwp/ui/index.html", async (modulePath) => {
    assert.equal(modulePath, declaration.module);
    return { attach };
  });
  assert.deepEqual(loaded, { declaration, attach });
});

test("the diagnostic view loader reports unreadable declarations", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ status: 503, ok: false });
  t.after(() => { globalThis.fetch = originalFetch; });
  await assert.rejects(source.loadDiagnostics("soksak://hwp/ui/index.html"), /answered 503/);
});

test("HWP document frame diagnostics stay idle until an explicit start and stop their observer", async () => {
  assert.equal(typeof source.createViewFrameDiagnostics, "function",
    "the HWP view has no opt-in document-frame diagnostic adapter");
  let rect = { width: 720, height: 540 };
  const styles = new Map([["background-color", { value: "rgb(1, 2, 3)", priority: "" }]]);
  const root = {
    getBoundingClientRect: () => rect,
    style: {
      getPropertyValue: (name) => styles.get(name)?.value ?? "",
      getPropertyPriority: (name) => styles.get(name)?.priority ?? "",
      setProperty: (name, value, priority = "") => styles.set(name, { value, priority }),
      removeProperty: (name) => styles.delete(name),
    },
  };
  const document = { documentElement: root, defaultView: {
    history: { length: 3 }, performance: { timeOrigin: 1000 }, ResizeObserver: class {},
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
  } };
  const documentRegion = { state: { history: { entries: [{ url: "soksak://hwp/ui/studio/index.html" }], index: 0 } } };
  const logs = [];
  let started = 0;
  let stopped = 0;
  const diagnostic = source.createViewFrameDiagnostics({ document, documentRegion, observe: async ({ document: observed, log }) => {
    assert.equal(observed, document, "the observer must target the view document root");
    assert.equal(root.style.getPropertyValue("background-color"), "rgb(25, 211, 162)",
      "explicit diagnostics must paint the real view root with the measured opaque content color");
    started++;
    log.trace("view.content_frame", { sequence: 0, resizeAtMs: 8, width: 720, height: 540, documentTimeOriginMs: 1000, frameTimeMs: 16 });
    return async () => { stopped++; };
  }, runtime: { log: { trace: (event, fields) => { logs.push({ event, fields }); } } } });
  assert.equal(started, 0, "normal creation started an observer");
  assert.deepEqual(diagnostic.read(), { enabled: false, sequence: 0, historyEntries: 3, regionHistoryEntries: 1, width: 720, height: 540 });
  documentRegion.state.history.entries.push({ url: "https://example.test/next" });
  assert.equal(diagnostic.read().regionHistoryEntries, 2,
    "the read command must report the current native document-region history, not a cached count");
  documentRegion.state.history.entries.pop();
  assert.deepEqual(await diagnostic.start(), { enabled: true, sequence: 1, historyEntries: 3, regionHistoryEntries: 1, width: 720, height: 540 });
  assert.equal(started, 1);
  assert.deepEqual(diagnostic.read(), { enabled: true, sequence: 1, historyEntries: 3, regionHistoryEntries: 1, width: 720, height: 540 });
  await assert.rejects(diagnostic.start(), /already active/);
  rect = { width: 640, height: 480 };
  assert.deepEqual(await diagnostic.stop(), { enabled: false, sequence: 1, historyEntries: 3, regionHistoryEntries: 1, width: 640, height: 480 });
  assert.deepEqual(styles.get("background-color"), { value: "rgb(1, 2, 3)", priority: "" },
    "stop must restore the exact prior root background");
  assert.equal(stopped, 1, "stop did not dispose the observer");
  await assert.rejects(diagnostic.stop(), /not active/);
  await diagnostic.start();
  await diagnostic.dispose();
  assert.equal(stopped, 2, "dispose did not stop the active observer");
  assert.deepEqual(styles.get("background-color"), { value: "rgb(1, 2, 3)", priority: "" },
    "dispose must restore the exact prior root background");
  assert.deepEqual(logs, [0, 0].map((sequence) => ({ event: "view.content_frame", fields: {
    sequence, resizeAtMs: 8, width: 720, height: 540, documentTimeOriginMs: 1000, frameTimeMs: 16,
  } })));

  const failed = source.createViewFrameDiagnostics({ document, documentRegion, observe: async () => { throw new Error("observer refused"); },
    runtime: { log: { trace() {} } } });
  await assert.rejects(failed.start(), /observer refused/);
  assert.deepEqual(failed.read(), { enabled: false, sequence: 0, historyEntries: 3, regionHistoryEntries: 1, width: 640, height: 480 });
  assert.deepEqual(styles.get("background-color"), { value: "rgb(1, 2, 3)", priority: "" },
    "failed start must restore the exact prior root background");

  let finishObserverStart;
  let raceStopped = 0;
  const racing = source.createViewFrameDiagnostics({ document, documentRegion,
    observe: () => new Promise((resolve) => { finishObserverStart = resolve; }), runtime: { log: { trace() {} } } });
  const start = racing.start();
  const dispose = racing.dispose();
  finishObserverStart(async () => { raceStopped++; });
  await Promise.all([start, dispose]);
  assert.equal(raceStopped, 1, "dispose must stop an observer whose start was still pending");
  assert.deepEqual(styles.get("background-color"), { value: "rgb(1, 2, 3)", priority: "" },
    "dispose during start must restore the exact prior root background");
});
