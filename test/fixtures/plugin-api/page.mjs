// The page of a view of this plugin for the tests. It is a jsdom window on soksak://hwp/ui/index.html, in which the page module is
// imported into the test process with the globals of the window bound, as a browser page binds the members of its window to its
// global object. The window carries what the host provides to a page before any page script (core docs/spec/native-surfaces.md,
// view surfaces): the sok-view message handler, the theme in window.sokTheme and the start values in window.sokSurface. The
// plugin API of the page is the fixture of this folder, which the resolve hook maps to the specifiers of the page; its calls and
// answers are in view.api (api.mjs). The timers and animation frames that the page starts are recorded in view.observed.
import { readFile } from "node:fs/promises";
import { join, relative, resolve, sep, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { createApi } from "./api.mjs";

const PLUGIN = "hwp";
const PLUGIN_ROOT = new URL("../../../", import.meta.url);
// The theme of the window: the frozen value {scheme, tokens} that the host sets before any page script.
const THEME = Object.freeze({ scheme: "light", tokens: Object.freeze({}) });

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

/** The view that the page code in the test process belongs to: the last opened view that is still open. */
export function currentView() {
  const view = openViews.at(-1);
  if (view === undefined) throw new Error("the plugin API fixture serves a page only while a view of openPage is open");
  return view;
}

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
 * Opens a view of the plugin and returns it.
 *
 *     start        the start values that the host freezes into window.sokSurface {surface, params, origin, project, declarations,
 *                  diagnostics}, or null for a view without start values
 *     theme        the value of window.sokTheme, or null for a view that the host has not themed
 *     arrangement  what the test arranges for the plugin API of the page (api.mjs)
 *     layout       {width, height, rect} of the document, or {}
 *     root         the folder of the plugin, which window.fetch serves
 *     html         the markup of the document
 *
 * The view has these members: window, observed {timers}, api (the plugin API of the page), settled(), load(url) and close().
 */
export async function openPage({
  start = null, theme = THEME, arrangement = {}, layout = {}, root = PLUGIN_ROOT, html = "<!doctype html><body></body>",
} = {}) {
  const view = { window: null, observed: { timers: [] }, api: null };
  let loaded = false;
  let closed = false;
  const dom = new JSDOM(html, {
    url: `soksak://${PLUGIN}/ui/index.html`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    beforeParse(window) {
      // The sok-view handler is the one the page passes to createViewBridge. The bridge of the fixture answers the calls of the
      // page, so a message that the page posts on the handler itself is a use that no test arranged.
      window.webkit = {
        messageHandlers: {
          "sok-view": {
            postMessage() { throw new Error("the page posted on the sok-view handler: the plugin API fixture answers the calls of the page"); },
          },
        },
      };
      if (theme !== null) window.sokTheme = theme;
      if (start !== null) window.sokSurface = Object.freeze(structuredClone(start));
    },
  });
  view.window = dom.window;
  view.api = createApi(view, arrangement);
  bindGlobals(view);
  observeFrames(view);
  serveFiles(view, root);
  applyLayout(view, layout);
  return Object.assign(view, {
    /** Waits until the page has made each call it makes in a turn, and the answers to them have been delivered. */
    settled: () => view.api.settled(),
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
