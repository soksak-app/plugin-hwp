import assert from "node:assert/strict";
import test from "node:test";
import { window } from "./dom.mjs";

// The caret of rhwp-studio as src/engine/caret-renderer.ts has it, with a shorter timer so the test counts ticks quickly.
class Caret {
  blinkTimer = null;
  currentRect = null;
  ticks = 0;
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
    let visible = true;
    this.blinkTimer = setInterval(() => {
      this.ticks += 1;
      visible = !visible;
      this.element.style.opacity = visible ? "1" : "0";
    }, 2);
  }
  stopBlink() {
    if (this.blinkTimer !== null) {
      clearInterval(this.blinkTimer);
      this.blinkTimer = null;
    }
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
const errors = [];
window.addEventListener("message", (event) => {
  if (event.data?.type === "soksak-hwp" && event.data.event === "error") errors.push(event.data.message);
});
await import("../build/test/ui/studio-host.js");

const pass = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** The ticks of the caret over 40 ms. */
async function ticksOver() {
  const before = caret.ticks;
  await pass(40);
  return caret.ticks - before;
}
const setVisibility = (visibility) => {
  page.visibility = visibility;
  window.document.dispatchEvent(new window.Event("visibilitychange"));
};
const setFocus = (focused) => {
  page.focused = focused;
  window.dispatchEvent(new window.Event(focused ? "focus" : "blur"));
};
/** A reply of the editor, the first moment at which the script can have the input handler of a page that started. */
async function reply() {
  window.dispatchEvent(new window.MessageEvent("message", { source: window, data: { type: "rhwp-response" } }));
  await pass(5);
}

test("a page without the input handler yet has no caret to hold and posts no error", async () => {
  await reply();
  assert.deepEqual(errors, []);
});

test("the caret keeps blinking in a visible page that has the focus", async () => {
  handler = { caret };
  caret.show({ pageIndex: 0 });
  await reply();
  assert.ok(await ticksOver() > 0);
});

test("a caret that started before the script had it stops at the first reply of a page without the focus", async () => {
  const early = new Caret();
  const held = handler;
  handler = { caret: early };
  window.rhwpStudio = { ...window.rhwpStudio };
  early.show({ pageIndex: 0 });
  page.focused = false;
  await import("../build/test/ui/studio-host.js?early");
  await reply();
  assert.equal(early.blinkTimer, null);
  early.hide();
  page.focused = true;
  handler = held;
});

test("a hidden page runs no tick of the caret and shows the caret, and the caret blinks again when the page returns", async () => {
  setVisibility("hidden");
  assert.equal(await ticksOver(), 0);
  assert.equal(caret.element.style.opacity, "1");
  setVisibility("visible");
  assert.ok(await ticksOver() > 0);
});

test("a page without the focus runs no tick of the caret, and the caret blinks again with the focus", async () => {
  setFocus(false);
  assert.equal(await ticksOver(), 0);
  assert.equal(caret.element.style.opacity, "1");
  setFocus(true);
  assert.ok(await ticksOver() > 0);
});

test("a move of the caret in a hidden page starts no tick", async () => {
  setVisibility("hidden");
  caret.update({ pageIndex: 0 });
  assert.equal(await ticksOver(), 0);
  setVisibility("visible");
  assert.ok(await ticksOver() > 0);
});

test("a caret that the editor hid stays still when the page returns", async () => {
  setFocus(false);
  caret.hide();
  setFocus(true);
  assert.equal(await ticksOver(), 0);
  caret.show({ pageIndex: 0 });
  assert.ok(await ticksOver() > 0);
  caret.hide();
});

test("a page whose input handler has no caret says so", async () => {
  // A fresh import holds a new script over a handler of another shape.
  handler = { caret: {} };
  window.rhwpStudio = { ...window.rhwpStudio };
  await import(`../build/test/ui/studio-host.js?shape`);
  await reply();
  assert.ok(errors.some((message) => message.includes("caret")), `errors ${JSON.stringify(errors)}`);
});
