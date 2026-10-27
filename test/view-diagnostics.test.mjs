import assert from "node:assert/strict";
import test from "node:test";

const source = await import("../build/test/ui/view-diagnostics.js").catch((error) => ({ importError: error }));
const viewportEvidence = {
  markerColor: [255, 0, 255], borderWidth: 2, rect: { left: 4, top: 4, right: 1020, bottom: 764 },
  innerWidth: 1024, innerHeight: 768, clientWidth: 1024, clientHeight: 768,
  visualViewport: { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, scale: 1 },
  fixedContainingBlock: { transform: "none", perspective: "none", filter: "none", contain: "none", willChange: "auto", containerType: "normal" },
};

test("the diagnostic module exposes a studio viewport marker companion", async () => {
  const studioDiagnostics = await import("../ui/hwp-diagnostics.js");
  assert.equal(typeof studioDiagnostics.attachStudio, "function",
    "the HWP diagnostic module cannot attach the studio viewport marker companion");
});

test("the studio viewport marker measures the document viewport and removes its exact node", async () => {
  const { attachStudio } = await import("../ui/hwp-diagnostics.js");
  const listeners = new Map();
  const children = [];
  const parent = {};
  let markerRect = { left: 4, top: 4, right: 1020, bottom: 764 };
  const root = {
    clientWidth: 1024,
    clientHeight: 768,
    append(element) { children.push(element); },
  };
  const style = { transform: "none", perspective: "none", filter: "none", contain: "none", willChange: "auto", containerType: "normal" };
  const window = {
    parent,
    performance: { timeOrigin: 1_234_567, now: () => 150, getEntriesByType: () => [] },
    innerWidth: 1024,
    innerHeight: 768,
    visualViewport: { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, scale: 1 },
    location: { origin: "soksak://hwp" },
    getComputedStyle: () => style,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    postMessage(message, origin) { replies.push({ message, origin }); },
  };
  const replies = [];
  const document = {
    documentElement: root,
    createElement: () => ({
      style: {},
      setAttribute(name, value) { this.attribute = [name, value]; },
      getBoundingClientRect: () => markerRect,
      remove() { const index = children.indexOf(this); if (index >= 0) children.splice(index, 1); },
    }),
  };
  const dispose = await attachStudio({ document, window });
  assert.equal(children.length, 0, "the marker must not exist before an explicit start request");
  const deliver = async (id, operation) => {
    await listeners.get("message")({ source: window, origin: "soksak://hwp", data: { type: "soksak-hwp-viewport-marker", id, operation } });
    return replies.at(-1);
  };
  const started = await deliver("start-1", "start");
  assert.equal(started.origin, "soksak://hwp");
  assert.deepEqual(started.message.result, {
    markerColor: [255, 0, 255], borderWidth: 2,
    rect: { left: 4, top: 4, right: 1020, bottom: 764 },
    innerWidth: 1024, innerHeight: 768, clientWidth: 1024, clientHeight: 768,
    visualViewport: { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, scale: 1 },
    fixedContainingBlock: style,
  });
  assert.equal(children.length, 1);
  assert.equal(children[0].attribute[0], "data-soksak-hwp-viewport-marker");
  assert.deepEqual(children[0].style, {
    position: "fixed", inset: "4px", boxSizing: "border-box", border: "2px solid rgb(255, 0, 255)",
    pointerEvents: "none", backgroundColor: "transparent", opacity: "1", filter: "none", mixBlendMode: "normal",
    transform: "none", boxShadow: "none", zIndex: "2147483647",
  });
  markerRect = { left: 4, top: 4, right: 1020, bottom: 764 };
  assert.equal((await deliver("read-1", "read")).message.result.studioViewport.rect.right, 1020);
  assert.equal((await deliver("stop-1", "stop")).message.result, null);
  assert.equal(children.length, 0, "stop must remove the exact marker element");

  window.visualViewport.scale = 2;
  const rejected = await deliver("start-2", "start");
  assert.match(rejected.message.error, /scale 1/);
  assert.equal(children.length, 0, "failed start must leave no marker element");
  window.visualViewport.scale = 1;
  await deliver("start-3", "start");
  dispose();
  assert.equal(children.length, 0, "disposal must remove the exact marker element");
  assert.equal(listeners.has("message"), false, "disposal must remove the message listener");
});

test("an active studio diagnostic read returns available resource timings on the studio clock", { timeout: 5_000 }, async () => {
  const { attachStudio } = await import("../ui/hwp-diagnostics.js");
  const listeners = new Map();
  const children = [];
  const replies = [];
  const parentListeners = new Set();
  const entries = [{
    name: "https://cdn.example.test/HANBatang.woff",
    initiatorType: "css",
    startTime: 12,
    duration: 24,
    fetchStart: 12,
    requestStart: 13,
    responseStart: 20,
    responseEnd: 36,
    transferSize: 0,
    encodedBodySize: 0,
    decodedBodySize: 0,
  }, {
    name: "soksak://hwp/ui/studio/rhwp_bg.wasm",
    initiatorType: "fetch",
    startTime: 40,
    duration: 90,
    fetchStart: 40,
    requestStart: 41,
    responseStart: 50,
    responseEnd: 130,
    transferSize: 2048,
    encodedBodySize: 2000,
    decodedBodySize: 2000,
  }];
  let resourceReads = 0;
  const performance = {
    timeOrigin: 1_234_567,
    now: () => 150,
    getEntriesByType(type) {
      assert.equal(type, "resource");
      resourceReads++;
      return entries;
    },
  };
  const parent = {};
  const root = {
    clientWidth: 1024,
    clientHeight: 768,
    append(element) { children.push(element); },
  };
  const style = { transform: "none", perspective: "none", filter: "none", contain: "none", willChange: "auto", containerType: "normal" };
  const window = {
    parent,
    performance,
    innerWidth: 1024,
    innerHeight: 768,
    visualViewport: { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, scale: 1 },
    location: { origin: "soksak://hwp" },
    getComputedStyle: () => style,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    postMessage(message, origin) {
      replies.push({ message, origin });
      queueMicrotask(() => {
        listeners.get("message")({ source: window, origin, data: message });
        for (const listener of parentListeners) listener(message);
      });
    },
  };
  const document = {
    documentElement: root,
    createElement: () => ({
      style: {},
      setAttribute() {},
      getBoundingClientRect: () => ({ left: 4, top: 4, right: 1020, bottom: 764 }),
      remove() { const index = children.indexOf(this); if (index >= 0) children.splice(index, 1); },
    }),
  };
  const dispose = await attachStudio({ document, window });
  const region = {
    onMessage(listener) {
      parentListeners.add(listener);
      return () => parentListeners.delete(listener);
    },
    post(message) {
      queueMicrotask(() => listeners.get("message")({
        source: window,
        origin: "soksak://hwp",
        data: message,
      }));
      return Promise.resolve();
    },
  };
  let enabled = false;
  const diagnostics = {
    read: () => ({ enabled, sequence: 0, historyEntries: 1, regionHistoryEntries: 1, width: 1024, height: 768 }),
    async start() { enabled = true; return { enabled: true, sequence: 1, historyEntries: 1, regionHistoryEntries: 1, width: 1024, height: 768 }; },
    async stop() { enabled = false; return { enabled: false, sequence: 1, historyEntries: 1, regionHistoryEntries: 1, width: 1024, height: 768 }; },
    async dispose() {},
  };
  const { createStudioViewportDiagnostics } = await import("../ui/hwp-diagnostics.js");
  const commands = createStudioViewportDiagnostics({ diagnostics, documentRegion: region });
  await commands.start();
  assert.equal(resourceReads, 0, "resource timing is read only at an explicit snapshot");
  const read = await commands.read();
  assert.deepEqual(read.studioViewport, {
    markerColor: [255, 0, 255], borderWidth: 2,
    rect: { left: 4, top: 4, right: 1020, bottom: 764 },
    innerWidth: 1024, innerHeight: 768, clientWidth: 1024, clientHeight: 768,
    visualViewport: { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, scale: 1 },
    fixedContainingBlock: style,
  });
  assert.deepEqual(read.studioClock, {
    documentTimeOriginMs: 1_234_567,
    snapshotAtMs: 150,
  });
  assert.deepEqual(read.resourceTimings, entries);
  assert.equal(resourceReads, 1);
  await commands.stop();
  assert.equal(resourceReads, 1, "stop does not query resource timing");
  await commands.dispose();
  dispose();
});

test("inactive diagnostic reads return no studio resource snapshot", { timeout: 5_000 }, async () => {
  const { createStudioViewportDiagnostics } = await import("../ui/hwp-diagnostics.js");
  let requests = 0;
  const diagnostics = {
    read: () => ({ enabled: false, sequence: 0, historyEntries: 1, regionHistoryEntries: 1, width: 1024, height: 768 }),
    async start() { throw new Error("inactive read must not start observation"); },
    async stop() { throw new Error("inactive read must not stop observation"); },
    async dispose() {},
  };
  const commands = createStudioViewportDiagnostics({
    diagnostics,
    documentRegion: {
      onMessage() { throw new Error("inactive read must not subscribe to the studio"); },
      post() { requests++; throw new Error("inactive read must not query the studio"); },
    },
  });
  const read = await commands.read();
  assert.equal(read.studioClock, null);
  assert.equal(read.resourceTimings, null);
  assert.equal(read.studioViewport, null);
  assert.equal(requests, 0);
  await commands.dispose();
});

test("an active studio read reports an unsupported Resource Timing API", { timeout: 5_000 }, async () => {
  const { attachStudio } = await import("../ui/hwp-diagnostics.js");
  const listeners = new Map();
  const replies = [];
  const children = [];
  const root = {
    clientWidth: 1024,
    clientHeight: 768,
    append(element) { children.push(element); },
  };
  const style = { transform: "none", perspective: "none", filter: "none", contain: "none", willChange: "auto", containerType: "normal" };
  const window = {
    performance: { timeOrigin: 1_234_567, now: () => 150 },
    innerWidth: 1024,
    innerHeight: 768,
    visualViewport: { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, scale: 1 },
    location: { origin: "soksak://hwp" },
    getComputedStyle: () => style,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    postMessage(message) { replies.push(message); },
  };
  const document = {
    documentElement: root,
    createElement: () => ({
      style: {},
      setAttribute() {},
      getBoundingClientRect: () => ({ left: 4, top: 4, right: 1020, bottom: 764 }),
      remove() { const index = children.indexOf(this); if (index >= 0) children.splice(index, 1); },
    }),
  };
  const dispose = await attachStudio({ document, window });
  const deliver = async (id, operation) => {
    await listeners.get("message")({
      source: window,
      origin: "soksak://hwp",
      data: { type: "soksak-hwp-viewport-marker", id, operation },
    });
    return replies.at(-1);
  };
  await deliver("start-no-resource-api", "start");
  const read = await deliver("read-no-resource-api", "read");
  assert.equal(read.id, "read-no-resource-api");
  assert.equal(read.type, "soksak-hwp-viewport-marker");
  assert.match(read.error, /resource timing requires the document performance clock and resource entries/);
  dispose();
});

test("view diagnostics serialize marker start and clean it up when disposal overlaps start", async () => {
  const { createStudioViewportDiagnostics } = await import("../ui/hwp-diagnostics.js");
  const listeners = new Set();
  const posted = [];
  const region = {
    onMessage(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    post(message) {
      posted.push(message);
      if (message.operation === "stop") queueMicrotask(() => {
        for (const listener of listeners) listener({ type: message.type, id: message.id, result: null });
      });
      return Promise.resolve();
    },
  };
  let enabled = false;
  const diagnostics = {
    read: () => ({ enabled }),
    async start() { enabled = true; return { enabled: true, sequence: 1 }; },
    async stop() { enabled = false; return { enabled: false, sequence: 1 }; },
    async dispose() { enabled = false; },
  };
  const commands = createStudioViewportDiagnostics({ diagnostics, documentRegion: region });
  const starting = commands.start();
  assert.deepEqual(posted.map(({ operation }) => operation), ["start"]);
  await assert.rejects(commands.start(), /already active/);
  const disposing = commands.dispose();
  const startRequest = posted[0];
  for (const listener of listeners) listener({
    type: startRequest.type, id: startRequest.id, result: viewportEvidence,
  });
  await Promise.all([starting, disposing]);
  assert.deepEqual(posted.map(({ operation }) => operation), ["start", "stop"]);
  assert.equal(enabled, false);
  assert.equal(listeners.size, 0, "the completed marker request must remove its response listener");
});

test("view diagnostic start removes the viewport marker when observer startup fails", async () => {
  const { createStudioViewportDiagnostics } = await import("../ui/hwp-diagnostics.js");
  const listeners = new Set();
  const posted = [];
  const region = {
    onMessage(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    post(message) {
      posted.push(message);
      queueMicrotask(() => {
        for (const listener of listeners) listener({
          type: message.type, id: message.id,
          ...(message.operation === "start" ? { result: viewportEvidence } : { result: null }),
        });
      });
      return Promise.resolve();
    },
  };
  const diagnostics = {
    read: () => ({ enabled: false }),
    async start() { throw new Error("observer refused"); },
    async stop() { throw new Error("observer is inactive"); },
    async dispose() {},
  };
  const commands = createStudioViewportDiagnostics({ diagnostics, documentRegion: region });
  await assert.rejects(commands.start(), /observer refused/);
  assert.deepEqual(posted.map(({ operation }) => operation), ["start", "stop"]);
  assert.equal(listeners.size, 0);
});

test("view diagnostic start rejects inconsistent marker evidence and requests cleanup", async () => {
  const { createStudioViewportDiagnostics } = await import("../ui/hwp-diagnostics.js");
  const listeners = new Set();
  const posted = [];
  const region = {
    onMessage(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    post(message) {
      posted.push(message);
      queueMicrotask(() => {
        for (const listener of listeners) listener({ type: message.type, id: message.id,
          result: message.operation === "start" ? { ...viewportEvidence, visualViewport: { ...viewportEvidence.visualViewport, scale: 2 } } : null });
      });
      return Promise.resolve();
    },
  };
  const diagnostics = {
    read: () => ({ enabled: false }),
    async start() { throw new Error("observer must not start for invalid marker evidence"); },
    async stop() { throw new Error("observer is inactive"); },
    async dispose() {},
  };
  const commands = createStudioViewportDiagnostics({ diagnostics, documentRegion: region });
  await assert.rejects(commands.start(), /inconsistent viewport dimensions/);
  assert.deepEqual(posted.map(({ operation }) => operation), ["start", "stop"]);
  assert.equal(listeners.size, 0);
});

test("disposal cancels pending viewport reads and removes the marker", async () => {
  const { createStudioViewportDiagnostics } = await import("../ui/hwp-diagnostics.js");
  const listeners = new Set();
  const posted = [];
  const region = {
    onMessage(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    post(message) {
      posted.push(message);
      if (message.operation !== "read") queueMicrotask(() => {
        for (const listener of listeners) listener({
          type: message.type, id: message.id,
          result: message.operation === "start" ? viewportEvidence : null,
        });
      });
      return Promise.resolve();
    },
  };
  let enabled = false;
  const diagnostics = {
    read: () => ({ enabled }),
    async start() { enabled = true; return { enabled: true }; },
    async stop() { enabled = false; return { enabled: false }; },
    async dispose() { enabled = false; },
  };
  const commands = createStudioViewportDiagnostics({ diagnostics, documentRegion: region });
  await commands.start();
  const reading = commands.read();
  await Promise.resolve();
  const disposing = commands.dispose();
  await assert.rejects(reading, /cancelled during disposal/);
  await disposing;
  assert.deepEqual(posted.map(({ operation }) => operation), ["start", "read", "stop"]);
  assert.equal(listeners.size, 0);
});

test("stopping during marker startup waits for the start and then removes the marker", async () => {
  const { createStudioViewportDiagnostics } = await import("../ui/hwp-diagnostics.js");
  const listeners = new Set();
  const posted = [];
  const region = {
    onMessage(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    post(message) {
      posted.push(message);
      if (message.operation === "stop") queueMicrotask(() => {
        for (const listener of listeners) listener({ type: message.type, id: message.id, result: null });
      });
      return Promise.resolve();
    },
  };
  let enabled = false;
  const diagnostics = {
    read: () => ({ enabled }),
    async start() { enabled = true; return { enabled: true }; },
    async stop() { enabled = false; return { enabled: false }; },
    async dispose() { enabled = false; },
  };
  const commands = createStudioViewportDiagnostics({ diagnostics, documentRegion: region });
  const starting = commands.start();
  const stopping = commands.stop();
  let stopSettled = false;
  void stopping.then(() => { stopSettled = true; }, () => { stopSettled = true; });
  await Promise.resolve();
  assert.equal(stopSettled, false, "stop ran before the marker start request completed");
  const startRequest = posted[0];
  for (const listener of listeners) listener({
    type: startRequest.type, id: startRequest.id, result: viewportEvidence,
  });
  await starting;
  const stopped = await stopping;
  assert.equal(stopped.studioViewport, null);
  assert.deepEqual(posted.map(({ operation }) => operation), ["start", "stop"]);
  assert.equal(enabled, false);
});

test("failed marker stop remains tracked so disposal retries removal", async () => {
  const { createStudioViewportDiagnostics } = await import("../ui/hwp-diagnostics.js");
  const listeners = new Set();
  const posted = [];
  let stopCount = 0;
  const region = {
    onMessage(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    post(message) {
      posted.push(message);
      queueMicrotask(() => {
        for (const listener of listeners) {
          if (message.operation === "start") listener({ type: message.type, id: message.id, result: viewportEvidence });
          else if (message.operation === "stop" && ++stopCount === 1) listener({ type: message.type, id: message.id, error: "stop refused" });
          else if (message.operation === "stop") listener({ type: message.type, id: message.id, result: null });
        }
      });
      return Promise.resolve();
    },
  };
  let enabled = false;
  const diagnostics = {
    read: () => ({ enabled }),
    async start() { enabled = true; return { enabled: true }; },
    async stop() { enabled = false; return { enabled: false }; },
    async dispose() { enabled = false; },
  };
  const commands = createStudioViewportDiagnostics({ diagnostics, documentRegion: region });
  await commands.start();
  await assert.rejects(commands.stop(), /stop refused/);
  await commands.dispose();
  assert.deepEqual(posted.map(({ operation }) => operation), ["start", "stop", "stop"]);
  assert.equal(listeners.size, 0);
});

test("concurrent disposal callers both wait for marker cleanup", async () => {
  const { createStudioViewportDiagnostics } = await import("../ui/hwp-diagnostics.js");
  const listeners = new Set();
  const posted = [];
  let markStopPosted;
  const stopPosted = new Promise((resolve) => { markStopPosted = resolve; });
  const region = {
    onMessage(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    post(message) {
      posted.push(message);
      if (message.operation === "stop") markStopPosted(message);
      return Promise.resolve();
    },
  };
  let enabled = false;
  const diagnostics = {
    read: () => ({ enabled }),
    async start() { enabled = true; return { enabled: true }; },
    async stop() { enabled = false; return { enabled: false }; },
    async dispose() { enabled = false; },
  };
  const commands = createStudioViewportDiagnostics({ diagnostics, documentRegion: region });
  const starting = commands.start();
  const first = commands.dispose();
  const second = commands.dispose();
  let secondSettled = false;
  void second.then(() => { secondSettled = true; }, () => { secondSettled = true; });
  const startRequest = posted[0];
  for (const listener of listeners) listener({ type: startRequest.type, id: startRequest.id, result: viewportEvidence });
  const stopRequest = await stopPosted;
  assert.equal(secondSettled, false, "a later disposal caller returned before cleanup finished");
  for (const listener of listeners) listener({ type: stopRequest.type, id: stopRequest.id, result: null });
  await Promise.all([starting, first, second]);
  assert.equal(secondSettled, true);
  assert.deepEqual(posted.map(({ operation }) => operation), ["start", "stop"]);
});

test("mount and pagehide share the in-flight view diagnostic disposer", async () => {
  assert.equal(typeof source.createViewDiagnosticDisposer, "function",
    "the view diagnostic attachment has no shared disposer for its mount and pagehide callers");
  const listeners = new Map();
  const viewWindow = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
  };
  let finishCleanup;
  let cleanups = 0;
  let disposed = false;
  const cleanup = new Promise((resolve) => { finishCleanup = resolve; });
  const dispose = source.createViewDiagnosticDisposer({
    viewWindow,
    onDisposeStart: () => { disposed = true; },
    cleanup: async () => { cleanups++; await cleanup; },
    onError: (error) => { throw error; },
  });
  const pageHide = listeners.get("pagehide");
  pageHide();
  const mountDisposal = dispose();
  assert.equal(disposed, true);
  assert.equal(listeners.has("pagehide"), false);
  assert.equal(dispose(), mountDisposal, "the mount caller must receive the pagehide cleanup promise");
  await Promise.resolve();
  assert.equal(cleanups, 1);
  finishCleanup();
  await mountDisposal;
});

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

test("the studio diagnostic loader imports only the declared marker in diagnostic builds", async (t) => {
  assert.equal(typeof source.loadStudioDiagnostics, "function",
    "the studio host has no opt-in diagnostic companion loader");
  const originalFetch = globalThis.fetch;
  const loadCalls = [];
  globalThis.fetch = async () => ({ status: 404, ok: false });
  t.after(() => { globalThis.fetch = originalFetch; });
  assert.equal(await source.loadStudioDiagnostics("soksak://hwp/ui/studio/index.html", async (modulePath) => {
    loadCalls.push(modulePath);
    return { attachStudio() {} };
  }), null);
  assert.deepEqual(loadCalls, [], "a release studio host imported diagnostic code");

  const declaration = { module: "ui/hwp-diagnostics.js" };
  globalThis.fetch = async (url) => {
    assert.equal(url, "soksak://hwp/diagnostics.json");
    return { status: 200, ok: true, json: async () => declaration };
  };
  const attachStudio = () => {};
  const loaded = await source.loadStudioDiagnostics("soksak://hwp/ui/studio/index.html", async (modulePath) => {
    loadCalls.push(modulePath);
    return { attachStudio };
  });
  assert.deepEqual(loaded, { declaration, attachStudio });
  assert.deepEqual(loadCalls, ["ui/hwp-diagnostics.js"]);
});

test("the studio page resolves its diagnostic declaration and companion from the package root", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, "soksak://hwp/diagnostics.json", "the nested studio page resolved the declaration outside the package root");
    return { status: 200, ok: true, json: async () => ({ module: "ui/hwp-diagnostics.js" }) };
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const imported = [];
  const loaded = await source.loadStudioDiagnostics("soksak://hwp/ui/studio/index.html", async (modulePath) => {
    imported.push(modulePath);
    return { attachStudio() {} };
  });
  assert.equal(typeof loaded.attachStudio, "function");
  assert.deepEqual(imported, ["ui/hwp-diagnostics.js"]);
});

test("studio startup skips diagnostics in releases and waits for the diagnostic companion", async (t) => {
  assert.equal(typeof source.startStudioDiagnostics, "function",
    "the studio host has no diagnostic-only startup gate");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("release startup fetched a diagnostic declaration"); };
  t.after(() => { globalThis.fetch = originalFetch; });
  let imports = 0;
  const window = { location: { href: "soksak://hwp/ui/studio-host.js" } };
  const document = { defaultView: window };
  assert.equal(await source.startStudioDiagnostics(window.location.href, {
    document, window,
    loadModule: async () => { imports++; return { attachStudio() {} }; },
  }), null);
  assert.equal(imports, 0, "release startup imported the diagnostic companion");

  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({ module: "ui/hwp-diagnostics.js" }) });
  let finishAttach;
  let attached = false;
  const load = source.startStudioDiagnostics(`${window.location.href}?diagnostics=1`, {
    document, window,
    loadModule: async () => ({ attachStudio: async (context) => {
      assert.equal(context.document, document);
      assert.equal(context.window, window);
      await new Promise((resolve) => { finishAttach = resolve; });
      attached = true;
      return async () => {};
    } }),
  });
  let settled = false;
  void load.then(() => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, "diagnostic startup completed before its companion attached");
  finishAttach();
  assert.equal(typeof await load, "function");
  assert.equal(attached, true);
});

test("studio startup reports a diagnostic failure without announcing listening", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({ module: "ui/hwp-diagnostics.js" }) });
  t.after(() => { globalThis.fetch = originalFetch; });
  const messages = [];
  const window = { location: { href: "soksak://hwp/ui/studio/index.html?diagnostics=1" }, addEventListener() {} };
  const started = await source.startStudioHost(window.location.href, {
    document: { defaultView: window }, window, post: (message) => messages.push(message),
    loadModule: async () => ({ attachStudio: async () => { throw new Error("marker listener could not attach"); } }),
  });
  assert.equal(started, false);
  assert.deepEqual(messages, [{ event: "error", message: "HWP studio diagnostics failed: marker listener could not attach" }]);
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
  const performance = { timeOrigin: 1000, frameTime: 27.5, now() {
    assert.equal(this, performance, "the observer clock must be bound to the view performance object");
    return this.frameTime;
  } };
  const document = { documentElement: root, defaultView: {
    history: { length: 3 }, performance, ResizeObserver: class {},
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
  } };
  const documentRegion = { state: { history: { entries: [{ url: "soksak://hwp/ui/studio/index.html" }], index: 0 } } };
  const logs = [];
  let started = 0;
  let stopped = 0;
  const diagnostic = source.createViewFrameDiagnostics({ document, documentRegion, observe: async ({ document: observed, log, now }) => {
    assert.equal(observed, document, "the observer must target the view document root");
    assert.equal(typeof now, "function", "the observer must receive the view performance clock");
    assert.equal(now(), 27.5, "the observer clock must return the view's performance.now value");
    assert.equal(root.style.getPropertyValue("background-color"), "rgb(1, 2, 3)",
      "frame observation must preserve the view root's existing paint");
    started++;
    log.trace("view.content_frame", { sequence: 0, firstResizeAtMs: 7, resizeAtMs: 8, resizeCount: 2, width: 720, height: 540, documentTimeOriginMs: 1000, frameTimeMs: 16 });
    return async () => { stopped++; };
  }, runtime: { log: { trace: (event, fields) => { logs.push({ event, fields }); } } } });
  assert.equal(started, 0, "normal creation started an observer");
  assert.deepEqual(diagnostic.read(), { enabled: false, sequence: 0, historyEntries: 3, regionHistoryEntries: 1, width: 720, height: 540 });
  documentRegion.state.history.entries.push({ url: "https://example.test/next" });
  assert.equal(diagnostic.read().regionHistoryEntries, 2,
    "the read command must report the current native document-region history, not a cached count");
  documentRegion.state.history.entries.pop();
  assert.deepEqual(await diagnostic.start(), { enabled: true, sequence: 1, historyEntries: 3, regionHistoryEntries: 1,
    width: 720, height: 540, sourceClock: { documentTimeOriginMs: 1000, sourceNowMs: 27.5, sourceResolutionMs: 1 } });
  assert.equal(started, 1);
  assert.deepEqual(diagnostic.read(), { enabled: true, sequence: 1, historyEntries: 3, regionHistoryEntries: 1, width: 720, height: 540 });
  await assert.rejects(diagnostic.start(), /already active/);
  rect = { width: 640, height: 480 };
  assert.deepEqual(await diagnostic.stop(), { enabled: false, sequence: 1, historyEntries: 3, regionHistoryEntries: 1, width: 640, height: 480 });
  assert.deepEqual(styles.get("background-color"), { value: "rgb(1, 2, 3)", priority: "" },
    "stop must preserve the exact root background");
  assert.equal(stopped, 1, "stop did not dispose the observer");
  await assert.rejects(diagnostic.stop(), /not active/);
  await diagnostic.start();
  await diagnostic.dispose();
  assert.equal(stopped, 2, "dispose did not stop the active observer");
  assert.deepEqual(styles.get("background-color"), { value: "rgb(1, 2, 3)", priority: "" },
    "dispose must preserve the exact root background");
  assert.deepEqual(logs, [0, 0].map((sequence) => ({ event: "view.content_frame", fields: {
    sequence, firstResizeAtMs: 7, resizeAtMs: 8, resizeCount: 2, width: 720, height: 540,
    documentTimeOriginMs: 1000, frameTimeMs: 16,
  } })));

  const failed = source.createViewFrameDiagnostics({ document, documentRegion, observe: async () => { throw new Error("observer refused"); },
    runtime: { log: { trace() {} } } });
  await assert.rejects(failed.start(), /observer refused/);
  assert.deepEqual(failed.read(), { enabled: false, sequence: 0, historyEntries: 3, regionHistoryEntries: 1, width: 640, height: 480 });
  assert.deepEqual(styles.get("background-color"), { value: "rgb(1, 2, 3)", priority: "" },
    "failed start must preserve the exact root background");

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
    "dispose during start must preserve the exact root background");
});

test("document-frame observation does not repaint the view root", async () => {
  const styles = new Map();
  const root = {
    getBoundingClientRect: () => ({ width: 800, height: 600 }),
    style: {
      getPropertyValue: (name) => styles.get(name)?.value ?? "",
      getPropertyPriority: (name) => styles.get(name)?.priority ?? "",
      setProperty: (name, value, priority = "") => styles.set(name, { value, priority }),
      removeProperty: (name) => styles.delete(name),
    },
  };
  const window = { history: { length: 1 }, performance: { timeOrigin: 1, now: () => 0 }, ResizeObserver: class {},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
  const document = { documentElement: root, defaultView: window };
  const diagnostics = source.createViewFrameDiagnostics({ document,
    documentRegion: { state: { history: { entries: [{ url: "soksak://hwp/ui/studio/index.html" }] } } },
    observe: async () => async () => {}, runtime: { log: { trace() {} } } });
  await diagnostics.start();
  assert.equal(root.style.getPropertyValue("background-color"), "",
    "frame observation changed the view root paint even though the captured viewport marker owns geometry");
  await diagnostics.stop();
  assert.equal(root.style.getPropertyValue("background-color"), "");
});

test("a native window message reply does not re-enter the studio marker handler", { timeout: 1000 }, async () => {
  const { attachStudio } = await import("../ui/hwp-diagnostics.js");
  const listeners = new Map();
  const posted = [];
  const queued = [];
  const root = {
    clientWidth: 320,
    clientHeight: 240,
    append() {},
  };
  const style = { transform: "none", perspective: "none", filter: "none", contain: "none", willChange: "auto", containerType: "normal" };
  const window = {
    innerWidth: 320,
    innerHeight: 240,
    visualViewport: { width: 320, height: 240, offsetLeft: 0, offsetTop: 0, scale: 1 },
    location: { origin: "soksak://hwp" },
    getComputedStyle: () => style,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    postMessage(data, origin) {
      posted.push(data);
      queued.push({ source: window, origin, data });
    },
  };
  const document = {
    documentElement: root,
    createElement: () => ({ style: {}, setAttribute() {}, getBoundingClientRect: () => ({ left: 4, top: 4, right: 316, bottom: 236 }), remove() {} }),
  };
  const dispose = await attachStudio({ document, window });
  const deliverNativePost = async (message) => {
    await listeners.get("message")({ source: window, origin: window.location.origin, data: message });
    let delivered = 0;
    while (queued.length && delivered < 4) {
      delivered += 1;
      await listeners.get("message")(queued.shift());
    }
  };

  await deliverNativePost({ type: "soksak-hwp-viewport-marker", id: "native-start-1", operation: "start" });
  assert.equal(posted.length, 1, "the companion reply must not be handled as a new native command");
  assert.equal(posted[0].id, "native-start-1");
  assert.ok(posted[0].result, "the native request must receive viewport evidence");
  dispose();
});

test("native document-post echoes do not resolve a marker request before the studio reply", { timeout: 1000 }, async () => {
  const { attachStudio, createStudioViewportDiagnostics } = await import("../ui/hwp-diagnostics.js");
  const studioListeners = new Map();
  const regionListeners = new Set();
  const sentToStudio = [];
  const markers = [];
  const root = {
    clientWidth: 320,
    clientHeight: 240,
    append(element) { markers.push(element); },
  };
  const style = { transform: "none", perspective: "none", filter: "none", contain: "none", willChange: "auto", containerType: "normal" };
  const window = {
    innerWidth: 320,
    innerHeight: 240,
    visualViewport: { width: 320, height: 240, offsetLeft: 0, offsetTop: 0, scale: 1 },
    location: { origin: "soksak://hwp" },
    getComputedStyle: () => style,
    addEventListener(type, listener) { studioListeners.set(type, listener); },
    removeEventListener(type, listener) { if (studioListeners.get(type) === listener) studioListeners.delete(type); },
    postMessage(message, origin) {
      queueMicrotask(async () => {
        await studioListeners.get("message")({ source: window, origin, data: message });
        for (const listener of regionListeners) listener(message);
      });
    },
  };
  const document = {
    documentElement: root,
    createElement: () => ({ style: {}, setAttribute() {}, getBoundingClientRect: () => ({ left: 4, top: 4, right: 316, bottom: 236 }), remove() {
      const index = markers.indexOf(this);
      if (index >= 0) markers.splice(index, 1);
    } }),
  };
  const disposeStudio = await attachStudio({ document, window });
  const region = {
    onMessage(listener) { regionListeners.add(listener); return () => regionListeners.delete(listener); },
    post(message) {
      sentToStudio.push(message);
      for (const listener of regionListeners) listener(message);
      queueMicrotask(() => studioListeners.get("message")({ source: window, origin: window.location.origin, data: message }));
      return Promise.resolve();
    },
  };
  let observing = false;
  const diagnostics = {
    read: () => ({ enabled: observing }),
    async start() { observing = true; return { enabled: true, sequence: 1 }; },
    async stop() { observing = false; return { enabled: false, sequence: 1 }; },
    async dispose() { observing = false; },
  };
  const commands = createStudioViewportDiagnostics({ diagnostics, documentRegion: region });

  const started = await commands.start();
  assert.deepEqual(sentToStudio.map(({ operation }) => operation), ["start"]);
  assert.deepEqual(started.studioViewport.markerColor, [255, 0, 255]);
  assert.equal(markers.length, 1);
  await commands.dispose();
  assert.deepEqual(sentToStudio.map(({ operation }) => operation), ["start", "stop"]);
  assert.equal(markers.length, 0);
  disposeStudio();
});
