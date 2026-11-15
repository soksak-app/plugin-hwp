// The host side of a view page of this plugin for the tests. It is a jsdom window on soksak://hwp/, which answers the
// view channel of the page as the host does (core docs/spec/native-surfaces.md, View channel, View call and View events):
//
//   - the window carries the sok-view message handler that the page posts to, and the start script of the plugin API
//     package, which the host injects before any page script; the start values are frozen into window.sokSurface;
//   - each call request {sok, id, command, params[, cids]} of the page is recorded, then answered with the reply
//     {sok, reply, result} or {sok, reply, error: {code, message}} that the page receives as a window message;
//   - each host message {sok, event, data} is delivered to the page as a window message event whose source is the window;
//   - the timers and animation frames that the page starts, the log records of the page and the sidecar sends are recorded
//     in the open view, and the commands and sidecars of the host answer the calls that the test declares.
//
// The fixture reads the wire of the page from the contract only; it imports no module of core, and the test files import
// no module of the plugin API testing entry. The page module is imported into the test process with the globals of the
// window bound, as a browser page binds the members of its window to its global object.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep, isAbsolute } from "node:path";
import { setImmediate as turn } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const PLUGIN = "hwp";
const PLUGIN_ROOT = new URL("../../", import.meta.url);
const ERROR_CODE = -32000;
// The core declarations that every view declares with its exposes: the document and input statuses and the hit command of the
// surface (core docs/spec/exposure.md, core surface entries). The start values carry them with the exposes of the plugin.
const CORE_EXPOSES = Object.freeze({
  status: Object.freeze([{ name: "core.surface.document" }, { name: "core.surface.input" }]),
  commands: Object.freeze([{ name: "core.surface.hit" }, { name: "core.surface.clock" }]),
  element: Object.freeze([]),
});
// The theme of the window: the frozen value {scheme, tokens} that the host sets before any page script (core docs/spec/native-surfaces.md, Theme).
const THEME = Object.freeze({ scheme: "light", tokens: Object.freeze({}) });

// The start script of the view channel is the file of the plugin API package that the host injects before any page script.
const START_SCRIPT = readFileSync(
  join(dirname(createRequire(import.meta.url).resolve("@soksak/plugin-api/package.json")), "view-start.js"),
  "utf8",
);

// The names that the test process defines keep their process value, because the window does not bind them. The timers and fetch
// are wrapped or served by this fixture.
const TIMERS = ["setTimeout", "setInterval"];
const SHADOWED = ["fetch"];
// The open views, the last opened last. The global names answer from the last view, so each page reads its own window.
const openViews = [];
// The descriptors of the global names before the first view bound them; null while no view is open.
let savedGlobals = null;
// The number of timer and frame calls of the fixture itself, which the recording skips.
let internalCalls = 0;
// The number of page loads in the process; each load imports the page module under a URL that no earlier load has.
let pageLoads = 0;

/** The declarations of the plugin with the core declarations of the view. */
const declarationsOf = (exposes = {}) => ({
  status: [...(exposes.status ?? []), ...CORE_EXPOSES.status],
  commands: [...(exposes.commands ?? []), ...CORE_EXPOSES.commands],
  element: [...(exposes.element ?? []), ...CORE_EXPOSES.element],
});

/** The names of a window and of its prototype chain that the test process does not define, and the names that the fixture serves. */
const windowNames = (window) => {
  const names = new Set(SHADOWED);
  for (let object = window; Object.getPrototypeOf(object) !== null; object = Object.getPrototypeOf(object)) {
    for (const name of Object.getOwnPropertyNames(object)) names.add(name);
  }
  return [...names].filter((name) => !(name in globalThis) || SHADOWED.includes(name));
};

/** Binds the window names to the global object, and the timers of the process to the recording of the open view. */
function bindGlobals(view) {
  if (openViews.length === 0) {
    savedGlobals = new Map();
    for (const name of windowNames(view.window)) {
      savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() {
          const current = openViews.at(-1).window;
          const value = current[name];
          return typeof value === "function" && !("prototype" in value) ? value.bind(current) : value;
        },
        set(value) { openViews.at(-1).window[name] = value; },
      });
    }
    for (const name of TIMERS) {
      savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      const original = globalThis[name];
      Object.defineProperty(globalThis, name, {
        configurable: true,
        writable: true,
        value: function started(...args) {
          if (internalCalls === 0) openViews.at(-1)?.observed.timers.push({ kind: name, delay: args[1] ?? 0 });
          return original.apply(this, args);
        },
      });
    }
  }
  openViews.push(view);
}

/** Ends the binding of a view. The saved descriptors come back when the last open view closes. */
function releaseGlobals(view) {
  const index = openViews.indexOf(view);
  if (index === -1) throw new Error("the view is not open");
  openViews.splice(index, 1);
  if (openViews.length > 0) return;
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor === undefined) delete globalThis[name];
    else Object.defineProperty(globalThis, name, descriptor);
  }
  savedGlobals = null;
}

/** Records each animation frame that the page starts, and starts it as the window does. */
function observeFrames(view) {
  const original = view.window.requestAnimationFrame;
  view.window.requestAnimationFrame = function started(...args) {
    view.observed.timers.push({ kind: "requestAnimationFrame", delay: null });
    internalCalls += 1;
    try {
      return original.apply(this, args);
    } finally {
      internalCalls -= 1;
    }
  };
}

/** Serves the files of the plugin folder to window.fetch under soksak://hwp/<path>. An outside path or a missing file answers 404. */
function serveFiles(view, root) {
  const folder = resolve(fileURLToPath(root));
  view.window.fetch = async (input) => {
    const url = new URL(String(input), view.window.location.href);
    if (url.protocol !== "soksak:" || url.host !== PLUGIN) return new Response(null, { status: 404 });
    const file = join(folder, decodeURIComponent(url.pathname));
    const path = relative(folder, file);
    if (path === "" || path.split(sep)[0] === ".." || isAbsolute(path)) return new Response(null, { status: 404 });
    try {
      return new Response(await readFile(file), { status: 200 });
    } catch (error) {
      if (error.code === "ENOENT") return new Response(null, { status: 404 });
      throw error;
    }
  };
}

/**
 * The resize observer of a WebKit view, which jsdom does not provide. jsdom has no layout, so the observer keeps its targets and reports
 * no size; the sizes of the view are the data of layout.
 */
class ResizeObserverFixture {
  #targets = new Set();
  constructor(callback) {
    if (typeof callback !== "function") throw new TypeError("ResizeObserver requires a callback function");
  }
  observe(target) { this.#targets.add(target); }
  unobserve(target) { this.#targets.delete(target); }
  disconnect() { this.#targets.clear(); }
}

/**
 * jsdom has no layout engine. The size of the view and the rectangle of each element are the data of layout: {width, height} sets the
 * inner size and the client size of the document, and rect(element) answers getBoundingClientRect when it is given.
 */
function applyLayout(view, layout) {
  const { window } = view;
  if (layout.width !== undefined) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: layout.width });
    Object.defineProperty(window.document.documentElement, "clientWidth", { configurable: true, value: layout.width });
  }
  if (layout.height !== undefined) {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: layout.height });
    Object.defineProperty(window.document.documentElement, "clientHeight", { configurable: true, value: layout.height });
  }
  if (layout.rect !== undefined) window.Element.prototype.getBoundingClientRect = function rect() { return layout.rect(this); };
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: ResizeObserverFixture });
  // The visual viewport of a WebKit view, which jsdom does not provide: an event target of the size of the layout at scale 1.
  const visualViewport = new window.EventTarget();
  Object.assign(visualViewport, {
    width: layout.width ?? window.innerWidth,
    height: layout.height ?? window.innerHeight,
    offsetLeft: 0,
    offsetTop: 0,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
  });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });
}

/**
 * Opens the view page of the plugin in the host mode of the fixture and returns the view.
 *
 *     start    the start values that the host freezes into window.sokSurface {surface, params, origin, project, diagnostics}, or null
 *              for a view without start values; the declarations of host.declarations with the core declarations are added to them
 *     host     the host table that answers the calls of the page:
 *              surface       the surface id
 *              declarations  the exposure declarations of the plugin (start values)
 *              sidecars      the sidecar names that the plugin declares
 *              sidecar       {name: body => void}, which answers each sidecar send of the page
 *              native        {name: payload => value}, which answers runtime.native.call with the name
 *              commands      {name: (params, context) => value}, which answers each command call of the page with the name
 *              state         {read: () => value, write: (value) => void}, which answers the tab state calls
 *              composition   {declaration, place, report, document: {attach, load, zoom, go, post, subscribe, unsubscribe, detach}}
 *              refuse        {route: message}, which refuses each call of the page to the named route with the message
 *     layout   {width, height, rect} of the document, or {}
 *     root     the folder of the plugin, which window.fetch serves
 *     html     the markup of the document
 *
 * The view has these members: window, observed {timers, commands, sidecar}, calls (the call requests of the page), events (the log
 * records of the page), errors (the view.error reasons and the runtime.error records), settled(), push(event, data),
 * sidecarMessage(sidecar, id, {body, cids}), request(command, params), load(url) and close().
 */
export async function openPageHost({
  start = null, host = {}, layout = {}, root = PLUGIN_ROOT, html = "<!doctype html><body></body>",
} = {}) {
  const view = {
    window: null,
    observed: { timers: [], commands: [], sidecar: [] },
    calls: [],
    events: [],
    errors: [],
    ready: null,
  };
  // The messages of the page received, and the answers that wait for their delivery in a later task.
  let received = 0;
  let deferred = 0;
  let requestIds = 0;
  const replies = new Map();
  let loaded = false;
  let closed = false;

  const dom = new JSDOM(html, {
    url: `soksak://${PLUGIN}/ui/index.html`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    beforeParse(window) {
      // The sok-view handler is installed before the start script runs, as the host installs it in the view configuration.
      window.webkit = {
        messageHandlers: {
          "sok-view": { postMessage: (message) => onPageMessage(structuredClone(message)) },
        },
      };
      window.sokTheme = THEME;
      if (start !== null) {
        window.sokSurface = Object.freeze({ ...structuredClone(start), declarations: declarationsOf(host.declarations) });
      }
    },
  });
  view.window = dom.window;
  bindGlobals(view);
  observeFrames(view);
  serveFiles(view, root);
  applyLayout(view, layout);
  // The start script runs in the window before any page script, which is the order that the host keeps.
  view.window.eval(START_SCRIPT);

  /** Delivers a host message to the page as a window message event whose source is the window. */
  function deliver(message) {
    view.window.dispatchEvent(new view.window.MessageEvent("message", {
      data: structuredClone(message),
      source: view.window,
      origin: view.window.location.origin,
    }));
  }

  /** Answers one call of the page through the host table, and sends the reply to the page. */
  function answer(id, command, params, cids) {
    // The page matches the reply of its own call by the id of the call: {id, result} or {id, error}.
    const reply = (payload) => deliver({ sok: 1, id, ...payload });
    // A refusal of the route, thrown or rejected, is the error of the reply. The outcome is handled at once, so no rejection is unhandled.
    const answered = new Promise((resolve) => resolve(refusal(command) ?? route(command, params, cids))).then(
      (result) => ({ result: result === undefined ? null : result }),
      (error) => ({ error: { code: ERROR_CODE, message: String(error?.message ?? error) } }),
    );
    // A host answers in a task of its own, after the call has been received, so the page never receives its answer within the call.
    deferred += 1;
    turn().then(async () => {
      deferred -= 1;
      reply(await answered);
    });
  }

  /** The refusal of a route by the host table: the message of the refusal, thrown as the error of the route, or undefined. */
  function refusal(command) {
    if (host.refuse?.[command] === undefined) return undefined;
    throw new Error(host.refuse[command]);
  }

  /** The route of one call: the host table answers the names of the view channel and the commands the test declares. */
  function route(command, params, cids) {
    // The clock of the document: its page identity, its time origin and performance.now() (core docs/spec/exposure.md, core surface entries).
    if (command === "core.surface.clock") {
      return { page: view.window.sokView.page, timeOrigin: view.window.performance.timeOrigin, now: view.window.performance.now() };
    }
    if (command.startsWith("core.") || host.commands?.[command] !== undefined) {
      if (host.commands?.[command] === undefined) throw new Error(`view call ${command} is not a command of ${PLUGIN}`);
      view.observed.commands.push({ name: command, params: structuredClone(params) });
      return host.commands[command](params, { cids });
    }
    if (command.startsWith("document.")) {
      const action = command.slice("document.".length);
      const region = host.composition?.document?.[action];
      if (region === undefined) throw new Error(`view call ${command} has no host route`);
      const { name, ...rest } = params;
      return region(name, ...Object.values(rest));
    }
    switch (command) {
      case "runtime.log": return runtimeLog(params);
      case "runtime.error":
        view.errors.push({ where: params.where, text: params.text });
        return null;
      case "runtime.native.on":
      case "runtime.sidecar.on":
      case "runtime.sidecar.onFailure":
      case "runtime.command.register":
        return null;
      case "runtime.sidecar.send": return sidecarSend(params, cids);
      case "runtime.native.call": {
        const handler = host.native?.[params.name];
        if (handler === undefined) throw new Error(`view call runtime.native.call ${params.name} has no host route`);
        return handler(params.payload);
      }
      case "runtime.command.run": {
        if (host.commands?.[params.name] === undefined) {
          throw new Error(`view call runtime.command.run ${params.name} is not a command of ${PLUGIN}`);
        }
        view.observed.commands.push({ name: params.name, params: structuredClone(params.params) });
        return host.commands[params.name](params.params, { cids });
      }
      case "tab.state.read": return host.state.read();
      case "tab.state.write": return host.state.write(params);
      case "composition.declaration": return host.composition.declaration();
      case "composition.place": return host.composition.place(params);
      case "composition.report": return host.composition.report(params);
      case "tab.title":
      case "tab.footer":
      case "tab.notify":
      case "tab.modified":
      case "tab.error":
      case "tab.keep":
      case "tab.focus":
      case "surface.menu":
        return null;
      default:
        throw new Error(`view call ${command} has no host route`);
    }
  }

  /** The log route: the clock answers the time of the host, and a batch stores its records in the order of the page. */
  function runtimeLog(params) {
    if (params.action === "clock") {
      const ns = process.hrtime.bigint();
      const { timeOrigin } = view.window.performance;
      return { ts_us: Math.round((timeOrigin + view.window.performance.now()) * 1000), mono_ns: Number(ns) };
    }
    if (params.action === "batch") {
      for (const record of params.events) view.events.push(structuredClone(record));
      return null;
    }
    throw new Error(`runtime.log action must be clock or batch, not ${params.action}`);
  }

  /** The sidecar route: the send is recorded, and the declared sidecar answers it. */
  function sidecarSend({ id, sidecar, body, cids }) {
    if (!(host.sidecars ?? []).includes(sidecar)) throw new Error(`view call runtime.sidecar.send: ${sidecar} is not declared by ${PLUGIN}`);
    view.observed.sidecar.push({ id, sidecar, body: structuredClone(body), cids: cids ?? [] });
    const handler = host.sidecar?.[sidecar];
    if (handler === undefined) throw new Error(`sidecar ${sidecar} has no host route`);
    handler(structuredClone(body));
    return null;
  }

  /** Reads one message that the page posts through the sok-view handler. */
  function onPageMessage(message) {
    received += 1;
    if (message.event === "view.ready") {
      view.ready = { document: message.document, plugin: message.plugin };
      // The host sends the current theme after each ready message (core docs/spec/native-surfaces.md, Theme).
      deliver({ sok: 1, event: "theme", data: THEME });
      return;
    }
    if (message.event === "view.error") {
      view.errors.push({ reason: message.reason });
      return;
    }
    if (message.sok !== 1) {
      view.errors.push({ reason: `message without the sok marker: ${JSON.stringify(message)}` });
      return;
    }
    if (Number.isInteger(message.reply)) {
      const pending = replies.get(message.reply);
      if (pending === undefined) throw new Error(`reply ${message.reply} has no request`);
      replies.delete(message.reply);
      if ("error" in message) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }
    if (message.cancel === true) return;
    if (!Number.isInteger(message.id) || typeof message.command !== "string") {
      throw new Error(`call request is invalid: ${JSON.stringify(message)}`);
    }
    view.calls.push({ command: message.command, params: message.params, cids: message.cids });
    answer(message.id, message.command, message.params, message.cids);
  }

  return Object.assign(view, {
    /** Waits until the page has made each call it makes in a turn, and the answers to them have been delivered. */
    async settled() {
      let seen;
      do {
        seen = received;
        await turn();
      } while (received !== seen || deferred > 0);
    },
    /** Delivers a host event {sok, event, data} to the page. */
    push(event, data) {
      if (!view.ready) throw new Error(`view channel: the view has no ready document`);
      deliver({ sok: 1, event, data });
    },
    /** Delivers a sidecar message of the session id, which the page receives as sidecar.message. */
    sidecarMessage(sidecar, id, { body, cids = [] }) {
      if (!(host.sidecars ?? []).includes(sidecar)) throw new Error(`${sidecar} is not declared by ${PLUGIN}`);
      deliver({ sok: 1, event: "sidecar.message", data: { id, cids, body } });
    },
    /** Sends a command request to the page and resolves with the reply of the page, or rejects with its error. */
    request(command, params) {
      const id = ++requestIds;
      const reply = new Promise((resolve, reject) => replies.set(id, { resolve, reject }));
      deliver({ sok: 1, id, command, params: structuredClone(params) });
      return reply;
    },
    /** Imports the page module at the URL into the window. Each load imports the module anew; a view loads one page module. */
    async load(url) {
      if (!(url instanceof URL)) throw new TypeError(`view.load requires the URL of the page module, found ${typeof url}`);
      if (loaded) throw new Error(`view ${PLUGIN} already has a page loaded: a view loads one page module`);
      loaded = true;
      const target = new URL(url);
      target.searchParams.set("view", String(++pageLoads));
      return import(target.href);
    },
    /** Ends the view: the page receives pagehide, and the window and the global names of the view end. */
    async close() {
      if (closed) return;
      closed = true;
      view.window.dispatchEvent(new view.window.Event("pagehide"));
      releaseGlobals(view);
      view.window.close();
    },
  });
}
