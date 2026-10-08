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
const ADDRESS = "soksak-package://hwp/ui/studio/index.html?chrome=embed";

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
 * exportHwpx and notifySaved. The document is its bytes; edit(text) appends text and posts the modified message of
 * ui/studio-host.js.
 */
function fakeStudio() {
  const messages = new Set();
  const states = new Set();
  const studio = { document: null, requests: [], loaded: null };
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
    },
    onState(fn) { states.add(fn); return () => states.delete(fn); },
    onMessage(fn) { messages.add(fn); return () => messages.delete(fn); },
    async post(message) {
      assert.doesNotThrow(() => JSON.stringify(message));
      deliver(message);
      studio.requests.push(message.method);
      const answer = answers[message.method];
      if (!answer) return deliver({ type: "rhwp-response", id: message.id, error: `unknown method ${message.method}` });
      deliver({ type: "rhwp-response", id: message.id, result: answer(message.params) });
    },
  };
  return studio;
}

async function setup(t, { path = "docs/plan.hwp", files = new Map([["docs/plan.hwp", bytes("첫 문단")]]) } = {}) {
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = host.attachShadow({ mode: "open" });
  const commands = new Map();
  const statuses = new Map();
  const reports = { modified: [], error: [], title: [] };
  const studio = fakeStudio();
  const sidecar = fakeFiles(files);
  const binder = createBinder((name, params) => commands.get(name)(params), {
    check(name) { assert.ok(declared("commands", name), `undeclared command ${name}`); },
  });
  const controller = await mount(root, {
    surfaceId: "hwp-1",
    pluginId: "hwp",
    project: { root: "/project" },
    tab: { params: { path }, title: (text) => reports.title.push(text), footer() {}, directory() {}, notify() {},
      modified: (value) => reports.modified.push(value), error: (text) => reports.error.push(text) },
    runtime: { sidecar: () => sidecar },
    composition: {
      async create({ regions, overlays }) {
        assert.deepEqual(Object.keys(regions), ["studio"]);
        assert.deepEqual(overlays, {});
        return { region: (name) => { assert.equal(name, "studio"); return studio.region; }, async dispose() {} };
      },
    },
    exposure: {
      status(name, read) { assert.ok(declared("status", name), `undeclared status ${name}`); statuses.set(name, read); },
      command(name, run) { assert.ok(declared("commands", name), `undeclared command ${name}`); commands.set(name, run); },
      dom(name) { assert.ok(declared("dom", name), `undeclared dom ${name}`); },
      bind: binder.bind, delegate: binder.delegate, dispose: binder.dispose,
    },
    status: { report(phase) { assert.equal(phase, "ready"); } },
  });
  t.after(async () => { await controller.dispose(); host.remove(); });
  /** Lets the queued replies of the fakes run. */
  const settle = async () => { for (let turn = 0; turn < 8; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
  return { root, studio, sidecar, settle, run: (name, params = {}) => commands.get(name)(params),
    status: (name) => statuses.get(name)(), reports, files, binder };
}

test("plugin.json is a valid manifest that opens hwp and hwpx files in a document region", () => {
  assert.equal(validateManifest(manifest), manifest);
  assert.deepEqual(manifest.surface.opens, { extensions: ["hwp", "hwpx"] });
  assert.deepEqual(manifest.surface.composition.regions, [{ name: "studio", kind: "document", input: "native" }]);
});

test("the surface loads the editor page of the package and opens the file in it", async (t) => {
  const { studio, status, reports } = await setup(t);
  assert.equal(studio.loaded, ADDRESS);
  assert.deepEqual(studio.requests, ["ready", "loadFile"]);
  assert.deepEqual(studio.document, bytes("첫 문단"));
  assert.deepEqual(status("hwp.document"), { path: "docs/plan.hwp", format: "hwp", version: sha(bytes("첫 문단")),
    modified: false, selection: false, pages: 1, disk: "same" });
  assert.deepEqual(reports.title, ["plan.hwp"]);
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
