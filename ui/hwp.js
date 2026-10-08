// The HWP surface: shows rhwp-studio, the editor of rhwp built into ui/studio (docs/studio.md), in the document region
// "studio", opens the .hwp or .hwpx file tab.params.path of the project in it through the files sidecar, and saves the
// document in its own format. The page talks to rhwp-studio with its embed requests {type: "rhwp-request", id, method,
// params}, which rhwp-studio answers with {type: "rhwp-response", id, result | error}, and receives the messages of
// ui/studio-host.js {type: "soksak-hwp", event}.
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

/* The embed request that exports each format. */
const EXPORTS = { hwp: "exportHwp", hwpx: "exportHwpx" };

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

export const fromBase64 = (text) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

export async function mount(root, context) {
  // default: a tab without params cannot name a file; core.file.open always passes {path}.
  const path = context.tab.params?.path;
  if (typeof path !== "string" || path === "") throw new Error("the hwp tab requires params.path");
  if (context.project === null) throw new Error("this window shows no project");
  const format = formatOf(path);
  const name = path.slice(path.lastIndexOf("/") + 1);
  context.tab.title(name);
  root.innerHTML = HTML;
  const frame = root.querySelector("#frame");
  const banner = root.querySelector("#banner");
  const address = `sok://${context.pluginId}/ui/studio/index.html?chrome=embed`;

  let state = { path, format, version: null, modified: false, selection: false, pages: 0, disk: "same", phase: "loading" };
  let diskVersion = null;
  const listeners = new Set();
  const publish = (change) => {
    state = { ...state, ...change };
    for (const fn of listeners) fn(state);
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
  /** Sends the embed request method with params to rhwp-studio and resolves its result. */
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = `${method}-${++next}`;
    pending.set(id, { resolve, reject });
    region.post({ type: "rhwp-request", id, method, params }).catch((failure) => {
      pending.delete(id);
      reject(failure);
    });
  });

  let save = null;
  const stopMessages = region.onMessage((message) => {
    // The region passes every message that the document posts to its own window, so it passes the requests of this
    // page back too.
    if (message?.type === "rhwp-request") return;
    if (message?.type === "rhwp-response") {
      const entry = pending.get(message.id);
      if (!entry) throw new Error(`rhwp-studio answered the unknown request ${message.id}`);
      pending.delete(message.id);
      if (message.error !== undefined) entry.reject(new Error(`rhwp-studio ${message.id}: ${message.error}`));
      else entry.resolve(message.result);
      return;
    }
    if (message?.type === "soksak-hwp" && message.event === "modified") return setModified(message.modified);
    if (message?.type === "soksak-hwp" && message.event === "selection") return publish({ selection: message.selection });
    // save shows its failure as the tab error.
    if (message?.type === "soksak-hwp" && message.event === "save") return void save().catch(() => {});
    if (message?.type === "soksak-hwp" && message.event === "error") return context.tab.error(`편집기 · ${message.message}`);
    throw new Error(`the hwp document posted an unknown message ${JSON.stringify(message)}`);
  });

  /** Resolves when the document region has loaded the editor page, and rejects with its load error. */
  const loaded = new Promise((resolve, reject) => {
    const stop = region.onState((current) => {
      if (current.url !== address || current.loading) return;
      stop();
      if (current.error !== null) reject(new Error(`the editor page did not load: ${current.error}`));
      else resolve();
    });
  });

  const files = await connect(context.runtime.sidecar(), context.surfaceId, (body) => {
    if (body.changed !== undefined) {
      diskChanged().catch((error) => context.tab.error(`다시 읽지 못했습니다 · ${error.message}`));
      return;
    }
    context.tab.error(`파일 감시가 멈췄습니다 · ${body.error}`);
  });
  const read = () => files.request({ operation: "readBytes", path });

  /** Opens the bytes of a read in the editor and discards its edits. */
  const open = async (body) => {
    const { pageCount } = await request("loadFile", { data: Array.from(fromBase64(body.data)), fileName: name,
      skipUnsavedGuard: true, suppressDialogs: true });
    diskVersion = body.version;
    showBanner(null);
    publish({ version: body.version, pages: pageCount, disk: "same" });
    setModified(false);
  };

  async function diskChanged() {
    const body = await read();
    if (body.version === state.version) return;
    if (!state.modified) {
      await open(body);
      return;
    }
    diskVersion = body.version;
    publish({ disk: "changed" });
    showBanner("디스크의 파일이 바뀌었습니다");
  }

  save = async ({ overwrite = false } = {}) => {
    if (typeof overwrite !== "boolean") throw new TypeError("hwp.save requires overwrite as true or false");
    try {
      const bytes = Uint8Array.from(await request(EXPORTS[format]));
      const reply = await files.request({ operation: "writeBytes", path, data: toBase64(bytes),
        expect: overwrite ? diskVersion : state.version });
      diskVersion = reply.version;
      await request("notifySaved", { fileName: name });
      showBanner(null);
      publish({ version: reply.version, disk: "same" });
      setModified(false);
      context.tab.error(null);
      return { version: reply.version };
    } catch (error) {
      context.tab.error(`저장하지 못했습니다 · ${error.message}`);
      throw error;
    }
  };

  const reload = async () => {
    try {
      const body = await read();
      await open(body);
      context.tab.error(null);
      return { version: body.version };
    } catch (error) {
      context.tab.error(`다시 읽지 못했습니다 · ${error.message}`);
      throw error;
    }
  };

  await region.load(address);
  await loaded;
  publish({ phase: "starting" });
  await request("ready");
  publish({ phase: "reading" });
  const body = await read();
  publish({ phase: "opening" });
  await open(body);
  await files.request({ operation: "watch", paths: [path] });

  expose.command("hwp.save", save);
  expose.command("hwp.reload", reload);
  expose.command("hwp.request", ({ method, params } = {}) => request(method, params));
  for (const element of root.querySelectorAll("[data-expose]")) expose.dom(element.dataset.expose, element);

  // save and reload show their failures as the tab error, so a control that runs them does not report them again.
  const shown = () => {};
  await expose.bind(frame, "hwp.save", {}, { event: "keydown", failed: shown,
    when: (event) => event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.code === "KeyS" && (event.preventDefault(), true) });
  await expose.bind(banner.querySelector('[data-expose="hwp.reload"]'), "hwp.reload", {}, { failed: shown });
  await expose.bind(banner.querySelector('[data-expose="hwp.overwrite"]'), "hwp.save", { overwrite: true }, { failed: shown });

  publish({ phase: "ready" });
  context.status.report("ready");
  return {
    async dispose() {
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
