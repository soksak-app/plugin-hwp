// The view page at the consumer boundary (#H22): the page of the view carries the import map of the view, reads the
// start values of the surface, builds its surface context over the view channel, attaches the document region "studio"
// through the composition of the view, and mounts the hwp module into the page. The host side of the channel is
// test/view-host.mjs, which serves the call route of a view as the core workbench answers it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createViewPage } from "./view-host.mjs";

const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
const diagnostics = JSON.parse(readFileSync(new URL("../diagnostics.json", import.meta.url), "utf8"));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (text) => new TextEncoder().encode(text);
const catalog = JSON.parse(readFileSync(new URL("../events.json", import.meta.url), "utf8"));
const ADDRESS = "soksak://hwp/ui/studio/index.html?chrome=embed";
const declared = (kind, name) => manifest.exposes[kind].some((entry) => entry.name === name);

// The check of a view page (core docs/spec/plugin-processes.md, rule 4): the page begins with its doctype and holds no import map,
// because the host inserts the view import map after the doctype of each view page.
function checkViewPage(html) {
  assert.match(html, /^<!doctype html>/i, "the view page begins with its doctype");
  assert.doesNotMatch(html, /<script\b[^>]*\btype\s*=\s*["']?importmap\b/i, "the view page holds no import map of its own");
}

const named = (logs, name) => logs.filter((entry) => entry.event === `plugin.hwp.${name}`);
const isMicros = (value) => Number.isInteger(value) && value >= 0;
/** Resolves with the first record of name whose fields match, when the page writes it. */
const logged = async (host, name, match = () => true) => {
  const found = () => named(host.logs, name).find((entry) => match(entry.fields));
  await host.until(() => found() !== undefined);
  return found();
};
/** Resolves with the first record of plugin.hwp.report whose text matches reason, when the page writes it. */
const reported = (host, reason) => logged(host, "report", (fields) => reason.test(fields.text ?? ""));
// The start of the page ends with the phase ready, or with the record of a failed mount.
const started = (host) => named(host.logs, "phase").some((entry) => entry.fields.phase === "ready") || named(host.logs, "report").length > 0;

let cases = 0;
/**
 * Mounts the view page of one case and waits for the end of its start, or for ended(host) when the case gives it.
 * status() reads hwp.document through the exposure.
 */
async function setup(t, options = {}, ended = started) {
  const caseId = `case-${++cases}`;
  const host = createViewPage(t, caseId, options);
  // A start that fails is a record of the page, not a rejection of the import: the page reports the error through
  // runtime.log and stays mounted with no surface. The module awaits the mount, so the case waits for the end of the start
  // and not for the import; an import that rejects fails the case as an unhandled rejection.
  void import(`../build/test/ui/view.js?case=${caseId}`);
  await host.until(() => ended(host));
  host.status = async () => (await host.expose("status.get", { name: "hwp.document" })).result;
  return host;
}
/** Resolves when the page has handled the message of the editor page with event, which it records as studio.message. */
const handled = (host, event, count = 1) => host.until(() => named(host.logs, "studio.message").filter((entry) => entry.fields.event === event).length >= count);
/** An edit of the editor page, which resolves when the page has handled its modified message. */
const edit = async (host, text) => {
  const before = named(host.logs, "studio.message").filter((entry) => entry.fields.event === "modified").length;
  host.studio.edit(text);
  await handled(host, "modified", before + 1);
};
/** Resolves with the nth record of name (from 1), when the page writes it. */
const nth = async (host, name, count) => {
  await host.until(() => named(host.logs, name).length >= count);
  return named(host.logs, name)[count - 1];
};


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
  const host = createViewPage(t, "no-start");
  host.window.sokSurface = null;
  await assert.rejects(import("../build/test/ui/view.js?case=no-start"),
    /the view of hwp has no start values: the host provides window\.sokSurface/);
});

test("the view page refuses a project in its start values that has no id", async (t) => {
  const host = createViewPage(t, "project-without-id");
  host.window.sokSurface = Object.freeze({ surface: "hwp-1", params: {}, origin: { directory: "/project" }, project: { root: "/project" }, declarations: manifest.exposes });
  await assert.rejects(import("../build/test/ui/view.js?case=project-without-id"), /project is \{"root":"\/project"\}/);
});

test("the view page mounts when its tab has no source origin directory", async (t) => {
  const host = await setup(t, { origin: { directory: null } });
  assert.deepEqual(await host.status(), { path: "docs/plan.hwp", format: "hwp", version: sha(bytes("첫 문단")),
    modified: false, selection: false, pages: 1, disk: "same", phase: "ready" });
});

test("the view page mounts the surface over the view channel and registers every declared name", async (t) => {
  const host = await setup(t);
  assert.deepEqual(host.reports.registered.toSorted(), manifest.exposes.commands.map((entry) => entry.name).toSorted());
  const kinds = host.reports.native.filter(([name]) => name === "registered").map(([, payload]) => payload.kind);
  assert.deepEqual([...new Set(kinds)].toSorted(), ["element", "status"]);
  assert.deepEqual(host.reports.native.filter(([, payload]) => payload.kind === "status").map(([, payload]) => payload.name), ["hwp.document"]);
});

test("a status watch of the view sends each changed value as a changed call with its version until the unwatch", async (t) => {
  const host = await setup(t);
  const changes = () => host.reports.native.filter(([name]) => name === "changed").map(([, payload]) => payload);
  assert.deepEqual(await host.expose("status.watch", { name: "hwp.document" }), { result: null });
  await host.until(() => changes().length === 1);
  assert.deepEqual(changes(), [{ name: "hwp.document", value: await host.status(), version: 1 }]);
  host.studio.edit("!");
  await host.until(() => changes().length === 2);
  assert.deepEqual(changes().at(-1), { name: "hwp.document", value: await host.status(), version: 2 });
  assert.equal(changes().at(-1).value.modified, true);
  assert.deepEqual(await host.expose("status.unwatch", { name: "hwp.document" }), { result: null });
  host.studio.post({ type: "soksak-hwp", event: "modified", modified: false });
  await handled(host, "modified", 2);
  assert.equal(changes().length, 2, "no change is sent after the unwatch");
});

test("the view attaches the document region studio, places it, and loads the editor page in it", async (t) => {
  const host = await setup(t);
  assert.deepEqual(host.calls.find(([name]) => name === "document.attach")?.[1], { name: "studio" });
  assert.ok(host.calls.some(([name, params]) => name === "composition.place" && params.regions.length === 1
    && params.regions[0].name === "studio"), "the view places the region in one snapshot");
  assert.equal(host.studio.loaded, ADDRESS);
  assert.deepEqual(host.studio.requests, ["ready", "loadFile"]);
  assert.deepEqual(host.studio.document, bytes("첫 문단"));
  assert.deepEqual(await host.status(), { path: "docs/plan.hwp", format: "hwp", version: sha(bytes("첫 문단")),
    modified: false, selection: false, pages: 1, disk: "same", phase: "ready" });
  assert.deepEqual(host.reports.title, ["plan.hwp"]);
});

test("the start waits until the editor page listens, so its first request is not lost", async (t) => {
  const host = await setup(t);
  assert.deepEqual(host.studio.dropped, []);
  assert.equal(new URL(host.studio.loaded).searchParams.has("diagnostics"), false,
    "normal editor startup must not enable studio diagnostics");
  assert.deepEqual(host.studio.requests.slice(0, 2), ["ready", "loadFile"]);
  assert.equal((await host.status()).phase, "ready");
});

// The start of a page whose editor page never posts listening waits in the phase starting.
const starting = (host) => named(host.logs, "phase").some((entry) => entry.fields.phase === "starting");

test("the wait for listening ends when the WebContent process of the editor page ends, and the start fails with that end", async (t) => {
  const host = await setup(t, { listens: false }, starting);
  assert.deepEqual(host.timers, [], "the wait for listening starts no timer");
  host.studio.end();
  const report = await reported(host, /mount failed: /);
  assert.equal(report.fields.text, "view hwp: mount failed: the editor page did not post listening: the web content process of the editor page ended");
  assert.equal(report.level, "error");
});

test("the wait for listening ends when the region starts another navigation", async (t) => {
  const host = await setup(t, { listens: false }, starting);
  assert.deepEqual(host.timers, [], "the wait for listening starts no timer");
  host.studio.navigate("https://example.test/");
  const report = await reported(host, /mount failed: /);
  assert.equal(report.fields.text, "view hwp: mount failed: the editor page did not post listening: the document region started another navigation");
});

test("an embed request that the editor does not answer stays open and ends with the WebContent process of the editor page", async (t) => {
  const host = await setup(t, { silent: ["exportHwp"] });
  await edit(host, "!");
  const saving = assert.rejects(host.run("hwp.save"),
    /^Error: rhwp-studio did not answer exportHwp-3: the web content process of the editor page ended in phase ready$/);
  await host.until(() => host.studio.requests.includes("exportHwp"));
  assert.deepEqual(host.timers, [], "an embed request starts no timer");
  host.studio.end();
  await saving;
  assert.deepEqual(named(host.logs, "request").at(-1).fields.error,
    "Error: rhwp-studio did not answer exportHwp-3: the web content process of the editor page ended in phase ready");
});

test("an embed request that the editor does not answer ends when the region starts another navigation", async (t) => {
  const host = await setup(t, { silent: ["exportHwp"] });
  await edit(host, "!");
  const saving = assert.rejects(host.run("hwp.save"), /rhwp-studio did not answer exportHwp-3: the document region started another navigation in phase ready/);
  await host.until(() => host.studio.requests.includes("exportHwp"));
  assert.deepEqual(host.timers, [], "an embed request starts no timer");
  host.studio.navigate("https://example.test/");
  await saving;
});

test("an embed request after the end of the editor page fails with it at once, and the end is recorded and shown as the tab error", async (t) => {
  const host = await setup(t);
  assert.deepEqual(host.timers, [], "the start starts no timer");
  host.studio.end();
  // The page has run its state listeners when the host has delivered the state of the end.
  await host.until(() => host.delivered.some(({ event, data }) => event === "document-state" && data.state.error !== null));
  await assert.rejects(host.run("hwp.request", { method: "ready" }),
    /^Error: rhwp-studio did not answer ready-3: the web content process of the editor page ended in phase ready$/);
  assert.deepEqual(host.studio.dropped, [], "no request reaches an ended page");
  const ended = await logged(host, "studio.ended");
  assert.equal(ended.level, "error");
  assert.deepEqual(ended.fields, { path: "docs/plan.hwp", reason: "the web content process of the editor page ended" });
  await host.until(() => host.reports.error.length === 1);
  assert.equal(host.reports.error[0], "편집기가 끝났습니다 · the web content process of the editor page ended");
});

test("an edit marks the tab modified, and a save exports the format, writes it and tells the editor", async (t) => {
  const host = await setup(t, { params: { path: "a.hwpx" }, files: new Map([["a.hwpx", bytes("x")]]) });
  await edit(host, "y");
  assert.equal((await host.status()).modified, true);
  assert.deepEqual(host.reports.modified, [true]);
  const { result } = await host.expose("command.run", { name: "hwp.save", params: {} });
  assert.equal(result.version, sha(bytes("xy")));
  assert.deepEqual(host.files.get("a.hwpx"), bytes("xy"));
  assert.deepEqual(host.studio.requests.slice(2), ["exportHwpx", "notifySaved"]);
  assert.deepEqual(host.reports.modified, [true, false]);
  assert.deepEqual(host.reports.error, [null]);
});

test("Command-S in the editor page saves the document", async (t) => {
  const host = await setup(t);
  host.studio.edit("!");
  host.studio.post({ type: "soksak-hwp", event: "save" });
  await logged(host, "save");
  assert.deepEqual(host.files.get("docs/plan.hwp"), bytes("첫 문단!"));
});

test("a save over a file that changed on disk fails as the tab error and keeps the edits", async (t) => {
  const host = await setup(t);
  await edit(host, "!");
  host.files.set("docs/plan.hwp", bytes("다른 글"));
  await assert.rejects(host.run("hwp.save"), /changed on disk: docs\/plan.hwp/);
  assert.equal(host.reports.error.at(-1), "저장하지 못했습니다 · changed on disk: docs/plan.hwp");
  assert.equal((await host.status()).modified, true);
});

test("a change on disk reloads an unmodified document and shows the banner over a modified one", async (t) => {
  const host = await setup(t);
  host.files.set("docs/plan.hwp", bytes("새 글"));
  host.sidecar.emit({ changed: "docs/plan.hwp" });
  await nth(host, "render", 2);
  assert.deepEqual(host.studio.document, bytes("새 글"));
  await edit(host, "!");
  host.files.set("docs/plan.hwp", bytes("또 다른 글"));
  host.sidecar.emit({ changed: "docs/plan.hwp" });
  await nth(host, "disk.changed", 2);
  assert.equal((await host.status()).disk, "changed");
  assert.equal(host.window.document.body.lastElementChild.shadowRoot.querySelector("#banner").hidden, false);
  assert.deepEqual(host.studio.document, bytes("새 글!"));
});

test("a selection message of the editor page sets the selection of hwp.document", async (t) => {
  const host = await setup(t);
  host.studio.post({ type: "soksak-hwp", event: "selection", selection: true });
  await handled(host, "selection");
  assert.equal((await host.status()).selection, true);
});

test("hwp.document reports each step of the start as the phase events and ends ready", async (t) => {
  const host = await setup(t);
  assert.deepEqual([...new Set(named(host.logs, "phase").map((entry) => entry.fields.phase))],
    ["starting", "reading", "opening", "ready"]);
  assert.equal((await host.status()).phase, "ready");
});

test("an error message of the editor page is shown as the tab error", async (t) => {
  const host = await setup(t);
  host.studio.post({ type: "soksak-hwp", event: "error", message: "rhwp-studio exposes no window.rhwpStudio.automation" });
  await host.until(() => host.reports.error.length === 1);
  assert.equal(host.reports.error.at(-1), "편집기 · rhwp-studio exposes no window.rhwpStudio.automation");
});

test("every interactive element is bound to a declared command and has an element name", async (t) => {
  const host = await setup(t);
  const root = host.window.document.body.lastElementChild.shadowRoot;
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
  assert.deepEqual(named(host.logs, "open").map((entry) => entry.fields), [{ path: "docs/plan.hwp", format: "hwp" }]);
  assert.deepEqual(named(host.logs, "phase").map((entry) => entry.fields.phase), ["starting", "reading", "opening", "ready"]);
  const [read] = named(host.logs, "read");
  assert.equal(read.level, "debug");
  assert.deepEqual({ ...read.fields, micros: 0 }, { path: "docs/plan.hwp", reason: "start", size: bytes("첫 문단").length, micros: 0, ok: true });
  assert.ok(isMicros(read.fields.micros));
  const [render] = named(host.logs, "render");
  assert.deepEqual({ ...render.fields, micros: 0 }, { path: "docs/plan.hwp", pages: 1, micros: 0, ok: true });
  const [watch] = named(host.logs, "watch");
  assert.equal(watch.level, "info");
  assert.equal(watch.fields.ok, true);
  assert.ok(isMicros(watch.fields.micros));
});

test("a save stores its format, size and result, and a failed save stores the error as <code>: <text>", async (t) => {
  const host = await setup(t, { params: { path: "a.hwpx" }, files: new Map([["a.hwpx", bytes("x")]]) });
  await edit(host, "y");
  await host.run("hwp.save");
  const [saved] = named(host.logs, "save");
  assert.equal(saved.level, "info");
  assert.deepEqual({ ...saved.fields, micros: 0 }, { path: "a.hwpx", format: "hwpx", overwrite: false, size: 2, micros: 0, ok: true });
  host.files.set("a.hwpx", bytes("other"));
  await assert.rejects(host.run("hwp.save"), /changed on disk/);
  const failed = named(host.logs, "save").at(-1);
  assert.equal(failed.level, "warn");
  assert.equal(failed.fields.ok, false);
  assert.equal(failed.fields.error, "Error: changed on disk: a.hwpx");
  assert.equal("size" in failed.fields, false);
});

test("a read that fails stores the failure of the read", async (t) => {
  const host = await setup(t);
  host.files.delete("docs/plan.hwp");
  await assert.rejects(host.run("hwp.reload"));
  const failed = named(host.logs, "read").at(-1);
  assert.equal(failed.level, "warn");
  assert.equal(failed.fields.reason, "reload");
  assert.equal(failed.fields.ok, false);
  assert.match(failed.fields.error, /^Error: /);
});

test("a change on disk stores the action that it causes", async (t) => {
  const host = await setup(t);
  host.files.set("docs/plan.hwp", bytes("new"));
  host.sidecar.emit({ changed: "docs/plan.hwp" });
  await nth(host, "render", 2);
  await edit(host, "!");
  host.files.set("docs/plan.hwp", bytes("newer"));
  host.sidecar.emit({ changed: "docs/plan.hwp" });
  await nth(host, "disk.changed", 2);
  assert.deepEqual(named(host.logs, "disk.changed").map((entry) => entry.fields),
    [{ path: "docs/plan.hwp", modified: false, action: "reload" }, { path: "docs/plan.hwp", modified: true, action: "banner" }]);
  assert.deepEqual(named(host.logs, "read").slice(1).map((entry) => entry.fields.reason), ["change", "change"]);
});

test("a watch failure of the sidecar is stored as an error", async (t) => {
  const host = await setup(t);
  host.sidecar.emit({ error: "watch stopped" });
  await logged(host, "watch.failed");
  assert.deepEqual(named(host.logs, "watch.failed").map((entry) => [entry.level, entry.fields]),
    [["error", { path: "docs/plan.hwp", error: "watch stopped" }]]);
});

test("the messages of the editor page are stored, and its error as an error", async (t) => {
  const host = await setup(t);
  host.studio.post({ type: "soksak-hwp", event: "selection", selection: true });
  host.studio.post({ type: "soksak-hwp", event: "modified", modified: true });
  host.studio.post({ type: "soksak-hwp", event: "error", message: "no automation" });
  await logged(host, "studio.error");
  assert.deepEqual(named(host.logs, "studio.message").map((entry) => entry.fields),
    [{ path: "docs/plan.hwp", event: "listening" }, { path: "docs/plan.hwp", event: "selection", selection: true },
      { path: "docs/plan.hwp", event: "modified", modified: true }]);
  assert.deepEqual(named(host.logs, "studio.error").map((entry) => [entry.level, entry.fields]),
    [["error", { path: "docs/plan.hwp", message: "no automation" }]]);
});

test("a save that Command-S starts and that fails is stored and not dropped", async (t) => {
  const host = await setup(t);
  await edit(host, "!");
  host.files.set("docs/plan.hwp", bytes("other"));
  host.studio.post({ type: "soksak-hwp", event: "save" });
  await logged(host, "studio.save_failed");
  assert.deepEqual(named(host.logs, "studio.message").at(-1).fields, { path: "docs/plan.hwp", event: "save" });
  assert.deepEqual(named(host.logs, "studio.save_failed").map((entry) => [entry.level, entry.fields]),
    [["warn", { path: "docs/plan.hwp", error: "Error: changed on disk: docs/plan.hwp" }]]);
});

test("a command and an embed request store their result with the time", async (t) => {
  const host = await setup(t);
  await host.run("hwp.request", { method: "ready" });
  await assert.rejects(host.run("hwp.request", { method: "nothing" }), /unknown method nothing/);
  const requests = named(host.logs, "request");
  const failed = requests.at(-1);
  assert.equal(failed.level, "warn");
  assert.deepEqual({ ...failed.fields, micros: 0 }, { path: "docs/plan.hwp", method: "nothing", micros: 0, ok: false, error: "Error: rhwp-studio nothing-4: unknown method nothing" });
  const commands = named(host.logs, "command");
  assert.deepEqual(commands.map((entry) => [entry.level, entry.fields.name, entry.fields.ok]),
    [["debug", "hwp.request", true], ["warn", "hwp.request", false]]);
  assert.ok(commands.every((entry) => isMicros(entry.fields.micros)));
  assert.match(commands[1].fields.error, /^Error: rhwp-studio nothing-/);
});

test("every stored event is declared in the catalog with its level and fields", async (t) => {
  const host = await setup(t);
  host.studio.edit("y");
  host.studio.post({ type: "soksak-hwp", event: "error", message: "x" });
  await logged(host, "studio.error");
  await host.run("hwp.save");
  host.files.set("docs/plan.hwp", bytes("z"));
  await assert.rejects(host.run("hwp.save"));
  host.sidecar.emit({ error: "stopped" });
  await logged(host, "watch.failed");
  const logs = host.logs.filter((entry) => entry.event !== "plugin.hwp.report");
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
  assert.deepEqual(host.reports.title, ["새 문서"]);
});

test("the first save of a blank document asks for the file, exports its format, writes it and watches it", async (t) => {
  const files = new Map();
  const host = await setup(t, { params: {}, files, place: () => ({ path: "docs/new.hwpx" }) });
  await edit(host, "본문");
  const { result } = await host.expose("command.run", { name: "hwp.save", params: {} });
  assert.deepEqual(host.reports.commands, [["core.file.place", { name: "새 문서.hwp" }]]);
  assert.deepEqual(files.get("docs/new.hwpx"), bytes("본문"));
  assert.equal(result.version, sha(bytes("본문")));
  assert.deepEqual(host.studio.requests.slice(3), ["exportHwpx", "notifySaved"]);
  assert.deepEqual(host.studio.savedAs, ["new.hwpx"]);
  const document = await host.status();
  assert.equal(document.path, "docs/new.hwpx");
  assert.equal(document.format, "hwpx");
  assert.equal(document.modified, false);
  assert.deepEqual(host.reports.title, ["새 문서", "new.hwpx"]);
  // The next save writes the named file in place.
  await edit(host, "!");
  await host.run("hwp.save");
  assert.deepEqual(files.get("docs/new.hwpx"), bytes("본문!"));
  assert.equal(host.reports.commands.length, 1, "a named document does not ask for its place again");
});

test("a cancelled place keeps the blank document modified and writes nothing", async (t) => {
  const host = await setup(t, { params: {}, files: new Map(), place: () => ({ path: null }) });
  await edit(host, "x");
  const { result } = await host.expose("command.run", { name: "hwp.save", params: {} });
  assert.deepEqual(result, { version: null });
  assert.equal((await host.status()).path, null);
  assert.equal((await host.status()).modified, true);
  assert.equal(host.files.size, 0);
});

test("a place that is not an hwp or hwpx file is refused as the tab error", async (t) => {
  const host = await setup(t, { params: {}, files: new Map(), place: () => ({ path: "notes.txt" }) });
  await edit(host, "x");
  await assert.rejects(host.run("hwp.save"), /opens \.hwp and \.hwpx files, not notes\.txt/);
  assert.equal((await host.status()).path, null);
  assert.match(host.reports.error.at(-1), /not notes\.txt/);
});

test("every event of a blank document and its first save is declared in the catalog with its level and fields", async (t) => {
  const host = await setup(t, { params: {}, files: new Map(), place: () => ({ path: "new.hwp" }) });
  await edit(host, "y");
  await host.run("hwp.save");
  for (const { level, event, fields } of host.logs.filter((entry) => entry.event !== "plugin.hwp.report")) {
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
  assert.ok(host.logs.some((entry) => entry.event === "plugin.hwp.new") && host.logs.some((entry) => entry.event === "plugin.hwp.place"));
});

test("the surface writes its file as the tab state and a restored tab opens the stored file", async (t) => {
  const opened = await setup(t);
  assert.deepEqual(opened.reports.state, [{ path: "docs/plan.hwp" }]);
  const files = new Map([["docs/plan.hwp", bytes("첫 문단")], ["docs/saved.hwp", bytes("저장한 문단")]]);
  const restored = await setup(t, { params: {}, stored: { path: "docs/saved.hwp" }, files });
  assert.equal((await restored.status()).path, "docs/saved.hwp");
  assert.deepEqual(restored.studio.document, bytes("저장한 문단"));
  assert.deepEqual(restored.reports.state, [], "a state that keeps the stored file writes nothing");
});

// The page reads region.history and loads no editor page when the attach restored a session history
// (core docs/spec/plugins.md#memory-saver). The region handle reports history as a boolean after its attach
// (core docs/spec/surface-composition.md); the fake attach reply carries it and the fake restores the entry by itself.
test("a region that restored the session history loads no editor page", async (t) => {
  const host = await setup(t, { stored: { path: "docs/plan.hwp" }, history: true });
  assert.equal(host.studio.loaded, null);
  assert.equal((await host.status()).phase, "ready");
});

test("a tab state of another form is refused", async (t) => {
  const host = await setup(t, { stored: { path: 3 } });
  await reported(host, /the tab state of hwp tab hwp-1 is not \{path\}: \{"path":3\}/);
});

test("an export reply that is not an array of byte values fails the save and keeps the file", async (t) => {
  const host = await setup(t, { params: { path: "docs/plan.hwp" }, replies: { exportHwp: () => "not bytes" } });
  await edit(host, "!");
  await assert.rejects(host.run("hwp.save"), /exportHwp did not reply with a non-empty array of byte values/);
  assert.deepEqual(host.files.get("docs/plan.hwp"), bytes("첫 문단"));
  assert.match(host.reports.error.at(-1), /^저장하지 못했습니다 · exportHwp did not reply/);
});

test("an export reply with no bytes fails the save instead of writing an empty file", async (t) => {
  const host = await setup(t, { params: { path: "docs/plan.hwp" }, replies: { exportHwp: () => [] } });
  await edit(host, "!");
  await assert.rejects(host.run("hwp.save"), /non-empty array/);
  assert.deepEqual(host.files.get("docs/plan.hwp"), bytes("첫 문단"));
});

test("a save whose notice to the editor fails is saved, and the tab shows that the notice failed", async (t) => {
  const host = await setup(t, { params: { path: "docs/plan.hwp" }, replies: { notifySaved: () => { throw new Error("editor gone"); } } });
  await edit(host, "!");
  const { result } = await host.expose("command.run", { name: "hwp.save", params: {} });
  assert.equal(result.version, sha(bytes("첫 문단!")));
  assert.deepEqual(host.files.get("docs/plan.hwp"), bytes("첫 문단!"));
  assert.equal((await host.status()).modified, false);
  assert.equal(host.reports.error.at(-1), "저장했지만 편집기에 알리지 못했습니다 · editor gone");
  assert.equal(named(host.logs, "notify").length, 1);
});

test("an error message of the editor page without text shows the whole event", async (t) => {
  const host = await setup(t);
  host.studio.post({ type: "soksak-hwp", event: "error" });
  await host.until(() => host.reports.error.length === 1);
  assert.equal(host.reports.error.at(-1), '편집기 · {"type":"soksak-hwp","event":"error"}');
});

test("a refused view event batch uses the bridge error route", async (t) => {
  // Every record of the page is refused, so the start is known by the first refused batch on the error route.
  const host = await setup(t, { refuseLog: "log route refused" }, (page) => page.reports.errorLines.length > 0);
  const before = host.reports.errorLines.length;
  host.window.dispatchEvent(new host.window.ErrorEvent("error", { error: new Error("failed"), message: "failed" }));
  await host.until(() => host.reports.errorLines.length > before);
  assert.ok(host.reports.errorLines.some((line) => line.where === "log batch" && line.text.includes("log route refused")),
    "the bridge did not report the refused batch through runtime.error");
});

test("the open and the save of a file carry the cids of their operations on the sidecar sends and the records", async (t) => {
  const host = await setup(t);
  const operations = host.logs.filter((entry) => entry.event === "plugin.hwp.operation");
  const opened = operations.find((entry) => entry.fields.kind === "open");
  assert.ok(opened, "the open starts an operation");
  assert.match(opened.cids[0], new RegExp(`^p${host.window.sokView.page}\\.\\d+$`), "the operation identifier has the form p<page>.<n>");
  const reads = host.sidecarSends.filter((send) => send.body.operation === "readBytes");
  assert.deepEqual(reads.map((send) => send.cids), [opened.cids], "the read of the open carries the cids of the open");
  assert.ok(named(host.logs, "read").every((entry) => entry.cids === undefined || entry.cids.length === 1), "the records of the read keep the cids");
  const readRecord = named(host.logs, "read").find((entry) => entry.fields.reason === "start");
  assert.deepEqual(readRecord.cids, opened.cids, "the read record carries the cids of the open");

  host.studio.edit("!");
  await host.expose("command.run", { name: "hwp.save", params: {} });
  const saved = host.logs.filter((entry) => entry.event === "plugin.hwp.operation" && entry.fields.kind === "save");
  assert.equal(saved.length, 1, "the save starts one operation");
  const writes = host.sidecarSends.filter((send) => send.body.operation === "writeBytes");
  assert.deepEqual(writes.map((send) => send.cids), [saved[0].cids], "the write of the save carries the cids of the save");
  assert.deepEqual(named(host.logs, "save").map((entry) => entry.cids), [saved[0].cids], "the save record carries the cids of the save");
});
