// The built editor page on a jsdom document at a plugin address: the browser names that its script uses, each one recording the
// address that it asks for. Nothing leaves the machine: the recording fetch answers only files of the plugin, and the recording
// FontFace loads nothing.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const studio = path.join(root, "ui", "studio");
export const page = path.join(studio, "index.html");
export const address = "https://plugin.test/ui/studio/index.html?chrome=embed";
export const pluginOrigin = new URL(address).origin;

export const inPlugin = (url) => {
  const parsed = new URL(url);
  if (parsed.protocol === "file:") return fileURLToPath(parsed).startsWith(`${root}${path.sep}`);
  return parsed.origin === pluginOrigin;
};

const pluginFile = (url) => {
  const parsed = new URL(url);
  return parsed.protocol === "file:" ? fileURLToPath(parsed) : path.join(root, parsed.pathname);
};

/** Gives the script of the page the browser names that it uses, each one recording the address that it asks for. */
export function installPage(window, requested) {
  const record = (url) => {
    const href = new URL(String(url), address).href;
    requested.push(href);
    return href;
  };
  const noObserver = class { observe() {} unobserve() {} disconnect() {} };
  const recorders = {
    FontFace: class {
      constructor(family, source) {
        this.family = family;
        this.status = "unloaded";
        for (const [, url] of String(source).matchAll(/url\(["']?([^"')]+)/g)) record(url);
      }
      async load() {
        this.status = "loaded";
        return this;
      }
    },
    fetch: async (input) => {
      const href = record(input.url ?? input.href ?? input);
      if (!inPlugin(href) || !existsSync(pluginFile(href))) return new Response(null, { status: 404 });
      const type = href.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
      return new Response(readFileSync(pluginFile(href)), { headers: { "content-type": type } });
    },
    XMLHttpRequest: class {
      open(method, url) { record(url); }
      send() {}
      setRequestHeader() {}
      addEventListener() {}
    },
    WebSocket: class {
      constructor(url) { record(url); }
      close() {}
      addEventListener() {}
    },
  };
  window.document.fonts = Object.assign(new Set(), { check: () => false, ready: Promise.resolve(), addEventListener() {}, removeEventListener() {} });
  window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.ResizeObserver ??= noObserver;
  window.IntersectionObserver ??= noObserver;
  window.requestIdleCallback ??= (callback) => setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 0);
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.Element.prototype.checkVisibility = () => false;
  Object.assign(window, recorders);
  const shared = { ...recorders, window, self: window, document: window.document, location: window.location, navigator: window.navigator,
    localStorage: window.localStorage, sessionStorage: window.sessionStorage };
  const timer = (start) => (...args) => start(...args).unref();
  shared.setTimeout = timer(setTimeout);
  shared.setInterval = timer(setInterval);
  // The script starts a timer through window and clears it through the global, which in a browser are one pair of functions.
  window.setInterval = shared.setInterval;
  window.clearInterval = clearInterval;
  for (const name of Object.getOwnPropertyNames(window)) {
    if (name in globalThis) continue;
    if (/^[A-Z]|^(getComputedStyle|requestAnimationFrame|cancelAnimationFrame|requestIdleCallback|matchMedia|addEventListener|removeEventListener|postMessage|getSelection)$/.test(name)) {
      shared[name] = window[name];
    }
  }
  for (const [name, value] of Object.entries(shared)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
