import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { window } from "./dom.mjs";
import { createBinder, validateManifest } from "@soksak/plugin-api";
import { fromBase64, loadRhwp, openDocument, toBase64 } from "../ui/document.js";
import { HwpDocument } from "../ui/vendor/rhwp.js";

await loadRhwp(readFileSync(new URL("../ui/vendor/rhwp_bg.wasm", import.meta.url)));
const { mount } = await import("../ui/hwp.js");
const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
const declared = (kind, name) => manifest.exposes[kind].some((entry) => entry.name === name);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** An HWP document whose body has the paragraphs lines. */
function sample(lines) {
  const document = HwpDocument.createEmpty();
  lines.forEach((line, index) => {
    if (index > 0) document.splitParagraph(0, index - 1, document.getParagraphLength(0, index - 1));
    if (line) document.insertText(0, index, 0, line);
  });
  const bytes = document.exportHwp();
  document.free();
  return bytes;
}

/** A files sidecar of one surface over an in-memory file system with readBytes, writeBytes and watch. */
function fakeFiles(files) {
  const listeners = new Set();
  const sent = [];
  const reply = (body) => queueMicrotask(() => { for (const fn of listeners) fn(body); });
  return {
    sent,
    on: async (surface, fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    async send(surface, body) {
      sent.push(body.operation);
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

async function setup(t, { path = "docs/plan.hwp", files = new Map([["docs/plan.hwp", sample(["첫 문단", "둘째"])]]) } = {}) {
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = host.attachShadow({ mode: "open" });
  const commands = new Map();
  const statuses = new Map();
  const reports = { modified: [], error: [], title: [] };
  const binder = createBinder((name, params) => commands.get(name)(params), {
    check(name) { assert.ok(declared("commands", name), `undeclared command ${name}`); },
  });
  const controller = await mount(root, {
    surfaceId: "hwp-1",
    project: { root: "/project" },
    tab: { params: { path }, title: (text) => reports.title.push(text), footer() {}, directory() {}, notify() {},
      modified: (value) => reports.modified.push(value), error: (text) => reports.error.push(text) },
    runtime: { sidecar: () => fakeFiles(files) },
    exposure: {
      status(name, read) { assert.ok(declared("status", name), `undeclared status ${name}`); statuses.set(name, read); },
      command(name, run) { assert.ok(declared("commands", name), `undeclared command ${name}`); commands.set(name, run); },
      dom(name) { assert.ok(declared("dom", name), `undeclared dom ${name}`); },
      bind: binder.bind, delegate: binder.delegate, dispose: binder.dispose,
    },
    status: { report(phase) { assert.equal(phase, "ready"); } },
  });
  t.after(async () => { await controller.dispose(); host.remove(); });
  return { root, run: (name, params = {}) => commands.get(name)(params), status: (name) => statuses.get(name)(), reports, files, binder };
}

test("plugin.json is a valid manifest that opens hwp and hwpx files", () => {
  assert.equal(validateManifest(manifest), manifest);
  assert.deepEqual(manifest.surface.opens, { extensions: ["hwp", "hwpx"] });
});

test("the surface opens the document, draws its pages and names the tab after the file", async (t) => {
  const { root, run, status, reports } = await setup(t);
  assert.equal(run("hwp.text"), "첫 문단\n둘째");
  assert.equal(status("hwp.document").pages, 1);
  assert.equal(root.querySelectorAll(".page > svg").length, 1);
  assert.deepEqual(reports.title, ["plan.hwp"]);
});

test("edits at the caret change the text, mark the tab modified, and a save writes the same format", async (t) => {
  const { run, status, reports, files } = await setup(t);
  run("hwp.caret", { section: 0, paragraph: 0, offset: 1 });
  run("hwp.edit", { action: "insert", text: "번째" });
  run("hwp.edit", { action: "right" });
  run("hwp.edit", { action: "enter" });
  run("hwp.edit", { action: "backspace" });
  run("hwp.edit", { action: "delete" });
  assert.equal(run("hwp.text"), "첫번째 단\n둘째");
  assert.equal(status("hwp.document").modified, true);
  assert.deepEqual(reports.modified, [false, true]);
  await run("hwp.save");
  const saved = new HwpDocument(files.get("docs/plan.hwp"));
  assert.equal(saved.getTextRange(0, 0, 0, saved.getParagraphLength(0, 0)), "첫번째 단");
  assert.equal(status("hwp.document").modified, false);
  assert.deepEqual(reports.error, [null]);
});

test("a save over a file that changed on disk fails as the tab error", async (t) => {
  const { run, reports, files } = await setup(t);
  run("hwp.edit", { action: "insert", text: "x" });
  files.set("docs/plan.hwp", sample(["다른 글"]));
  await assert.rejects(run("hwp.save"), /changed on disk: docs\/plan.hwp/);
  assert.equal(reports.error.at(-1), "저장하지 못했습니다 · changed on disk: docs/plan.hwp");
});

test("composition shows its text and inserts it when it ends", async (t) => {
  const { root, run, status } = await setup(t);
  const input = root.querySelector("#input");
  input.dispatchEvent(new window.CompositionEvent("compositionupdate", { data: "한" }));
  assert.equal(status("hwp.document").composing, "한");
  input.dispatchEvent(new window.CompositionEvent("compositionend", { data: "한" }));
  assert.equal(status("hwp.document").composing, "");
  assert.equal(run("hwp.text"), "한첫 문단\n둘째");
});

test("every interactive element is bound to a declared command and has a dom name", async (t) => {
  const { root, binder } = await setup(t);
  assert.deepEqual(binder.audit(root), []);
});

test("the input field keeps the focus while edits draw the pages again", async (t) => {
  const { root, run } = await setup(t);
  run("hwp.focus");
  const input = root.querySelector("#input");
  assert.equal(root.activeElement, input);
  run("hwp.edit", { action: "insert", text: "x" });
  run("hwp.edit", { action: "left" });
  assert.equal(root.activeElement, input, "drawing the pages took the focus from the input field");
  assert.equal(root.querySelector("#input"), input);
});

test("the caret has the height of its line in a paragraph with text", async (t) => {
  const { run, status } = await setup(t);
  run("hwp.caret", { section: 0, paragraph: 1, offset: 1 });
  const rect = status("hwp.document").caretRect;
  assert.ok(rect.height > 0, `the caret has height ${rect.height}`);
});
