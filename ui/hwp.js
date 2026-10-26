// The HWP surface: shows rhwp-studio, the editor of rhwp built into ui/studio (docs/studio.md), in the document region
// "studio", opens the .hwp or .hwpx file tab.params.path of the project in it through the files sidecar, and saves the
// document in its own format. The page talks to rhwp-studio with its embed requests {type: "rhwp-request", id, method,
// params}, which rhwp-studio answers with {type: "rhwp-response", id, result | error}, and receives the messages of
// ui/studio-host.js {type: "soksak-hwp", event}. A tab without a path opens a blank document of the editor, whose first
// save asks for its file through core.file.place.
import { createEmitter, errorText, messageText } from "./events.js";
import { connect } from "./requests.js";

const css = `:host{display:block;height:100%}
#frame{display:flex;height:100%;flex-direction:column;background:var(--card);color:var(--fg);font:var(--text-control)/1.4 var(--ui-font)}
#banner{display:flex;align-items:center;gap:8px;padding:4px 8px;border-bottom:1px solid var(--rule)}
#banner span{flex:1;min-width:0}
button{padding:2px 6px;border:0;border-radius:var(--r-xs);background:transparent;color:var(--muted);font:inherit;cursor:pointer}
button:hover{background:var(--inset);color:var(--fg)}
#studio{flex:1;min-height:0}
[hidden]{display:none!important}`;

const HTML = `<style>${css}</style><div id="frame" data-expose="hwp.frame">
<div id="banner" data-expose="hwp.banner" hidden><span></span><button data-expose="hwp.reload">다시 읽기</button><button data-expose="hwp.overwrite">덮어쓰기</button></div>
<div id="studio" data-expose="hwp.studio"></div></div>`;

/** The tab title of a blank document and the file name that its first save proposes. */
// The files sidecar, named by its package name in the dependencies of plugin.json (docs/spec/sidecars.md).
const FILES_SIDECAR = "@soksak/sidecar-files";
const NEW_TITLE = "새 문서";
const NEW_NAME = "새 문서.hwp";

/* The embed request that exports each format. */
const EXPORTS = { hwp: "exportHwp", hwpx: "exportHwpx" };
// The bytes of an export reply, which rhwp-studio answers as an array of byte values. Any other reply, and an empty one, is
// refused: writing it would replace the file with other bytes, or with an empty file.
const exportedBytes = (reply, method) => {
  const bytes = Array.isArray(reply) || reply instanceof Uint8Array ? Array.from(reply) : null;
  if (bytes === null || bytes.length === 0 || !bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    throw new TypeError(`${method} did not reply with a non-empty array of byte values`);
  }
  return Uint8Array.from(bytes);
};

/** The format of path from its extension, hwp or hwpx. */
export function formatOf(path) {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (!Object.hasOwn(EXPORTS, extension)) throw new Error(`the hwp surface opens .hwp and .hwpx files, not ${path}`);
  return extension;
}

export const toBase64 = (bytes) => {
  let text = "";
  for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(text);
};

/** The number of bytes that the base64 text holds. */
export const base64Size = (text) => Math.floor(text.length * 3 / 4) - (text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0);

/** The bound of the wait for the listening message of the editor page after its load. */
const LISTENING_LIMIT_MS = 10000;
/** The bound of the wait for the answer of one embed request; an export or a load of a large document fits in it. */
const REQUEST_LIMIT_MS = 60000;

/** The microseconds since start, a value of performance.now(). */
const microsSince = (start) => Math.round((performance.now() - start) * 1000);

export const fromBase64 = (text) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

export async function mount(root, context) {
  // The tab state {path} names the file that a restored or restarted tab opens (core docs/spec/plugins.md#memory-saver); it
  // follows the first save of a blank document, which params do not. An unloaded tab gives up the view of the editor page.
  // The read is a call of the view channel, so the page awaits it.
  // default: a new tab has no tab state and reads null.
  const stored = await context.tab.state.read();
  if (stored !== null && (typeof stored !== "object" || !(stored.path === null || (typeof stored.path === "string" && stored.path !== "")))) {
    throw new Error(`the tab state of hwp tab ${context.surfaceId} is not {path}: ${JSON.stringify(stored)}`);
  }
  // default: a tab without params.path holds a blank document; core.file.open always passes {path}.
  let path = stored !== null ? stored.path : context.tab.params?.path ?? null;
  const writeTabState = () => {
    if (stored !== null && stored.path === path) return;
    context.tab.state.write({ path });
  };
  if (path !== null && (typeof path !== "string" || path === "")) throw new Error("the hwp tab params.path must be a non-empty string");
  if (context.project === null) throw new Error("this window shows no project");
  let format = path === null ? "hwp" : formatOf(path);
  const emitEvent = createEmitter(context.runtime, context.pluginId);
  if (path === null) emitEvent("info", "plugin.hwp.new", { name: NEW_NAME });
  else emitEvent("info", "plugin.hwp.open", { path, format });
  let name = path === null ? NEW_TITLE : path.slice(path.lastIndexOf("/") + 1);
  context.tab.title(name);
  root.innerHTML = HTML;
  const frame = root.querySelector("#frame");
  const banner = root.querySelector("#banner");
  const addressUrl = new URL("./studio/index.html?chrome=embed", window.location.href);
  if (context.diagnostics !== null) addressUrl.searchParams.set("diagnostics", "1");
  const address = addressUrl.href;

  let state = { path, format, version: null, modified: false, selection: false, pages: 0, disk: "same", phase: "loading" };
  let diskVersion = null;
  const listeners = new Set();
  const publish = (change) => {
    state = { ...state, ...change };
    for (const fn of listeners) fn(state);
  };
  const setPhase = (phase) => {
    publish({ phase });
    emitEvent("info", "plugin.hwp.phase", { path, phase });
  };
  const showBanner = (text) => {
    banner.hidden = text === null;
    banner.querySelector("span").textContent = text ?? "";
  };
  const setModified = (modified) => {
    if (modified === state.modified) return;
    publish({ modified });
    context.tab.modified(modified);
  };

  // The status exists from the start, so a start that stops at one step shows that step as phase.
  const expose = context.exposure;
  expose.status("hwp.document", () => state, (fn) => { listeners.add(fn); fn(state); return () => listeners.delete(fn); });

  const composition = await context.composition.create({ regions: { studio: root.querySelector("#studio") }, overlays: {} });
  const region = composition.region("studio");

  const pending = new Map();
  let next = 0;
  /**
   * Sends the embed request method with params to rhwp-studio and resolves its result. No event reports a request that the
   * editor never answers, so each request has a bound and then fails with its id and the phase of the start.
   */
  const request = (method, params = {}) => {
    const start = performance.now();
    let bound;
    return new Promise((resolve, reject) => {
      const id = `${method}-${++next}`;
      pending.set(id, { resolve, reject });
      bound = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`rhwp-studio did not answer ${id} within ${REQUEST_LIMIT_MS / 1000} s in phase ${state.phase}`));
      }, REQUEST_LIMIT_MS);
      region.post({ type: "rhwp-request", id, method, params }).catch((failure) => {
        pending.delete(id);
        reject(failure);
      });
    }).finally(() => clearTimeout(bound)).then((result) => {
      emitEvent("debug", "plugin.hwp.request", { path, method, micros: microsSince(start), ok: true });
      return result;
    }, (error) => {
      emitEvent("warn", "plugin.hwp.request", { path, method, micros: microsSince(start), ok: false, error: errorText(error) });
      throw error;
    });
  };

  let save = null;
  // The editor page installs its message listener while its scripts run, which can end after the load reports the page;
  // ui/studio-host.js runs after them and posts listening, and a request posted before that would be lost.
  let markListening;
  const listening = new Promise((resolve) => { markListening = resolve; });
  const stopMessages = region.onMessage((message) => {
    // The region passes every message that the document posts to its own window, so it passes the requests of this
    // page back too.
    if (message?.type === "rhwp-request") return;
    if (message?.type === "soksak-hwp-viewport-marker") return;
    if (message?.type === "rhwp-response") {
      const entry = pending.get(message.id);
      if (!entry) throw new Error(`rhwp-studio answered the unknown request ${message.id}`);
      pending.delete(message.id);
      if (message.error !== undefined) entry.reject(new Error(`rhwp-studio ${message.id}: ${message.error}`));
      else entry.resolve(message.result);
      return;
    }
    if (message?.type === "soksak-hwp" && message.event === "listening") {
      emitEvent("debug", "plugin.hwp.studio.message", { path, event: "listening" });
      return markListening();
    }
    if (message?.type === "soksak-hwp" && message.event === "modified") {
      emitEvent("debug", "plugin.hwp.studio.message", { path, event: "modified", modified: message.modified });
      return setModified(message.modified);
    }
    if (message?.type === "soksak-hwp" && message.event === "selection") {
      emitEvent("debug", "plugin.hwp.studio.message", { path, event: "selection", selection: message.selection });
      return publish({ selection: message.selection });
    }
    // save shows its failure as the tab error and stores it as an event.
    if (message?.type === "soksak-hwp" && message.event === "save") {
      emitEvent("debug", "plugin.hwp.studio.message", { path, event: "save" });
      return void save().catch((error) => emitEvent("warn", "plugin.hwp.studio.save_failed", { path, error: errorText(error) }));
    }
    if (message?.type === "soksak-hwp" && message.event === "error") {
      // An error event without a text shows the whole event, so that the failure is not shown as an empty value.
      const text = typeof message.message === "string" ? message.message : JSON.stringify(message);
      emitEvent("error", "plugin.hwp.studio.error", { path, message: text });
      return context.tab.error(`편집기 · ${text}`);
    }
    throw new Error(`the hwp document posted an unknown message ${JSON.stringify(message)}`);
  });

  /** Resolves when the document region has loaded the editor page, and rejects with its load error. */
  const loaded = new Promise((resolve, reject) => {
    let stop = () => {};
    const settle = (current) => {
      if (current.url !== address || current.loading) return false;
      stop();
      if (current.error !== null) reject(new Error(`the editor page did not load: ${current.error}`));
      else resolve();
      return true;
    };
    // onState does not replay a state that the region reported before this subscription, and region.state keeps it: a
    // restored session history loads its entry before the page subscribes.
    if (region.state !== null && settle(region.state)) return;
    stop = region.onState(settle);
  });

  const files = await connect(context.runtime.sidecar(FILES_SIDECAR), context.surfaceId, (body) => {
    if (body.changed !== undefined) {
      diskChanged().catch((error) => context.tab.error(`다시 읽지 못했습니다 · ${messageText(error)}`));
      return;
    }
    emitEvent("error", "plugin.hwp.watch.failed", { path, error: String(body.error) });
    context.tab.error(`파일 감시가 멈췄습니다 · ${body.error}`);
  });
  /** Reads the file through the files sidecar; reason is start, reload or change. */
  const read = async (reason, cids = []) => {
    const start = performance.now();
    try {
      const body = await files.request({ operation: "readBytes", path }, cids);
      emitEvent("debug", "plugin.hwp.read", () => ({ path, reason, size: base64Size(body.data), micros: microsSince(start), ok: true }), cids);
      return body;
    } catch (error) {
      emitEvent("warn", "plugin.hwp.read", { path, reason, micros: microsSince(start), ok: false, error: errorText(error) });
      throw error;
    }
  };

  /** Opens the bytes of a read in the editor and discards its edits. */
  const open = async (body) => {
    const start = performance.now();
    let pageCount;
    try {
      ({ pageCount } = await request("loadFile", { data: Array.from(fromBase64(body.data)), fileName: name,
        skipUnsavedGuard: true, suppressDialogs: true }));
    } catch (error) {
      emitEvent("warn", "plugin.hwp.render", { path, micros: microsSince(start), ok: false, error: errorText(error) });
      throw error;
    }
    emitEvent("debug", "plugin.hwp.render", { path, pages: pageCount, micros: microsSince(start), ok: true });
    diskVersion = body.version;
    showBanner(null);
    publish({ version: body.version, pages: pageCount, disk: "same" });
    setModified(false);
  };

  async function diskChanged() {
    const body = await read("change");
    if (body.version === state.version) return;
    emitEvent("info", "plugin.hwp.disk.changed", { path, modified: state.modified, action: state.modified ? "banner" : "reload" });
    if (!state.modified) {
      await open(body);
      return;
    }
    diskVersion = body.version;
    publish({ disk: "changed" });
    showBanner("디스크의 파일이 바뀌었습니다");
  }

  const startWatch = async () => {
    const watchStart = performance.now();
    try {
      await files.request({ operation: "watch", paths: [path] });
    } catch (error) {
      emitEvent("warn", "plugin.hwp.watch", { path, micros: microsSince(watchStart), ok: false, error: errorText(error) });
      throw error;
    }
    emitEvent("info", "plugin.hwp.watch", { path, micros: microsSince(watchStart), ok: true });
  };

  // The first save of a blank document: the file that core.file.place answers is written in the format of its extension;
  // a file that exists there is written over, because the save panel asked the person to replace it.
  const saveNew = async () => {
    const placeStart = performance.now();
    let chosen;
    try {
      ({ path: chosen } = await context.runtime.command("core.file.place", { name: NEW_NAME }));
    } catch (error) {
      emitEvent("warn", "plugin.hwp.place", { name: NEW_NAME, path: null, micros: microsSince(placeStart), ok: false, error: errorText(error) });
      context.tab.error(`저장하지 못했습니다 · ${messageText(error)}`);
      throw error;
    }
    emitEvent("info", "plugin.hwp.place", { name: NEW_NAME, path: chosen, micros: microsSince(placeStart), ok: true });
    if (chosen === null) return { version: null };
    const start = performance.now();
    let chosenFormat = null;
    try {
      chosenFormat = formatOf(chosen);
      const bytes = exportedBytes(await request(EXPORTS[chosenFormat]), EXPORTS[chosenFormat]);
      const write = (expect) => files.request({ operation: "writeBytes", path: chosen, data: toBase64(bytes), expect });
      let reply;
      try {
        reply = await write(null);
      } catch (error) {
        if (!String(error.message).startsWith("exists")) throw error;
        reply = await write((await files.request({ operation: "readBytes", path: chosen })).version);
      }
      path = chosen;
      format = chosenFormat;
      name = path.slice(path.lastIndexOf("/") + 1);
      context.tab.title(name);
      context.tab.state.write({ path });
      diskVersion = reply.version;
      const notified = await notifySaved();
      publish({ path, format, version: reply.version, disk: "same" });
      setModified(false);
      if (notified) context.tab.error(null);
      emitEvent("info", "plugin.hwp.save", { path, format, overwrite: false, size: bytes.length, micros: microsSince(start), ok: true });
      await startWatch();
      return { version: reply.version };
    } catch (error) {
      emitEvent("warn", "plugin.hwp.save", { path: chosen, format: chosenFormat, overwrite: false, micros: microsSince(start), ok: false,
        error: errorText(error) });
      context.tab.error(`저장하지 못했습니다 · ${messageText(error)}`);
      throw error;
    }
  };

  // The editor is told of a file after the file is written, so a failure of this notice leaves the file saved. The failure is
  // shown as its own error, and the save does not fail; the result tells whether the notice was delivered.
  const notifySaved = async () => {
    try {
      await request("notifySaved", { fileName: name });
      return true;
    } catch (error) {
      emitEvent("warn", "plugin.hwp.notify", { path, error: errorText(error) });
      context.tab.error(`저장했지만 편집기에 알리지 못했습니다 · ${messageText(error)}`);
      return false;
    }
  };

  save = async ({ overwrite = false } = {}) => {
    if (typeof overwrite !== "boolean") throw new TypeError("hwp.save requires overwrite as true or false");
    if (path === null) return saveNew();
    const start = performance.now();
    let cids = [];
    try {
      const bytes = exportedBytes(await request(EXPORTS[format]), EXPORTS[format]);
      // The operation starts after the export, before its first sidecar send and record.
      cids = await context.runtime.beginOperation("operation", { kind: "save", path, overwrite });
      const reply = await files.request({ operation: "writeBytes", path, data: toBase64(bytes),
        expect: overwrite ? diskVersion : state.version }, cids);
      diskVersion = reply.version;
      const notified = await notifySaved();
      showBanner(null);
      publish({ version: reply.version, disk: "same" });
      setModified(false);
      if (notified) context.tab.error(null);
      emitEvent("info", "plugin.hwp.save", { path, format, overwrite, size: bytes.length, micros: microsSince(start), ok: true }, cids);
      return { version: reply.version };
    } catch (error) {
      emitEvent("warn", "plugin.hwp.save", { path, format, overwrite, micros: microsSince(start), ok: false, error: errorText(error) }, cids);
      context.tab.error(`저장하지 못했습니다 · ${messageText(error)}`);
      throw error;
    }
  };

  const reload = async () => {
    if (path === null) throw new Error("a blank document has no file to read");
    try {
      const cids = await context.runtime.beginOperation("operation", { kind: "reload", path });
      const body = await read("reload", cids);
      await open(body);
      context.tab.error(null);
      return { version: body.version };
    } catch (error) {
      context.tab.error(`다시 읽지 못했습니다 · ${messageText(error)}`);
      throw error;
    }
  };

  // A region that restored the session history of an unloaded tab loads the editor page itself, and a load would add an entry
  // after it (core docs/spec/plugins.md#memory-saver).
  if (!region.history) await region.load(address);
  await loaded;
  setPhase("starting");
  // No event reports that a loaded page never posts listening, so the wait has a bound: the scripts of the page have run
  // when the load reports it, and the message follows them.
  let bound;
  await Promise.race([listening, new Promise((resolve, reject) => {
    bound = setTimeout(() => reject(new Error(`the editor page loaded and did not post listening within ${LISTENING_LIMIT_MS / 1000} s`)), LISTENING_LIMIT_MS);
  })]).finally(() => clearTimeout(bound));
  await request("ready");
  if (path === null) {
    // The editor creates the blank document with its own command file:new-doc.
    setPhase("opening");
    await request("automation.execute", { id: "file:new-doc" });
    publish({ pages: await request("pageCount") });
    setModified(false);
  } else {
    setPhase("reading");
    const openCids = await context.runtime.beginOperation("operation", { kind: "open", path });
    const body = await read("start", openCids);
    setPhase("opening");
    await open(body);
    await startWatch();
  }

  /** The handler of the command `name` that stores its result with the time. */
  const recorded = (name, run) => async (params) => {
    const start = performance.now();
    try {
      const result = await run(params);
      emitEvent("debug", "plugin.hwp.command", { path, name, micros: microsSince(start), ok: true });
      return result;
    } catch (error) {
      emitEvent("warn", "plugin.hwp.command", { path, name, micros: microsSince(start), ok: false, error: errorText(error) });
      throw error;
    }
  };
  expose.command("hwp.save", recorded("hwp.save", save));
  expose.command("hwp.reload", recorded("hwp.reload", reload));
  expose.command("hwp.request", recorded("hwp.request", ({ method, params } = {}) => request(method, params)));
  let disposeDiagnostics = null;
  if (context.diagnostics !== null) {
    if (typeof context.diagnostics.attach !== "function") throw new TypeError("the HWP diagnostics declaration has no attach function");
    disposeDiagnostics = await context.diagnostics.attach({ context, document: root.ownerDocument, documentRegion: region });
    if (typeof disposeDiagnostics !== "function") throw new TypeError("the HWP diagnostics attach function must return its disposer");
  }
  for (const element of root.querySelectorAll("[data-expose]")) expose.dom(element.dataset.expose, element);

  // save and reload show their failures as the tab error, so a control that runs them does not report them again.
  const shown = () => {};
  await expose.bind(frame, "hwp.save", {}, { event: "keydown", failed: shown,
    when: (event) => event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.code === "KeyS" && (event.preventDefault(), true) });
  await expose.bind(banner.querySelector('[data-expose="hwp.reload"]'), "hwp.reload", {}, { failed: shown });
  await expose.bind(banner.querySelector('[data-expose="hwp.overwrite"]'), "hwp.save", { overwrite: true }, { failed: shown });

  writeTabState();
  setPhase("ready");
  context.status.report("ready");
  return {
    async dispose() {
      emitEvent("info", "plugin.hwp.close", { path });
      await disposeDiagnostics?.();
      stopMessages();
      listeners.clear();
      files.dispose();
      for (const { reject } of pending.values()) reject(new Error("the hwp surface closed before rhwp-studio answered"));
      pending.clear();
      await composition.dispose();
      await expose.dispose();
      root.replaceChildren();
    },
  };
}
