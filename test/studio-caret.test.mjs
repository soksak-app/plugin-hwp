import assert from "node:assert/strict";
import test from "node:test";
import { window } from "./dom.mjs";

// The caret of rhwp-studio as src/engine/caret-renderer.ts has it. Its blink timer is the state that the test reads: startBlink
// starts the timer and stopBlink clears it, so blinking() tells whether a tick of the caret is due, and no tick runs in the test.
class Caret {
  blinkTimer = null;
  currentRect = null;
  element = window.document.createElement("div");
  show(rect) {
    this.currentRect = rect;
    this.startBlink();
  }
  update(rect) {
    this.currentRect = rect;
    this.startBlink();
  }
  hide() {
    this.stopBlink();
    this.currentRect = null;
  }
  startBlink() {
    this.stopBlink();
    this.element.style.opacity = "1";
    this.blinkTimer = {};
  }
  stopBlink() {
    this.blinkTimer = null;
  }
  blinking() {
    return this.blinkTimer !== null;
  }
}

globalThis.location = window.location;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
const page = { visibility: "visible", focused: true };
Object.defineProperty(window.document, "visibilityState", { configurable: true, get: () => page.visibility });
window.document.hasFocus = () => page.focused;
const caret = new Caret();
let handler = null;
window.rhwpStudio = {
  automation: { getContext: () => ({ isDirty: false, hasSelection: false }) },
  plugins: { deps: { getInputHandler: () => handler } },
};
// Each error that the script posts is recorded when it posts it; the window still delivers it.
const errors = [];
const postMessage = window.postMessage.bind(window);
window.postMessage = (message, ...rest) => {
  if (message?.type === "soksak-hwp" && message.event === "error") errors.push(message.message);
  postMessage(message, ...rest);
};
await import("../build/test/ui/studio-host.js");

const setVisibility = (visibility) => {
  page.visibility = visibility;
  window.document.dispatchEvent(new window.Event("visibilitychange"));
};
const setFocus = (focused) => {
  page.focused = focused;
  window.dispatchEvent(new window.Event(focused ? "focus" : "blur"));
};
/**
 * A reply of the editor, the first moment at which the script can have the input handler of a page that started. The window
 * dispatches the event to the listener of the script before it returns.
 */
function reply() {
  window.dispatchEvent(new window.MessageEvent("message", { source: window, data: { type: "rhwp-response" } }));
}

test("a page without the input handler yet has no caret to hold and posts no error", async () => {
  reply();
  assert.deepEqual(errors, []);
});

test("the caret keeps blinking in a visible page that has the focus", async () => {
  handler = { caret };
  caret.show({ pageIndex: 0 });
  reply();
  assert.equal(caret.blinking(), true);
});

test("a caret that started before the script had it stops at the first reply of a page without the focus", async () => {
  const early = new Caret();
  const held = handler;
  handler = { caret: early };
  window.rhwpStudio = { ...window.rhwpStudio };
  early.show({ pageIndex: 0 });
  page.focused = false;
  await import("../build/test/ui/studio-host.js?early");
  reply();
  assert.equal(early.blinking(), false);
  early.hide();
  page.focused = true;
  handler = held;
});

test("a hidden page runs no tick of the caret and shows the caret, and the caret blinks again when the page returns", async () => {
  setVisibility("hidden");
  assert.equal(caret.blinking(), false);
  assert.equal(caret.element.style.opacity, "1");
  setVisibility("visible");
  assert.equal(caret.blinking(), true);
});

test("a page without the focus runs no tick of the caret, and the caret blinks again with the focus", async () => {
  setFocus(false);
  assert.equal(caret.blinking(), false);
  assert.equal(caret.element.style.opacity, "1");
  setFocus(true);
  assert.equal(caret.blinking(), true);
});

test("a move of the caret in a hidden page starts no tick", async () => {
  setVisibility("hidden");
  caret.update({ pageIndex: 0 });
  assert.equal(caret.blinking(), false);
  setVisibility("visible");
  assert.equal(caret.blinking(), true);
});

test("a caret that the editor hid stays still when the page returns", async () => {
  setFocus(false);
  caret.hide();
  setFocus(true);
  assert.equal(caret.blinking(), false);
  caret.show({ pageIndex: 0 });
  assert.equal(caret.blinking(), true);
  caret.hide();
});

test("a page whose input handler has no caret says so", async () => {
  // A fresh import holds a new script over a handler of another shape.
  handler = { caret: {} };
  window.rhwpStudio = { ...window.rhwpStudio };
  await import(`../build/test/ui/studio-host.js?shape`);
  reply();
  assert.ok(errors.some((message) => message.includes("caret")), `errors ${JSON.stringify(errors)}`);
});
