// The view page at the consumer boundary (#H22): the page of the view reads the start values of the surface, builds its
// surface context over the view channel, attaches the document region "studio" through the composition of the view, and
// mounts the hwp module into the page. The page is loaded by the host fixture of this repository (test/fixtures/host.mjs), which
// answers each call of the page as the workbench answers it. The editor page of the region is played by this file: its
// requests are answered as rhwp-studio answers them, and its messages reach the page as the document-message and
// document-state events that the view pushes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { openPageHost } from "./fixtures/host.mjs";

const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
const diagnostics = JSON.parse(readFileSync(new URL("../diagnostics.json", import.meta.url), "utf8"));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (text) => new TextEncoder().encode(text);
const catalog = JSON.parse(readFileSync(new URL("../events.json", import.meta.url), "utf8"));
const ADDRESS = "soksak://hwp/ui/studio/index.html?chrome=embed";
const SURFACE = "hwp-1";
const SIDECAR = "@soksak/sidecar-files";
const PAGE = new URL("../ui/view.js", import.meta.url);
const ROOT = new URL("../", import.meta.url);
const LAYOUT = { width: 800, height: 600 };
const declared = (kind, name) => manifest.exposes[kind].some((entry) => entry.name === name);

// The check of a view page (core docs/spec/plugin-processes.md, rule 4): the page begins with its doctype and holds no import map,
// because the host inserts the view import map after the doctype of each view page.
function checkViewPage(html) {
  assert.match(html, /^<!doctype html>/i, "the view page begins with its doctype");
  assert.doesNotMatch(html, /<script\b[^>]*\btype\s*=\s*["']?importmap\b/i, "the view page holds no import map of its own");
}

const toBase64 = (value) => btoa(String.fromCharCode(...value));
const fromBase64 = (text) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
const isMicros = (value) => Number.isInteger(value) && value >= 0;

/** The records of the view log that have the name plugin.hwp.<name>. */
const named = (records, name) => records.filter((entry) => entry.event === `plugin.hwp.${name}`);
// The timers that a page starts: the calls of setTimeout and setInterval that the view records. Animation frames are not timers.
const timersStarted = (view) => view.observed.timers.filter(({ kind }) => kind === "setTimeout" || kind === "setInterval");
/** The records of the view log once the view has settled, which is when every batch that the page sent has been relayed. */
const events = async (host) => {
  await host.view.settled();
  return host.view.events;
};
/** The first record of plugin.hwp.<name> whose fields match, once the view has settled. */
const logged = async (host, name, match = () => true) => {
  const found = named(await events(host), name).find((entry) => match(entry.fields));
  assert.ok(found, `no plugin.hwp.${name} record matches`);
  return found;
};
/** The first record of plugin.hwp.report whose text matches reason, once the page has ended its start. */
const reported = async (host, reason) => {
  await host.loading;
  const found = named(await events(host), "report").find((entry) => reason.test(entry.fields.text ?? ""));
  assert.ok(found, `no report matches ${reason}`);
  return found;
};
/** The nth record of name (from 1), once the view has settled. */
const nth = async (host, name, count) => {
  const found = named(await events(host), name);
  assert.ok(found.length >= count, `plugin.hwp.${name} is recorded ${found.length} times, expected ${count}`);
  return found[count - 1];
};
/** The params of each call of the page named command, in the order the page made them. */
const callsOf = (host, command) => host.view.calls.filter((call) => call.command === command).map((call) => call.params);
/** The core commands that the page ran, as [name, params]. */
const commandsOf = (host) => host.view.observed.commands
  .filter((command) => command.name.startsWith("core."))
  .map((command) => [command.name, command.params]);
/** The calls of the page that register the exposure and change its values, as [name, payload]. */
const nativeCalls = (host) => host.view.calls
  .filter((call) => call.command === "runtime.native.call" && (call.params.name === "registered" || call.params.name === "changed"))
  .map((call) => [call.params.name, call.params.payload]);
const starting = (records) => named(records, "phase").some((entry) => entry.fields.phase === "starting");

/**
 * Opens the view page of one case in host mode and returns the host of the case, whose view is closed when the test ends. The editor
 * page of the region "studio" is played here: its requests are answered as rhwp-studio answers them, its messages and states are
 * pushed to the view, and the files of the files sidecar are an in-memory map. The page is not loaded: setup and startPage load it.
 *
 *     stored     the tab state of the surface, or null for a new tab
 *     params     the parameters of the tab
 *     files      the Map of the files sidecar
 *     origin     the origin of the start values
 *     start      the start values, or null for a view without window.sokSurface (overrides params and origin)
 *     listens    whether the editor page posts listening after its load
 *     silent     the embed request methods that the editor never answers
 *     history    whether the document region restored a session history
 *     replies    the answers of the editor per request method, which override the answers of rhwp-studio
 *     refuseLog  the fault of the host for each batch of the page log, or null
 *     place      the answer of core.file.place at the first save of a blank document
 */
async function open(t, {
  stored = null, params = { path: "docs/plan.hwp" }, files = new Map([["docs/plan.hwp", bytes("첫 문단")]]),
  origin = { directory: "/project" }, start = { surface: SURFACE, params, origin, project: { id: "prj-project", root: "/project" }, diagnostics: null },
  listens = true, silent = [], history = false, replies = {}, refuseLog = null,
  place = () => { throw new Error("the test runs no core command"); },
} = {}) {
  let view = null;
  const editor = { document: null, listening: false, navigations: 0, shown: null, loaded: null, requests: [], dropped: [], savedAs: [], restoring: false };
  // Each message of the editor page reaches the page as a document-message event, after the call that delivers it has returned.
  const posted = (message) => queueMicrotask(() => view.push("document-message", { document: "studio", message }));
  const deliverState = (state) => queueMicrotask(() => view.push("document-state", { document: "studio", state }));
  // The editor shows the page at url as a load does: its state reports the load, and its listening message follows its scripts.
  const show = (url) => {
    editor.navigations += 1;
    editor.shown = url;
    deliverState({ url, loading: false, error: null, navigations: editor.navigations });
    if (listens) {
      queueMicrotask(() => {
        editor.listening = true;
        posted({ type: "soksak-hwp", event: "listening" });
      });
    }
  };
  const answers = {
    ready: () => true,
    loadFile: ({ data }) => { editor.document = Uint8Array.from(data); return { pageCount: 1 }; },
    exportHwp: () => Array.from(editor.document),
    exportHwpx: () => Array.from(editor.document),
    notifySaved: ({ fileName }) => { editor.savedAs.push(fileName); return { ok: true, wasDirty: true }; },
    // The studio command file:new-doc replaces the document with a blank document.
    "automation.execute": ({ id }) => {
      if (id !== "file:new-doc") throw new Error(`unexpected automation command ${id}`);
      editor.document = new Uint8Array();
      return { ok: true };
    },
    pageCount: () => 1,
  };
  // A request of the page to the editor: a request that the editor does not listen for is dropped, and each other one is answered.
  const request = (message) => {
    assert.doesNotThrow(() => JSON.stringify(message));
    if (!editor.listening) {
      editor.dropped.push(message.method);
      return null;
    }
    editor.requests.push(message.method);
    if (silent.includes(message.method)) return null;
    const answer = replies[message.method] ?? answers[message.method];
    if (!answer) {
      posted({ type: "rhwp-response", id: message.id, error: `unknown method ${message.method}` });
      return null;
    }
    // A reply that throws rejects the request of the page, as the editor does when it fails.
    posted({ type: "rhwp-response", id: message.id, result: answer(message.params) });
    return null;
  };
  const studio = {
    get document() { return editor.document; },
    get loaded() { return editor.loaded; },
    get requests() { return editor.requests; },
    get dropped() { return editor.dropped; },
    get savedAs() { return editor.savedAs; },
    /** Appends text to the document and posts the modified message, once the page has handled it. */
    async edit(text) {
      editor.document = new Uint8Array([...editor.document, ...bytes(text)]);
      posted({ type: "soksak-hwp", event: "modified", modified: true });
      await view.settled();
    },
    /** Posts a message of the editor page, once the page has handled it. */
    async post(message) {
      posted(message);
      await view.settled();
    },
    /** The WebContent process of the shown page ends, and the region reports it. */
    async end() {
      editor.listening = false;
      deliverState({ url: editor.shown, loading: false, error: "the web content process ended", navigations: editor.navigations });
      await view.settled();
    },
    /** The region restores its session history entry, which shows the editor page once the page has subscribed to the region. */
    async restore() {
      show(ADDRESS);
      await view.settled();
    },
    /** Another navigation starts in the region, and the page that it leaves answers no request. */
    async navigate(url) {
      editor.listening = false;
      editor.navigations += 1;
      editor.shown = url;
      deliverState({ url, loading: true, error: null, navigations: editor.navigations });
      await view.settled();
    },
  };
  // The files sidecar answers each request of the page with its reply, which the page receives as a sidecar message.
  const reply = (body) => queueMicrotask(() => view.sidecarMessage(SIDECAR, SURFACE, { body }));
  const sidecar = (body) => {
    if (body.operation === "watch") return reply({ id: body.id });
    if (body.operation === "readBytes") return reply({ id: body.id, data: toBase64(files.get(body.path)), version: sha(files.get(body.path)) });
    if (body.operation === "writeBytes" && body.expect === null) {
      if (files.has(body.path)) return reply({ id: body.id, error: `exists: ${body.path}` });
      files.set(body.path, fromBase64(body.data));
      return reply({ id: body.id, version: sha(files.get(body.path)) });
    }
    if (body.operation === "writeBytes") {
      if (sha(files.get(body.path)) !== body.expect) return reply({ id: body.id, error: `changed on disk: ${body.path}` });
      files.set(body.path, fromBase64(body.data));
      return reply({ id: body.id, version: sha(files.get(body.path)) });
    }
    throw new Error(`unexpected operation ${body.operation}`);
  };
  const region = (name) => {
    if (name !== "studio") throw new Error(`the page called the unknown region ${name}`);
  };
  const fixtures = {
    surface: SURFACE,
    declarations: manifest.exposes,
    sidecars: [SIDECAR],
    sidecar: { [SIDECAR]: sidecar },
    native: { registered: () => null, changed: () => null, exposureReply: () => null },
    commands: { "core.file.place": (command) => place(command) },
    state: { read: () => stored, write: () => null },
    refuse: refuseLog === null ? {} : { "runtime.log": refuseLog },
    composition: {
      declaration: () => structuredClone(manifest.surface.composition),
      place: () => null,
      report: () => null,
      document: {
        attach: (name) => {
          region(name);
          editor.restoring = history;
          return { history };
        },
        load: (name, url) => {
          region(name);
          editor.loaded = url;
          show(url);
          return null;
        },
        zoom: (name) => { region(name); return null; },
        go: (name) => { region(name); return null; },
        post: (name, message) => { region(name); return request(message); },
        subscribe: (name) => { region(name); return null; },
        unsubscribe: (name) => { region(name); return null; },
        detach: (name) => { region(name); return null; },
      },
    },
  };
  view = await openPageHost({ host: fixtures, start, layout: LAYOUT, root: ROOT });
  t.after(() => view.close());
  let nextExposure = 0;
  // Forwards one exposure request of core to the page and resolves with the reply {result} or {error} of the page.
  const expose = async (method, requestParams) => {
    const id = ++nextExposure;
    await view.push("exposure-request", { id, surface: SURFACE, method, params: requestParams });
    await view.settled();
    const answered = view.calls.findLast((call) => call.command === "runtime.native.call" && call.params.name === "exposureReply"
      && call.params.payload.id === id);
    assert.ok(answered, `the page did not reply to exposure request ${id}`);
    const { id: _id, ...answer } = answered.params.payload;
    return answer;
  };
  return {
    view,
    studio,
    files,
    sidecar: {
      /** Delivers a message of the files sidecar that the page receives without a request id, such as a change or a failure. */
      async emit(body) {
        view.sidecarMessage(SIDECAR, SURFACE, { body });
        await view.settled();
      },
    },
    /** Runs the command of the page, as the workbench runs it. */
    run: (command, commandParams) => view.request(command, commandParams),
    expose,
    status: async () => (await expose("status.get", { name: "hwp.document" })).result,
  };
}

/** Opens the page of one case and loads its module without waiting for the end of the start. */
async function startPage(t, options = {}) {
  const host = await open(t, options);
  host.loading = host.view.load(PAGE);
  return host;
}

/** Opens the page of one case, loads its module, and waits for the end of its start. */
async function setup(t, options = {}) {
  const host = await startPage(t, options);
  await host.loading;
  return host;
}

test("the view page begins with its doctype, holds no import map, and carries the page script", () => {
  const html = readFileSync(new URL("../ui/index.html", import.meta.url), "utf8");
  assert.equal(checkViewPage(html), undefined);
  assert.match(html, /<script type="module" src="\.\/view\.js"><\/script>/);
});

test("plugin.json is a valid manifest that opens hwp and hwpx files in the document region of a view", () => {
  // The manifest fields that the view page relies on; the SDK validator of the manifest runs in make check.
  assert.equal(manifest.surface.composition.kind, "view");
  assert.deepEqual(manifest.surface.opens, { extensions: ["hwp", "hwpx"] });
  assert.deepEqual(manifest.surface.composition,
    { kind: "view", page: "ui/index.html", regions: [{ name: "studio", kind: "document", input: "native" }], overlays: [] });
});

test("the plugin requires the files sidecar display identity release", () => {
  assert.equal(manifest.dependencies["@soksak/sidecar-files"], ">=0.0.9");
});

test("view-frame commands exist only in the diagnostic declaration and module", () => {
  const names = ["hwp.diagnostics.frames.start", "hwp.diagnostics.frames.stop", "hwp.diagnostics.frames.read"];
  assert.equal(diagnostics.module, "ui/hwp-diagnostics.js");
  assert.deepEqual(diagnostics.exposes.commands.map((entry) => entry.name), names);
  for (const command of diagnostics.exposes.commands) {
    const resultFields = ["enabled", "height", "historyEntries", "regionHistoryEntries", "sequence", "studioViewport", "width"];
    if (command.name === "hwp.diagnostics.frames.start") resultFields.push("sourceClock");
    if (command.name === "hwp.diagnostics.frames.read") resultFields.push("resourceTimings", "studioClock");
    assert.deepEqual(Object.keys(command.result.properties).sort(), resultFields.sort(),
      `${command.name} must declare both history counts and studio viewport evidence`);
    const viewport = command.result.properties.studioViewport;
    assert.deepEqual(viewport.type, ["object", "null"]);
    assert.deepEqual(Object.keys(viewport.properties).sort(), [
      "borderWidth", "clientHeight", "clientWidth", "fixedContainingBlock", "innerHeight", "innerWidth",
      "markerColor", "rect", "visualViewport",
    ].sort());
    assert.deepEqual(Object.keys(viewport.properties.rect.properties).sort(), ["bottom", "left", "right", "top"]);
    assert.deepEqual(Object.keys(viewport.properties.visualViewport.properties).sort(), ["height", "offsetLeft", "offsetTop", "scale", "width"]);
    assert.deepEqual(Object.keys(viewport.properties.fixedContainingBlock.properties).sort(),
      ["contain", "containerType", "filter", "perspective", "transform", "willChange"].sort());
  }
  const read = diagnostics.exposes.commands.find((entry) => entry.name === "hwp.diagnostics.frames.read");
  assert.deepEqual(Object.keys(read.result.properties.studioClock.properties).sort(), ["documentTimeOriginMs", "snapshotAtMs"]);
  assert.deepEqual(Object.keys(read.result.properties.resourceTimings.items.properties).sort(), [
    "decodedBodySize", "duration", "encodedBodySize", "fetchStart", "initiatorType", "name", "requestStart",
    "responseEnd", "responseStart", "startTime", "transferSize",
  ]);
  assert.deepEqual(read.result.properties.studioClock.type, ["object", "null"]);
  assert.deepEqual(read.result.properties.resourceTimings.type, ["array", "null"]);
  assert.equal(names.some((name) => manifest.exposes.commands.some((entry) => entry.name === name)), false);
  const files = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).files;
  // Every release holds the diagnostic declaration and its module, and only a diagnostic build reads them (core docs/spec/plugins.md).
  assert.equal(files.includes("diagnostics.json"), true);
  assert.equal(files.includes(diagnostics.module), true);
  assert.ok(files.includes("ui/view-diagnostics.js"), "the release package keeps the declaration loader");
});

test("the view page refuses to mount without the start values of the surface", async (t) => {
  const host = await open(t, { start: null });
  await assert.rejects(host.view.load(PAGE),
    /the view of hwp has no start values: the host provides window\.sokSurface/);
});

test("the view page refuses a project in its start values that has no id", async (t) => {
  const start = { surface: SURFACE, params: {}, origin: { directory: "/project" }, project: { root: "/project" }, diagnostics: null };
  const host = await open(t, { start });
  await assert.rejects(host.view.load(PAGE), /project is \{"root":"\/project"\}/);
});

test("the view page mounts when its tab has no source origin directory", async (t) => {
  const host = await setup(t, { origin: { directory: null } });
  assert.deepEqual(await host.status(), { path: "docs/plan.hwp", format: "hwp", version: sha(bytes("첫 문단")),
    modified: false, selection: false, pages: 1, disk: "same", phase: "ready" });
});

test("the view page mounts the surface over the view channel and registers every declared name", async (t) => {
  const host = await setup(t);
  assert.deepEqual(callsOf(host, "runtime.command.register").map((params) => params.name).toSorted(),
    manifest.exposes.commands.map((entry) => entry.name).toSorted());
  const kinds = nativeCalls(host).filter(([name]) => name === "registered").map(([, payload]) => payload.kind);
  assert.deepEqual([...new Set(kinds)].toSorted(), ["command", "element", "status"]);
  // The status names are the plugin status and the core statuses that the start values declare (core.surface.document and core.surface.input).
  assert.deepEqual(nativeCalls(host).filter(([, payload]) => payload.kind === "status").map(([, payload]) => payload.name),
    ["hwp.document", "core.surface.document", "core.surface.input"]);
});

test("a status watch of the view sends each changed value as a changed call with its version until the unwatch", async (t) => {
  const host = await setup(t);
  const changes = () => nativeCalls(host).filter(([name]) => name === "changed").map(([, payload]) => payload);
  assert.deepEqual(await host.expose("status.watch", { name: "hwp.document" }), { result: null });
  await events(host);
  assert.equal(changes().length, 1);
  assert.deepEqual(changes(), [{ name: "hwp.document", value: await host.status(), version: 1 }]);
  await host.studio.edit("!");
  assert.equal(changes().length, 2);
  assert.deepEqual(changes().at(-1), { name: "hwp.document", value: await host.status(), version: 2 });
  assert.equal(changes().at(-1).value.modified, true);
  assert.deepEqual(await host.expose("status.unwatch", { name: "hwp.document" }), { result: null });
  await host.studio.post({ type: "soksak-hwp", event: "modified", modified: false });
  assert.equal(changes().length, 2, "no change is sent after the unwatch");
});

test("the view attaches the document region studio, places it, and loads the editor page in it", async (t) => {
  const host = await setup(t);
  assert.deepEqual(callsOf(host, "document.attach")[0], { name: "studio" });
  assert.ok(host.view.calls.some((call) => call.command === "composition.place" && call.params.regions.length === 1
    && call.params.regions[0].name === "studio"), "the view places the region in one snapshot");
  assert.equal(host.studio.loaded, ADDRESS);
  assert.deepEqual(host.studio.requests, ["ready", "loadFile"]);
  assert.deepEqual(host.studio.document, bytes("첫 문단"));
  assert.deepEqual(await host.status(), { path: "docs/plan.hwp", format: "hwp", version: sha(bytes("첫 문단")),
    modified: false, selection: false, pages: 1, disk: "same", phase: "ready" });
  assert.deepEqual(callsOf(host, "tab.title"), ["plan.hwp"]);
});

test("the start waits until the editor page listens, so its first request is not lost", async (t) => {
  const host = await setup(t);
  assert.deepEqual(host.studio.dropped, []);
  assert.equal(new URL(host.studio.loaded).searchParams.has("diagnostics"), false,
    "normal editor startup must not enable studio diagnostics");
  assert.deepEqual(host.studio.requests.slice(0, 2), ["ready", "loadFile"]);
  assert.equal((await host.status()).phase, "ready");
});

test("the wait for listening ends when the WebContent process of the editor page ends, and the start fails with that end", async (t) => {
  const host = await startPage(t, { listens: false });
  assert.ok(starting(await events(host)), "the start waits for listening in the phase starting");
  assert.deepEqual(timersStarted(host.view), [], "the wait for listening starts no timer");
  await host.studio.end();
  const report = await reported(host, /mount failed: /);
  assert.equal(report.fields.text, "view hwp: mount failed: the editor page did not post listening: the web content process of the editor page ended");
  assert.equal(report.level, "error");
});

test("the wait for listening ends when the region starts another navigation", async (t) => {
  const host = await startPage(t, { listens: false });
  assert.ok(starting(await events(host)), "the start waits for listening in the phase starting");
  assert.deepEqual(timersStarted(host.view), [], "the wait for listening starts no timer");
  await host.studio.navigate("https://example.test/");
  const report = await reported(host, /mount failed: /);
  assert.equal(report.fields.text, "view hwp: mount failed: the editor page did not post listening: the document region started another navigation");
});

test("an embed request that the editor does not answer stays open and ends with the WebContent process of the editor page", async (t) => {
  const host = await setup(t, { silent: ["exportHwp"] });
  await host.studio.edit("!");
  const saving = assert.rejects(host.run("hwp.save"),
    /^Error: rhwp-studio did not answer exportHwp-3: the web content process of the editor page ended in phase ready$/);
  await events(host);
  assert.ok(host.studio.requests.includes("exportHwp"));
  assert.deepEqual(timersStarted(host.view), [], "an embed request starts no timer");
  await host.studio.end();
  await saving;
  assert.deepEqual((await events(host)).filter((entry) => entry.event === "plugin.hwp.request").at(-1).fields.error,
    "Error: rhwp-studio did not answer exportHwp-3: the web content process of the editor page ended in phase ready");
});

test("an embed request that the editor does not answer ends when the region starts another navigation", async (t) => {
  const host = await setup(t, { silent: ["exportHwp"] });
  await host.studio.edit("!");
  const saving = assert.rejects(host.run("hwp.save"), /rhwp-studio did not answer exportHwp-3: the document region started another navigation in phase ready/);
  await events(host);
  assert.ok(host.studio.requests.includes("exportHwp"));
  assert.deepEqual(timersStarted(host.view), [], "an embed request starts no timer");
  await host.studio.navigate("https://example.test/");
  await saving;
});

test("an embed request after the end of the editor page fails with it at once, and the end is recorded and shown as the tab error", async (t) => {
  const host = await setup(t);
  assert.deepEqual(timersStarted(host.view), [], "the start starts no timer");
  // The page has run its state listeners when the view has delivered the state of the end.
  await host.studio.end();
  await assert.rejects(host.run("hwp.request", { method: "ready" }),
    /^Error: rhwp-studio did not answer ready-3: the web content process of the editor page ended in phase ready$/);
  assert.deepEqual(host.studio.dropped, [], "no request reaches an ended page");
  const ended = await logged(host, "studio.ended");
  assert.equal(ended.level, "error");
  assert.deepEqual(ended.fields, { surface: "hwp-1", path: "docs/plan.hwp", reason: "the web content process of the editor page ended" });
  assert.equal(callsOf(host, "tab.error").length, 1);
  assert.equal(callsOf(host, "tab.error")[0], "편집기가 끝났습니다 · the web content process of the editor page ended");
});

test("an edit marks the tab modified, and a save exports the format, writes it and tells the editor", async (t) => {
  const files = new Map([["a.hwpx", bytes("x")]]);
  const host = await setup(t, { params: { path: "a.hwpx" }, files });
  await host.studio.edit("y");
  assert.equal((await host.status()).modified, true);
  assert.deepEqual(callsOf(host, "tab.modified"), [true]);
  const { result } = await host.expose("command.run", { name: "hwp.save", params: {} });
  assert.equal(result.version, sha(bytes("xy")));
  assert.deepEqual(files.get("a.hwpx"), bytes("xy"));
  assert.deepEqual(host.studio.requests.slice(2), ["exportHwpx", "notifySaved"]);
  assert.deepEqual(callsOf(host, "tab.modified"), [true, false]);
  assert.deepEqual(callsOf(host, "tab.error"), [null]);
});

test("Command-S in the editor page saves the document", async (t) => {
  const host = await setup(t);
  await host.studio.edit("!");
  await host.studio.post({ type: "soksak-hwp", event: "save" });
  await logged(host, "save");
  assert.deepEqual(host.files.get("docs/plan.hwp"), bytes("첫 문단!"));
});

test("a save over a file that changed on disk fails as the tab error and keeps the edits", async (t) => {
  const host = await setup(t);
  await host.studio.edit("!");
  host.files.set("docs/plan.hwp", bytes("다른 글"));
  await assert.rejects(host.run("hwp.save"), /changed on disk: docs\/plan.hwp/);
  assert.equal(callsOf(host, "tab.error").at(-1), "저장하지 못했습니다 · changed on disk: docs/plan.hwp");
  assert.equal((await host.status()).modified, true);
});

test("a change on disk reloads an unmodified document and shows the banner over a modified one", async (t) => {
  const host = await setup(t);
  host.files.set("docs/plan.hwp", bytes("새 글"));
  await host.sidecar.emit({ changed: "docs/plan.hwp" });
  await nth(host, "render", 2);
  assert.deepEqual(host.studio.document, bytes("새 글"));
  await host.studio.edit("!");
  host.files.set("docs/plan.hwp", bytes("또 다른 글"));
  await host.sidecar.emit({ changed: "docs/plan.hwp" });
  await nth(host, "disk.changed", 2);
  assert.equal((await host.status()).disk, "changed");
  assert.equal(host.view.window.document.body.lastElementChild.shadowRoot.querySelector("#banner").hidden, false);
  assert.deepEqual(host.studio.document, bytes("새 글!"));
});

test("a selection message of the editor page sets the selection of hwp.document", async (t) => {
  const host = await setup(t);
  await host.studio.post({ type: "soksak-hwp", event: "selection", selection: true });
  assert.equal((await host.status()).selection, true);
});

test("hwp.document reports each step of the start as the phase events and ends ready", async (t) => {
  const host = await setup(t);
  assert.deepEqual([...new Set((await events(host)).filter((entry) => entry.event === "plugin.hwp.phase").map((entry) => entry.fields.phase))],
    ["starting", "reading", "opening", "ready"]);
  assert.equal((await host.status()).phase, "ready");
});

test("an error message of the editor page is shown as the tab error", async (t) => {
  const host = await setup(t);
  await host.studio.post({ type: "soksak-hwp", event: "error", message: "rhwp-studio exposes no window.rhwpStudio.automation" });
  assert.equal(callsOf(host, "tab.error").length, 1);
  assert.equal(callsOf(host, "tab.error").at(-1), "편집기 · rhwp-studio exposes no window.rhwpStudio.automation");
});

test("every interactive element is bound to a declared command and has an element name", async (t) => {
  const host = await setup(t);
  const root = host.view.window.document.body.lastElementChild.shadowRoot;
  assert.equal(Object.hasOwn(manifest.exposes, "dom"), false, "plugin.json declares no exposes.dom");
  const elementNames = new Set(manifest.exposes.element.map((entry) => entry.name));
  for (const element of root.querySelectorAll("[data-expose]")) {
    assert.ok(elementNames.has(element.dataset.expose), `the element name ${element.dataset.expose} is not declared`);
  }
  for (const element of root.querySelectorAll("[data-command]")) {
    assert.ok(declared("commands", element.dataset.command), `the command ${element.dataset.command} is not declared`);
  }
  assert.ok(root.querySelectorAll("[data-expose]").length >= manifest.exposes.element.length);
});

test("the start stores the open, each step, the read, the render and the watch", async (t) => {
  const host = await setup(t);
  const records = await events(host);
  assert.deepEqual(named(records, "open").map((entry) => entry.fields), [{ surface: "hwp-1", path: "docs/plan.hwp", format: "hwp" }]);
  assert.deepEqual(named(records, "phase").map((entry) => entry.fields.phase), ["starting", "reading", "opening", "ready"]);
  const [read] = named(records, "read");
  assert.equal(read.level, "debug");
  assert.deepEqual({ ...read.fields, micros: 0 }, { surface: "hwp-1", path: "docs/plan.hwp", reason: "start", size: bytes("첫 문단").length, micros: 0, ok: true });
  assert.ok(isMicros(read.fields.micros));
  const [render] = named(records, "render");
  assert.deepEqual({ ...render.fields, micros: 0 }, { surface: "hwp-1", path: "docs/plan.hwp", pages: 1, micros: 0, ok: true });
  const [watch] = named(records, "watch");
  assert.equal(watch.level, "info");
  assert.equal(watch.fields.ok, true);
  assert.ok(isMicros(watch.fields.micros));
});

test("a save stores its format, size and result, and a failed save stores the error as <code>: <text>", async (t) => {
  const host = await setup(t, { params: { path: "a.hwpx" }, files: new Map([["a.hwpx", bytes("x")]]) });
  await host.studio.edit("y");
  await host.run("hwp.save");
  const [saved] = named(await events(host), "save");
  assert.equal(saved.level, "info");
  assert.deepEqual({ ...saved.fields, micros: 0 }, { surface: "hwp-1", path: "a.hwpx", format: "hwpx", overwrite: false, size: 2, micros: 0, ok: true });
  host.files.set("a.hwpx", bytes("other"));
  await assert.rejects(host.run("hwp.save"), /changed on disk/);
  const failed = named(await events(host), "save").at(-1);
  assert.equal(failed.level, "warn");
  assert.equal(failed.fields.ok, false);
  assert.equal(failed.fields.error, "Error: changed on disk: a.hwpx");
  assert.equal("size" in failed.fields, false);
});

test("a read that fails stores the failure of the read", async (t) => {
  const host = await setup(t);
  host.files.delete("docs/plan.hwp");
  await assert.rejects(host.run("hwp.reload"));
  const failed = named(await events(host), "read").at(-1);
  assert.equal(failed.level, "warn");
  assert.equal(failed.fields.reason, "reload");
  assert.equal(failed.fields.ok, false);
  assert.match(failed.fields.error, /^Error: /);
});

test("a change on disk stores the action that it causes", async (t) => {
  const host = await setup(t);
  host.files.set("docs/plan.hwp", bytes("new"));
  await host.sidecar.emit({ changed: "docs/plan.hwp" });
  await nth(host, "render", 2);
  await host.studio.edit("!");
  host.files.set("docs/plan.hwp", bytes("newer"));
  await host.sidecar.emit({ changed: "docs/plan.hwp" });
  await nth(host, "disk.changed", 2);
  const records = await events(host);
  assert.deepEqual(named(records, "disk.changed").map((entry) => entry.fields),
    [{ surface: "hwp-1", path: "docs/plan.hwp", modified: false, action: "reload" }, { surface: "hwp-1", path: "docs/plan.hwp", modified: true, action: "banner" }]);
  assert.deepEqual(named(records, "read").slice(1).map((entry) => entry.fields.reason), ["change", "change"]);
});

test("a watch failure of the sidecar is stored as an error", async (t) => {
  const host = await setup(t);
  await host.sidecar.emit({ error: "watch stopped" });
  await logged(host, "watch.failed");
  assert.deepEqual(named(await events(host), "watch.failed").map((entry) => [entry.level, entry.fields]),
    [["error", { surface: "hwp-1", path: "docs/plan.hwp", error: "watch stopped" }]]);
});

test("the messages of the editor page are stored, and its error as an error", async (t) => {
  const host = await setup(t);
  await host.studio.post({ type: "soksak-hwp", event: "selection", selection: true });
  await host.studio.post({ type: "soksak-hwp", event: "modified", modified: true });
  await host.studio.post({ type: "soksak-hwp", event: "error", message: "no automation" });
  await logged(host, "studio.error");
  const records = await events(host);
  assert.deepEqual(named(records, "studio.message").map((entry) => entry.fields),
    [{ surface: "hwp-1", path: "docs/plan.hwp", event: "listening" }, { surface: "hwp-1", path: "docs/plan.hwp", event: "selection", selection: true },
      { surface: "hwp-1", path: "docs/plan.hwp", event: "modified", modified: true }]);
  assert.deepEqual(named(records, "studio.error").map((entry) => [entry.level, entry.fields]),
    [["error", { surface: "hwp-1", path: "docs/plan.hwp", message: "no automation" }]]);
});

test("a save that Command-S starts and that fails is stored and not dropped", async (t) => {
  const host = await setup(t);
  await host.studio.edit("!");
  host.files.set("docs/plan.hwp", bytes("other"));
  await host.studio.post({ type: "soksak-hwp", event: "save" });
  await logged(host, "studio.save_failed");
  const records = await events(host);
  assert.deepEqual(named(records, "studio.message").at(-1).fields, { surface: "hwp-1", path: "docs/plan.hwp", event: "save" });
  assert.deepEqual(named(records, "studio.save_failed").map((entry) => [entry.level, entry.fields]),
    [["warn", { surface: "hwp-1", path: "docs/plan.hwp", error: "Error: changed on disk: docs/plan.hwp" }]]);
});

test("a command and an embed request store their result with the time", async (t) => {
  const host = await setup(t);
  await host.run("hwp.request", { method: "ready" });
  await assert.rejects(host.run("hwp.request", { method: "nothing" }), /unknown method nothing/);
  const records = await events(host);
  const failed = named(records, "request").at(-1);
  assert.equal(failed.level, "warn");
  assert.deepEqual({ ...failed.fields, micros: 0 }, { surface: "hwp-1", path: "docs/plan.hwp", method: "nothing", micros: 0, ok: false, error: "Error: rhwp-studio nothing-4: unknown method nothing" });
  const commands = named(records, "command");
  assert.deepEqual(commands.map((entry) => [entry.level, entry.fields.name, entry.fields.ok]),
    [["debug", "hwp.request", true], ["warn", "hwp.request", false]]);
  assert.ok(commands.every((entry) => isMicros(entry.fields.micros)));
  assert.match(commands[1].fields.error, /^Error: rhwp-studio nothing-/);
});

test("every stored event is declared in the catalog with its level and fields", async (t) => {
  const host = await setup(t);
  await host.studio.edit("y");
  await host.studio.post({ type: "soksak-hwp", event: "error", message: "x" });
  await logged(host, "studio.error");
  await host.run("hwp.save");
  host.files.set("docs/plan.hwp", bytes("z"));
  await assert.rejects(host.run("hwp.save"));
  await host.sidecar.emit({ error: "stopped" });
  await logged(host, "watch.failed");
  const logs = (await events(host)).filter((entry) => entry.event.startsWith("plugin.hwp.") && entry.event !== "plugin.hwp.report");
  assert.ok(logs.length > 10);
  for (const { level, event, fields } of logs) {
    const entry = catalog.events[event];
    assert.ok(entry, `${event} is not declared`);
    assert.ok([entry.level].flat().includes(level), `${event} stored at ${level}`);
    const declaredFields = Object.keys(entry.fields.properties);
    for (const name of Object.keys(fields)) assert.ok(declaredFields.includes(name), `${event} has the undeclared field ${name}`);
    for (const name of entry.fields.required) assert.ok(name in fields, `${event} lacks ${name}`);
  }
});

test("a tab without a path opens a blank document of the editor and reads no file", async (t) => {
  const host = await setup(t, { params: {}, files: new Map() });
  assert.deepEqual(host.studio.requests, ["ready", "automation.execute", "pageCount"]);
  assert.deepEqual(await host.status(), { path: null, format: "hwp", version: null, modified: false, selection: false, pages: 1,
    disk: "same", phase: "ready" });
  assert.deepEqual(callsOf(host, "tab.title"), ["새 문서"]);
});

test("the first save of a blank document asks for the file, exports its format, writes it and watches it", async (t) => {
  const files = new Map();
  const host = await setup(t, { params: {}, files, place: () => ({ path: "docs/new.hwpx" }) });
  await host.studio.edit("본문");
  const { result } = await host.expose("command.run", { name: "hwp.save", params: {} });
  assert.deepEqual(commandsOf(host), [["core.file.place", { name: "새 문서.hwp" }]]);
  assert.deepEqual(files.get("docs/new.hwpx"), bytes("본문"));
  assert.equal(result.version, sha(bytes("본문")));
  assert.deepEqual(host.studio.requests.slice(3), ["exportHwpx", "notifySaved"]);
  assert.deepEqual(host.studio.savedAs, ["new.hwpx"]);
  const document = await host.status();
  assert.equal(document.path, "docs/new.hwpx");
  assert.equal(document.format, "hwpx");
  assert.equal(document.modified, false);
  assert.deepEqual(callsOf(host, "tab.title"), ["새 문서", "new.hwpx"]);
  // The next save writes the named file in place.
  await host.studio.edit("!");
  await host.run("hwp.save");
  assert.deepEqual(files.get("docs/new.hwpx"), bytes("본문!"));
  assert.equal(commandsOf(host).length, 1, "a named document does not ask for its place again");
});

test("a cancelled place keeps the blank document modified and writes nothing", async (t) => {
  const host = await setup(t, { params: {}, files: new Map(), place: () => ({ path: null }) });
  await host.studio.edit("x");
  const { result } = await host.expose("command.run", { name: "hwp.save", params: {} });
  assert.deepEqual(result, { version: null });
  assert.equal((await host.status()).path, null);
  assert.equal((await host.status()).modified, true);
  assert.equal(host.files.size, 0);
});

test("a place that is not an hwp or hwpx file is refused as the tab error", async (t) => {
  const host = await setup(t, { params: {}, files: new Map(), place: () => ({ path: "notes.txt" }) });
  await host.studio.edit("x");
  await assert.rejects(host.run("hwp.save"), /opens \.hwp and \.hwpx files, not notes\.txt/);
  assert.equal((await host.status()).path, null);
  assert.match(callsOf(host, "tab.error").at(-1), /not notes\.txt/);
});

test("every event of a blank document and its first save is declared in the catalog with its level and fields", async (t) => {
  const host = await setup(t, { params: {}, files: new Map(), place: () => ({ path: "new.hwp" }) });
  await host.studio.edit("y");
  await host.run("hwp.save");
  const records = await events(host);
  for (const { level, event, fields } of records.filter((entry) => entry.event.startsWith("plugin.hwp.") && entry.event !== "plugin.hwp.report")) {
    const entry = catalog.events[event];
    assert.ok(entry, `${event} is not declared`);
    assert.ok([entry.level].flat().includes(level), `${event} stored at ${level}`);
    const declaredFields = Object.keys(entry.fields.properties);
    for (const name of Object.keys(fields)) assert.ok(declaredFields.includes(name), `${event} has the undeclared field ${name}`);
    for (const name of entry.fields.required) assert.ok(name in fields, `${event} lacks ${name}`);
    for (const [name, value] of Object.entries(fields)) {
      const types = [entry.fields.properties[name].type].flat();
      assert.ok(types.includes(value === null ? "null" : typeof value), `${event}.${name} is ${value === null ? "null" : typeof value}, declared ${types.join("|")}`);
    }
  }
  assert.ok(records.some((entry) => entry.event === "plugin.hwp.new") && records.some((entry) => entry.event === "plugin.hwp.place"));
});

test("the surface writes its file as the tab state and a restored tab opens the stored file", async (t) => {
  const opened = await setup(t);
  assert.deepEqual(callsOf(opened, "tab.state.write"), [{ path: "docs/plan.hwp" }]);
  const files = new Map([["docs/plan.hwp", bytes("첫 문단")], ["docs/saved.hwp", bytes("저장한 문단")]]);
  const restored = await setup(t, { params: {}, stored: { path: "docs/saved.hwp" }, files });
  assert.equal((await restored.status()).path, "docs/saved.hwp");
  assert.deepEqual(restored.studio.document, bytes("저장한 문단"));
  assert.deepEqual(callsOf(restored, "tab.state.write"), [], "a state that keeps the stored file writes nothing");
});

// The page reads region.history and loads no editor page when the attach restored a session history
// (core docs/spec/plugins.md#memory-saver). The region handle reports history as a boolean after its attach
// (core docs/spec/surface-composition.md); the attach reply carries it and the region restores the entry by itself.
test("a region that restored the session history loads no editor page", async (t) => {
  const host = await startPage(t, { stored: { path: "docs/plan.hwp" }, history: true });
  await host.view.settled();
  await host.studio.restore();
  await host.loading;
  assert.equal(host.studio.loaded, null);
  assert.equal((await host.status()).phase, "ready");
});

test("a tab state of another form is refused", async (t) => {
  const host = await setup(t, { stored: { path: 3 } });
  await reported(host, /the tab state of hwp tab hwp-1 is not \{path\}: \{"path":3\}/);
});

test("an export reply that is not an array of byte values fails the save and keeps the file", async (t) => {
  const host = await setup(t, { params: { path: "docs/plan.hwp" }, replies: { exportHwp: () => "not bytes" } });
  await host.studio.edit("!");
  await assert.rejects(host.run("hwp.save"), /exportHwp did not reply with a non-empty array of byte values/);
  assert.deepEqual(host.files.get("docs/plan.hwp"), bytes("첫 문단"));
  assert.match(callsOf(host, "tab.error").at(-1), /^저장하지 못했습니다 · exportHwp did not reply/);
});

test("an export reply with no bytes fails the save instead of writing an empty file", async (t) => {
  const host = await setup(t, { params: { path: "docs/plan.hwp" }, replies: { exportHwp: () => [] } });
  await host.studio.edit("!");
  await assert.rejects(host.run("hwp.save"), /non-empty array/);
  assert.deepEqual(host.files.get("docs/plan.hwp"), bytes("첫 문단"));
});

test("a save whose notice to the editor fails is saved, and the tab shows that the notice failed", async (t) => {
  const host = await setup(t, { params: { path: "docs/plan.hwp" }, replies: { notifySaved: () => { throw new Error("editor gone"); } } });
  await host.studio.edit("!");
  const { result } = await host.expose("command.run", { name: "hwp.save", params: {} });
  assert.equal(result.version, sha(bytes("첫 문단!")));
  assert.deepEqual(host.files.get("docs/plan.hwp"), bytes("첫 문단!"));
  assert.equal((await host.status()).modified, false);
  assert.equal(callsOf(host, "tab.error").at(-1), "저장했지만 편집기에 알리지 못했습니다 · editor gone");
  assert.equal(named(await events(host), "notify").length, 1);
});

test("an error message of the editor page without text shows the whole event", async (t) => {
  const host = await setup(t);
  await host.studio.post({ type: "soksak-hwp", event: "error" });
  assert.equal(callsOf(host, "tab.error").at(-1), '편집기 · {"type":"soksak-hwp","event":"error"}');
});

test("a refused view event batch uses the bridge error route", async (t) => {
  // Every batch of the page log is refused by the host, so each refused batch reaches the error route of the bridge.
  const host = await setup(t, { refuseLog: "log route refused" });
  const before = callsOf(host, "runtime.error").length;
  host.view.window.dispatchEvent(new host.view.window.ErrorEvent("error", { error: new Error("failed"), message: "failed" }));
  await events(host);
  const lines = callsOf(host, "runtime.error").slice(before);
  assert.ok(lines.some((line) => line.where === "log batch" && line.text.includes("log route refused")),
    "the bridge did not report the refused batch through runtime.error");
});

test("the open and the save of a file carry the cids of their operations on the sidecar sends and the records", async (t) => {
  const host = await setup(t);
  const records = await events(host);
  const operations = records.filter((entry) => entry.event === "plugin.hwp.operation");
  const opened = operations.find((entry) => entry.fields.kind === "open");
  assert.ok(opened, "the open starts an operation");
  assert.match(opened.cids[0], new RegExp(`^p${host.view.window.sokView.page}\\.\\d+$`), "the operation identifier has the form p<page>.<n>");
  const reads = host.view.observed.sidecar.filter((send) => send.body.operation === "readBytes");
  assert.deepEqual(reads.map((send) => send.cids), [opened.cids], "the read of the open carries the cids of the open");
  assert.ok(named(records, "read").every((entry) => entry.cids === undefined || entry.cids.length === 1), "the records of the read keep the cids");
  const readRecord = named(records, "read").find((entry) => entry.fields.reason === "start");
  assert.deepEqual(readRecord.cids, opened.cids, "the read record carries the cids of the open");

  await host.studio.edit("!");
  await host.expose("command.run", { name: "hwp.save", params: {} });
  const saved = (await events(host)).filter((entry) => entry.event === "plugin.hwp.operation" && entry.fields.kind === "save");
  assert.equal(saved.length, 1, "the save starts one operation");
  const writes = host.view.observed.sidecar.filter((send) => send.body.operation === "writeBytes");
  assert.deepEqual(writes.map((send) => send.cids), [saved[0].cids], "the write of the save carries the cids of the save");
  assert.deepEqual(named(await events(host), "save").map((entry) => entry.cids), [saved[0].cids], "the save record carries the cids of the save");
});
