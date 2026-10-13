import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { window } from "./dom.mjs";
import { createBinder, validateManifest } from "@soksak/plugin-api";
import { fromBase64, mount, toBase64 } from "../ui/hwp.js";

const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
const declared = (kind, name) => manifest.exposes[kind].some((entry) => entry.name === name);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = (text) => new TextEncoder().encode(text);
const LEVELS = ["error", "warn", "info", "debug", "trace"];
const catalog = JSON.parse(readFileSync(new URL("../events.json", import.meta.url), "utf8"));
const ADDRESS = "sok://hwp/ui/studio/index.html?chrome=embed";

/** A files sidecar of one surface over an in-memory file system with readBytes, writeBytes and watch. */
function fakeFiles(files) {
  const listeners = new Set();
  const reply = (body) => queueMicrotask(() => { for (const fn of listeners) fn(body); });
  return {
    emit: (body) => reply(body),
    on: async (surface, fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    async send(surface, body) {
      if (body.operation === "watch") return reply({ id: body.id });
      if (body.operation === "readBytes") return reply({ id: body.id, data: toBase64(files.get(body.path)), version: sha(files.get(body.path)) });
      if (body.operation === "writeBytes") {
        if (sha(files.get(body.path)) !== body.expect) return reply({ id: body.id, error: `changed on disk: ${body.path}` });
        files.set(body.path, fromBase64(body.data));
        return reply({ id: body.id, version: sha(files.get(body.path)) });
      }
      throw new Error(`unexpected operation ${body.operation}`);
    },
  };
}

/**
 * A document region that shows a fake rhwp-studio: it passes every posted message back, as the region passes each
 * message that the document posts to its own window, and answers the embed requests ready, loadFile, exportHwp,
 * exportHwpx and notifySaved. The page installs its message listener after the load reports the page, in a later task,
 * and then posts the listening message of ui/studio-host.js; a request posted before that is lost, as a message posted
 * to a window without a listener is, and is kept in dropped. The document is its bytes; edit(text) appends text and
 * posts the modified message of ui/studio-host.js.
 */
function fakeStudio({ listens = true, silent = [] } = {}) {
  const messages = new Set();
  const states = new Set();
  const studio = { document: null, requests: [], dropped: [], loaded: null };
  let listening = false;
  const deliver = (message) => queueMicrotask(() => { for (const fn of messages) fn(message); });
  const answers = {
    ready: () => true,
    loadFile: ({ data }) => { studio.document = Uint8Array.from(data); return { pageCount: 1 }; },
    exportHwp: () => Array.from(studio.document),
    exportHwpx: () => Array.from(studio.document),
    notifySaved: () => ({ ok: true, wasDirty: true }),
  };
  studio.edit = (text) => {
    studio.document = new Uint8Array([...studio.document, ...bytes(text)]);
    deliver({ type: "soksak-hwp", event: "modified", modified: true });
  };
  studio.post = deliver;
  studio.region = {
    async load(url) {
      studio.loaded = url;
      queueMicrotask(() => { for (const fn of states) fn({ url, loading: false, error: null }); });
      if (listens) setTimeout(() => {
        listening = true;
        deliver({ type: "soksak-hwp", event: "listening" });
      }, 0);
    },
    onState(fn) { states.add(fn); return () => states.delete(fn); },
    onMessage(fn) { messages.add(fn); return () => messages.delete(fn); },
    async post(message) {
      assert.doesNotThrow(() => JSON.stringify(message));
      deliver(message);
      if (!listening) return void studio.dropped.push(message.method);
      studio.requests.push(message.method);
      if (silent.includes(message.method)) return;
      const answer = answers[message.method];
      if (!answer) return deliver({ type: "rhwp-response", id: message.id, error: `unknown method ${message.method}` });
      deliver({ type: "rhwp-response", id: message.id, result: answer(message.params) });
    },
  };
  return studio;
}

async function setup(t, { path = "docs/plan.hwp", files = new Map([["docs/plan.hwp", bytes("첫 문단")]]), onStatus = () => {}, listens = true, silent = [] } = {}) {
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = host.attachShadow({ mode: "open" });
  const commands = new Map();
  const statuses = new Map();
  const reports = { modified: [], error: [], title: [] };
  const studio = fakeStudio({ listens, silent });
  const sidecar = fakeFiles(files);
  const logs = [];
  const log = Object.fromEntries(LEVELS.map((level) => [level, (event, fields) => logs.push({ level, event: `plugin.hwp.${event}`, fields: typeof fields === "function" ? fields() : fields })]));
  const binder = createBinder((name, params) => commands.get(name)(params), {
    check(name) { assert.ok(declared("commands", name), `undeclared command ${name}`); },
  });
  const controller = await mount(root, {
    surfaceId: "hwp-1",
    pluginId: "hwp",
    project: { root: "/project" },
    tab: { params: { path }, title: (text) => reports.title.push(text), footer() {}, directory() {}, notify() {},
      modified: (value) => reports.modified.push(value), error: (text) => reports.error.push(text) },
    runtime: { sidecar: () => sidecar, log },
    composition: {
      async create({ regions, overlays }) {
        assert.deepEqual(Object.keys(regions), ["studio"]);
        assert.deepEqual(overlays, {});
        return { region: (name) => { assert.equal(name, "studio"); return studio.region; }, async dispose() {} };
      },
    },
    exposure: {
      status(name, read, subscribe) {
        assert.ok(declared("status", name), `undeclared status ${name}`);
        statuses.set(name, read);
        subscribe(onStatus);
      },
      command(name, run) { assert.ok(declared("commands", name), `undeclared command ${name}`); commands.set(name, run); },
      dom(name) { assert.ok(declared("dom", name), `undeclared dom ${name}`); },
      bind: binder.bind, delegate: binder.delegate, dispose: binder.dispose,
    },
    status: { report(phase) { assert.equal(phase, "ready"); } },
  });
  t.after(async () => { await controller.dispose(); host.remove(); });
  /** Lets the queued replies of the fakes run. */
  const settle = async () => { for (let turn = 0; turn < 8; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
  return { root, studio, sidecar, settle, logs, controller, run: (name, params = {}) => commands.get(name)(params),
    status: (name) => statuses.get(name)(), reports, files, binder };
}

test("plugin.json is a valid manifest that opens hwp and hwpx files in a document region", () => {
  assert.equal(validateManifest(manifest), manifest);
  assert.deepEqual(manifest.surface.opens, { extensions: ["hwp", "hwpx"] });
  assert.deepEqual(manifest.surface.composition.regions, [{ name: "studio", kind: "document", input: "native" }]);
});

test("the surface loads the editor page of the plugin and opens the file in it", async (t) => {
  const { studio, status, reports } = await setup(t);
  assert.equal(studio.loaded, ADDRESS);
  assert.deepEqual(studio.requests, ["ready", "loadFile"]);
  assert.deepEqual(studio.document, bytes("첫 문단"));
  assert.deepEqual(status("hwp.document"), { path: "docs/plan.hwp", format: "hwp", version: sha(bytes("첫 문단")),
    modified: false, selection: false, pages: 1, disk: "same", phase: "ready" });
  assert.deepEqual(reports.title, ["plan.hwp"]);
});

test("the start waits until the editor page listens, so its first request is not lost", { timeout: 5000 }, async (t) => {
  const { studio, status } = await setup(t);
  assert.deepEqual(studio.dropped, []);
  assert.deepEqual(studio.requests.slice(0, 2), ["ready", "loadFile"]);
  assert.equal(status("hwp.document").phase, "ready");
});

test("a loaded editor page that never posts listening fails the start with an error that names the step", { timeout: 20000 }, async (t) => {
  await assert.rejects(setup(t, { listens: false }), /the editor page loaded and did not post listening within 10 s/);
});

test("an embed request that the editor never answers fails with its id and the phase", { timeout: 5000 }, async (t) => {
  const { studio, run } = await setup(t, { silent: ["exportHwp"] });
  studio.edit("!");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saving = assert.rejects(run("hwp.save"), /rhwp-studio did not answer exportHwp-3 within 60 s in phase ready/);
  await Promise.resolve();
  t.mock.timers.tick(60000);
  await saving;
});

test("an edit marks the tab modified, and a save exports the format, writes it and tells the editor", async (t) => {
  const { studio, run, status, reports, files, settle } = await setup(t, { path: "a.hwpx", files: new Map([["a.hwpx", bytes("x")]]) });
  studio.edit("y");
  await settle();
  assert.equal(status("hwp.document").modified, true);
  assert.deepEqual(reports.modified, [true]);
  const { version } = await run("hwp.save");
  assert.deepEqual(files.get("a.hwpx"), bytes("xy"));
  assert.equal(version, sha(bytes("xy")));
  assert.deepEqual(studio.requests.slice(2), ["exportHwpx", "notifySaved"]);
  assert.deepEqual(reports.modified, [true, false]);
  assert.deepEqual(reports.error, [null]);
});

test("Command-S in the editor page saves the document", async (t) => {
  const { studio, files, settle } = await setup(t);
  studio.edit("!");
  studio.post({ type: "soksak-hwp", event: "save" });
  await settle();
  assert.deepEqual(files.get("docs/plan.hwp"), bytes("첫 문단!"));
});

test("a save over a file that changed on disk fails as the tab error and keeps the edits", async (t) => {
  const { studio, run, status, reports, files, settle } = await setup(t);
  studio.edit("!");
  await settle();
  files.set("docs/plan.hwp", bytes("다른 글"));
  await assert.rejects(run("hwp.save"), /changed on disk: docs\/plan.hwp/);
  assert.equal(reports.error.at(-1), "저장하지 못했습니다 · changed on disk: docs/plan.hwp");
  assert.equal(status("hwp.document").modified, true);
});

test("a change on disk reloads an unmodified document and shows the banner over a modified one", async (t) => {
  const { root, studio, sidecar, status, files, settle } = await setup(t);
  files.set("docs/plan.hwp", bytes("새 글"));
  sidecar.emit({ changed: "docs/plan.hwp" });
  await settle();
  assert.deepEqual(studio.document, bytes("새 글"));
  studio.edit("!");
  await settle();
  files.set("docs/plan.hwp", bytes("또 다른 글"));
  sidecar.emit({ changed: "docs/plan.hwp" });
  await settle();
  assert.equal(status("hwp.document").disk, "changed");
  assert.equal(root.querySelector("#banner").hidden, false);
  assert.deepEqual(studio.document, bytes("새 글!"));
});

test("a selection message of the editor page sets the selection of hwp.document", async (t) => {
  const { studio, status, settle } = await setup(t);
  studio.post({ type: "soksak-hwp", event: "selection", selection: true });
  await settle();
  assert.equal(status("hwp.document").selection, true);
});

test("hwp.document reports each step of the start before the surface is ready", async (t) => {
  const phases = [];
  const { status } = await setup(t, { onStatus: (value) => phases.push(value.phase) });
  assert.deepEqual([...new Set(phases)], ["loading", "starting", "reading", "opening", "ready"]);
  assert.equal(status("hwp.document").phase, "ready");
});

test("an error message of the editor page is shown as the tab error", async (t) => {
  const { studio, reports, settle } = await setup(t);
  studio.post({ type: "soksak-hwp", event: "error", message: "rhwp-studio exposes no window.rhwpStudio.automation" });
  await settle();
  assert.equal(reports.error.at(-1), "편집기 · rhwp-studio exposes no window.rhwpStudio.automation");
});

test("every interactive element is bound to a declared command and has a dom name", async (t) => {
  const { root, binder } = await setup(t);
  assert.deepEqual(binder.audit(root), []);
});

const named = (logs, name) => logs.filter((entry) => entry.event === `plugin.hwp.${name}`);
const isMicros = (value) => Number.isInteger(value) && value >= 0;

test("the start stores the open, each step, the read, the render and the watch", async (t) => {
  const { logs } = await setup(t);
  assert.deepEqual(named(logs, "open").map((entry) => entry.fields), [{ path: "docs/plan.hwp", format: "hwp" }]);
  assert.deepEqual(named(logs, "phase").map((entry) => entry.fields.phase), ["starting", "reading", "opening", "ready"]);
  const [read] = named(logs, "read");
  assert.equal(read.level, "debug");
  assert.deepEqual({ ...read.fields, micros: 0 }, { path: "docs/plan.hwp", reason: "start", size: bytes("첫 문단").length, micros: 0, ok: true });
  assert.ok(isMicros(read.fields.micros));
  const [render] = named(logs, "render");
  assert.deepEqual({ ...render.fields, micros: 0 }, { path: "docs/plan.hwp", pages: 1, micros: 0, ok: true });
  const [watch] = named(logs, "watch");
  assert.equal(watch.level, "info");
  assert.equal(watch.fields.ok, true);
  assert.ok(isMicros(watch.fields.micros));
});

test("a save stores its format, size and result, and a failed save stores the error as <code>: <text>", async (t) => {
  const { studio, run, logs, files, settle } = await setup(t, { path: "a.hwpx", files: new Map([["a.hwpx", bytes("x")]]) });
  studio.edit("y");
  await settle();
  await run("hwp.save");
  const [saved] = named(logs, "save");
  assert.equal(saved.level, "info");
  assert.deepEqual({ ...saved.fields, micros: 0 }, { path: "a.hwpx", format: "hwpx", overwrite: false, size: 2, micros: 0, ok: true });
  files.set("a.hwpx", bytes("other"));
  await assert.rejects(run("hwp.save"), /changed on disk/);
  const failed = named(logs, "save").at(-1);
  assert.equal(failed.level, "warn");
  assert.equal(failed.fields.ok, false);
  assert.equal(failed.fields.error, "Error: changed on disk: a.hwpx");
  assert.equal("size" in failed.fields, false);
});

test("a read that fails stores the failure of the read", async (t) => {
  const { files, run, logs, settle, sidecar } = await setup(t);
  files.delete("docs/plan.hwp");
  await assert.rejects(run("hwp.reload"));
  const failed = named(logs, "read").at(-1);
  assert.equal(failed.level, "warn");
  assert.equal(failed.fields.reason, "reload");
  assert.equal(failed.fields.ok, false);
  assert.match(failed.fields.error, /^TypeError: /);
  await settle();
  void sidecar;
});

test("a change on disk stores the action that it causes", async (t) => {
  const { studio, sidecar, files, logs, settle } = await setup(t);
  files.set("docs/plan.hwp", bytes("new"));
  sidecar.emit({ changed: "docs/plan.hwp" });
  await settle();
  studio.edit("!");
  await settle();
  files.set("docs/plan.hwp", bytes("newer"));
  sidecar.emit({ changed: "docs/plan.hwp" });
  await settle();
  assert.deepEqual(named(logs, "disk.changed").map((entry) => entry.fields),
    [{ path: "docs/plan.hwp", modified: false, action: "reload" }, { path: "docs/plan.hwp", modified: true, action: "banner" }]);
  assert.deepEqual(named(logs, "read").slice(1).map((entry) => entry.fields.reason), ["change", "change"]);
});

test("a watch failure of the sidecar is stored as an error", async (t) => {
  const { sidecar, logs, settle } = await setup(t);
  sidecar.emit({ error: "watch stopped" });
  await settle();
  assert.deepEqual(named(logs, "watch.failed").map((entry) => [entry.level, entry.fields]), [["error", { path: "docs/plan.hwp", error: "watch stopped" }]]);
});

test("the messages of the editor page are stored, and its error as an error", async (t) => {
  const { studio, logs, settle } = await setup(t);
  studio.post({ type: "soksak-hwp", event: "selection", selection: true });
  studio.post({ type: "soksak-hwp", event: "modified", modified: true });
  studio.post({ type: "soksak-hwp", event: "error", message: "no automation" });
  await settle();
  assert.deepEqual(named(logs, "studio.message").map((entry) => entry.fields),
    [{ path: "docs/plan.hwp", event: "listening" }, { path: "docs/plan.hwp", event: "selection", selection: true },
      { path: "docs/plan.hwp", event: "modified", modified: true }]);
  assert.deepEqual(named(logs, "studio.error").map((entry) => [entry.level, entry.fields]), [["error", { path: "docs/plan.hwp", message: "no automation" }]]);
});

test("a save that Command-S starts and that fails is stored and not dropped", async (t) => {
  const { studio, files, logs, settle } = await setup(t);
  studio.edit("!");
  await settle();
  files.set("docs/plan.hwp", bytes("other"));
  studio.post({ type: "soksak-hwp", event: "save" });
  await settle();
  assert.deepEqual(named(logs, "studio.message").at(-1).fields, { path: "docs/plan.hwp", event: "save" });
  assert.deepEqual(named(logs, "studio.save_failed").map((entry) => [entry.level, entry.fields]),
    [["warn", { path: "docs/plan.hwp", error: "Error: changed on disk: docs/plan.hwp" }]]);
});

test("a command and an embed request store their result with the time", async (t) => {
  const { run, logs } = await setup(t);
  await run("hwp.request", { method: "ready" });
  await assert.rejects(run("hwp.request", { method: "nothing" }), /unknown method nothing/);
  const requests = named(logs, "request");
  const failed = requests.at(-1);
  assert.equal(failed.level, "warn");
  assert.deepEqual({ ...failed.fields, micros: 0 }, { path: "docs/plan.hwp", method: "nothing", micros: 0, ok: false, error: "Error: rhwp-studio nothing-4: unknown method nothing" });
  const commands = named(logs, "command");
  assert.deepEqual(commands.map((entry) => [entry.level, entry.fields.name, entry.fields.ok]),
    [["debug", "hwp.request", true], ["warn", "hwp.request", false]]);
  assert.ok(commands.every((entry) => isMicros(entry.fields.micros)));
  assert.match(commands[1].fields.error, /^Error: rhwp-studio nothing-/);
});

test("the dispose stores the close", async (t) => {
  const { controller, logs } = await setup(t);
  await controller.dispose();
  assert.deepEqual(named(logs, "close").map((entry) => entry.fields), [{ path: "docs/plan.hwp" }]);
});

test("every stored event is declared in the catalog with its level and fields", async (t) => {
  const { studio, run, sidecar, files, logs, settle } = await setup(t);
  studio.edit("y");
  studio.post({ type: "soksak-hwp", event: "error", message: "x" });
  await settle();
  await run("hwp.save");
  files.set("docs/plan.hwp", bytes("z"));
  await assert.rejects(run("hwp.save"));
  sidecar.emit({ error: "stopped" });
  await settle();
  assert.ok(logs.length > 10);
  for (const { level, event, fields } of logs) {
    const entry = catalog.events[event];
    assert.ok(entry, `${event} is not declared`);
    assert.ok([entry.level].flat().includes(level), `${event} stored at ${level}`);
    const declared = Object.keys(entry.fields).map((name) => name.replace(/\?$/, ""));
    for (const name of Object.keys(fields)) assert.ok(declared.includes(name), `${event} has the undeclared field ${name}`);
    for (const name of Object.keys(entry.fields).filter((key) => !key.endsWith("?"))) assert.ok(name in fields, `${event} lacks ${name}`);
  }
});
