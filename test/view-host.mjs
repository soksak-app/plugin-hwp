// A fake of the core side of the view channel for the tests of the view page, built from the wire contract of core
// (docs/spec/native-surfaces.md#view-surfaces): the view channel global window.sokView, the call route of a view, the
// view events, and the composition and document routes of a view with a document region. It reads no file of core. The
// page imports with a distinct query per case, so each case mounts a fresh page into its own window.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createWindow, useWindow } from "./dom.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (text) => new TextEncoder().encode(text);
const fromBase64 = (text) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
const toBase64 = (value) => btoa(String.fromCharCode(...value));

/**
 * Installs the view channel of the contract in window: the ready message {event: "view.ready", plugin, document} through
 * the sok-view handler, and window.sokView.attach(listener), which delivers the host messages with sok: 1 that arrived
 * before the attach in order and every later one. A message without the marker is reported as view.error.
 */
function installViewChannel(window, handler) {
  const plugin = window.location.host;
  const queue = [];
  let listener = null;
  window.addEventListener("message", (event) => {
    if (event.data?.sok !== 1) {
      handler.postMessage({ event: "view.error", plugin, reason: `message without the sok marker for ${plugin}` });
      return;
    }
    if (listener) listener(event.data);
    else queue.push(event.data);
  });
  handler.postMessage({ event: "view.ready", plugin, document: "document-1" });
  window.sokView = Object.freeze({
    attach(next) {
      if (listener) throw new Error(`view channel for ${plugin} already has a message listener`);
      listener = next;
      while (queue.length > 0) next(queue.shift());
    },
  });
}

const MANIFEST = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
const declared = (kind, name) => (MANIFEST.exposes[kind] ?? []).some((entry) => entry.name === name);

const settle = (rounds = 10) => {
  let done = Promise.resolve();
  for (let i = 0; i < rounds; i += 1) done = done.then(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return done;
};

/** A files sidecar of one surface over an in-memory file system with readBytes, writeBytes and watch. */
function fakeFiles(files) {
  const listeners = new Set();
  const reply = (body) => queueMicrotask(() => { for (const fn of listeners) fn(body); });
  return {
    emit: (body) => reply(body),
    on: async (_surface, fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    async send(_surface, body) {
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
    },
  };
}

/**
 * A document region "studio" that shows a fake rhwp-studio. The host delivers the state of the region as the event
 * document-state and each message of the editor document as the event document-message through the subscriptions
 * runtime.native.on, which emit runs. load(url) records the load and reports the loaded page; the editor page installs
 * its message listener after the load reports the page, in a later task, and then posts the listening message of
 * ui/studio-host.js. post(message) delivers one message of the editor page. The document is its bytes; edit(text)
 * appends text and posts the modified message.
 */
function fakeStudio(name, emit, { listens = true, silent = [], history = false } = {}) {
  const studio = { document: null, requests: [], dropped: [], loaded: null, savedAs: [], history };
  let listening = false;
  const deliver = (message) => queueMicrotask(() => emit("document-message", { document: name, message }));
  const answers = {
    ready: () => true,
    loadFile: ({ data }) => { studio.document = Uint8Array.from(data); return { pageCount: 1 }; },
    exportHwp: () => Array.from(studio.document),
    exportHwpx: () => Array.from(studio.document),
    notifySaved: ({ fileName }) => { studio.savedAs.push(fileName); return { ok: true, wasDirty: true }; },
    // The studio command file:new-doc replaces the document with a blank document.
    "automation.execute": ({ id }) => {
      if (id !== "file:new-doc") throw new Error(`unexpected automation command ${id}`);
      studio.document = new Uint8Array();
      return { ok: true };
    },
    pageCount: () => 1,
  };
  studio.edit = (text) => {
    studio.document = new Uint8Array([...studio.document, ...bytes(text)]);
    deliver({ type: "soksak-hwp", event: "modified", modified: true });
  };
  studio.post = deliver;
  // Shows the editor page at url as a load does, or as a region that restored a session history does by itself.
  const show = (url) => {
    queueMicrotask(() => emit("document-state", { document: name, state: { url, loading: false, error: null } }));
    if (listens) setTimeout(() => {
      listening = true;
      deliver({ type: "soksak-hwp", event: "listening" });
    }, 0);
  };
  studio.show = show;
  studio.deliverState = (state) => queueMicrotask(() => emit("document-state", { document: name, state }));
  studio.region = {
    history,
    async load(url) {
      studio.loaded = url;
      show(url);
    },
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

/**
 * Creates one window with the view page of one case mounted: the start values, the fake view channel, the host side of
 * the sok-view channel, the composition and document routes of the view, and the files sidecar. The globals of the test
 * process serve the window.
 *
 *     stored        the tab state of the surface, or null for a new tab
 *     params        the parameters of the tab
 *     files         the Map of the files sidecar
 *     listens       whether the editor page posts listening after its load
 *     silent        the embed request methods that the editor never answers
 *     history       whether the document region restored a session history
 *     place         the answer of core.file.place at the first save of a blank document
 *
 * Returns { window, studio, files, reports, logs, calls, registered, run, post, expose, settle }.
 */
export function createViewPage(t, caseId, { stored = null, params = { path: "docs/plan.hwp" }, files = new Map([["docs/plan.hwp", bytes("첫 문단")]]),
  listens = true, silent = [], history = false, place = () => { throw new Error("the test runs no core command"); } } = {}) {
  const { window } = createWindow(`sok://hwp/ui/index.html?case=${caseId}`);
  useWindow(window);
  // The composition controller measures the insets of the region element against the viewport of the view and observes
  // the element sizes; jsdom reports no viewport and no size, so the test provides the forms it reads.
  window.visualViewport = { width: 800, height: 600 };
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const reports = { title: [], modified: [], error: [], state: [], registered: [], native: [], commands: [] };
  const logs = [];
  const calls = [];
  const pending = new Map();
  const subscribed = new Set();
  const exposurePending = new Map();
  const nativeEmit = new Map();
  const post = (message) => window.dispatchEvent(new window.MessageEvent("message", { source: window, origin: "", data: message }));
  const emitNative = (name, data) => {
    if (nativeEmit.get(name)) post({ sok: 1, event: name, data });
  };
  const sidecar = fakeFiles(files);
  const studio = fakeStudio("studio", emitNative, { listens, silent, history });
  const LEVELS = ["error", "warn", "info", "debug", "trace"];
  const handler = { postMessage: (sent) => { const message = JSON.parse(JSON.stringify(sent)); deliver(message); } };
  window.webkit = { messageHandlers: { "sok-view": handler } };

  const reply = (id, payload) => post({ sok: 1, id, ...payload });
  const deliver = (message) => {
    if (message?.event === "declared-ui.snapshot") {
      post({ sok: 1, event: "declared-ui.snapshot.ack", data: { plugin: message.plugin, status: message.status, seq: message.seq } });
      return;
    }
    if (message?.event !== undefined) return;
    if (message?.reply !== undefined) {
      const request = pending.get(message.reply);
      if (!request) throw new Error(`the page replied to unknown host request ${message.reply}`);
      pending.delete(message.reply);
      if (message.error !== undefined) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }
    if (message.cancel === true) return;
    if (Number.isInteger(message?.id) && typeof message?.command === "string") {
      serve(message.id, message.command, message.params);
      return;
    }
    throw new Error(`the page sent an unexpected message ${JSON.stringify(message)}`);
  };
  const serve = (id, command, params) => {
    Promise.resolve().then(async () => {
      switch (command) {
        case "tab.state.read": return stored;
        case "tab.state.write": reports.state.push(params); return null;
        case "tab.title": reports.title.push(params); return null;
        case "tab.modified": reports.modified.push(params); return null;
        case "tab.error": reports.error.push(params); return null;
        case "tab.footer": case "tab.notify": case "tab.keep": case "tab.directory": return null;
        case "runtime.log":
          if (params === null || typeof params !== "object" || Array.isArray(params)) throw new Error("runtime.log requires {level, event, fields}");
          if (!LEVELS.includes(params.level)) throw new Error(`runtime.log level ${params.level} is not a log level`);
          // The runtime adds the prefix plugin.<plugin>. to the event name of a view call (core packages/plugin-api/plugin-runtime.js).
          logs.push({ ...params, event: `plugin.${window.location.host}.${params.event}` });
          return null;
        case "runtime.textSize.read": return 1;
        case "runtime.textSize.on": case "runtime.settings.read": case "runtime.settings.on": return null;
        case "runtime.native.on":
          if (typeof params?.name !== "string" || params.name === "") throw new Error("runtime.native.on requires a name");
          subscribed.add(params.name);
          nativeEmit.set(params.name, true);
          return null;
        case "runtime.command.register":
          if (!declared("commands", params.name)) throw new Error(`command ${params.name} is not declared`);
          reports.registered.push(params.name);
          return null;
        case "runtime.sidecar.send": return sidecar.send(params.id, params.body);
        case "runtime.sidecar.on":
          await sidecar.on(params.id, (body) => post({ sok: 1, event: "sidecar.message", data: { id: params.id, body } }));
          return null;
        case "runtime.sidecar.onFailure":
          return null;
        case "core.file.place": {
          // A core.* command of the view runs as runtime.command runs it; its params are the parameters of the command.
          reports.commands.push([command, params]);
          return place(command, params);
        }
        case "composition.declaration":
          return JSON.parse(JSON.stringify(MANIFEST.surface.composition));
        case "composition.place":
          calls.push(["composition.place", params]);
          return null;
        case "composition.report":
          calls.push(["composition.report", params]);
          return null;
        case "document.attach": case "document.load": case "document.zoom": case "document.go":
        case "document.post": case "document.subscribe": case "document.unsubscribe": case "document.detach": {
          const operation = command.slice("document.".length);
          calls.push([command, params]);
          if (params.name !== "studio") throw new Error(`the page called ${command} for the unknown region ${params.name}`);
          if (operation === "attach") return { history: studio.history };
          if (operation === "load") return await studio.region.load(params.url);
          if (operation === "post") return await studio.region.post(params.message);
          return null;
        }
        case "runtime.native.call": {
          const { name, payload } = params;
          if (name === "registered") {
            if (!declared(payload.kind, payload.name)) throw new Error(`${payload.kind} ${payload.name} is not declared`);
            reports.native.push(["registered", payload]);
            return null;
          }
          if (name === "exposureReply") {
            const request = exposurePending.get(payload.id);
            if (!request) throw new Error(`the page replied to unknown exposure request ${payload.id}`);
            exposurePending.delete(payload.id);
            const { id: _id, ...answer } = payload;
            request(answer);
            return null;
          }
          throw new Error(`the page called the native ${name}`);
        }
        default:
          throw new Error(`the page called ${command}, which is served by no route of the test host`);
      }
    }).then((result) => reply(id, { result: result ?? null }), (error) => reply(id, { error: { code: -32000, message: String(error?.message ?? error) } }));
  };

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    throw new Error(`the page fetched ${String(input)}, which the test host serves no document for`);
  };
  t.after(() => { globalThis.fetch = realFetch; });

  // The start values in the form that core injects (docs/spec/native-surfaces.md#view-surfaces, start values): the
  // declarations are the exposes of the plugin.
  window.sokSurface = Object.freeze({ surface: "hwp-1", params, origin: { directory: "/project" }, project: { root: "/project" }, declarations: MANIFEST.exposes });
  installViewChannel(window, handler);
  post({ sok: 1, event: "theme", data: { scheme: "dark", tokens: {} } });

  let nextId = 1000;
  // Sends one command request of core to the page, as the workbench sends each request of a command that the view
  // registered. A command that the page has not registered reaches no view, so the host refuses it.
  const run = (name, paramsOfRun = {}) => new Promise((resolve, reject) => {
    if (!reports.registered.includes(name)) {
      reject(new Error(`view command ${name} is not registered`));
      return;
    }
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    post({ sok: 1, id, command: name, params: paramsOfRun });
  });
  let nextExposure = 0;
  // Forwards one exposure request of core to the page as the host event exposure-request {id, surface, method, params}
  // and resolves with the reply {result} or {error} of the page.
  const expose = (method, paramsOfRequest) => new Promise((resolve) => {
    if (!subscribed.has("exposure-request")) {
      resolve({ error: { message: "the page has no subscription of exposure-request" } });
      return;
    }
    const id = ++nextExposure;
    exposurePending.set(id, resolve);
    post({ sok: 1, event: "exposure-request", data: { id, surface: "hwp-1", method, params: paramsOfRequest } });
  });
  return { window, studio, sidecar, files, reports, logs, calls, snapshots: [], subscribed, run, post, expose, settle };
}
