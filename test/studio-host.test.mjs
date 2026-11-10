import assert from "node:assert/strict";
import test from "node:test";
import { window } from "./dom.mjs";

// ui/studio-host.js runs in the editor page; the test gives it the globals of that page and a fake automation context.
// The animation frames of the page are the frames that the test runs: requestAnimationFrame queues its callback, and
// frame() runs the queued callbacks as the next frame of the page does.
globalThis.location = window.location;
const frames = [];
globalThis.requestAnimationFrame = (callback) => frames.push(callback);
const frame = () => { for (const callback of frames.splice(0)) callback(0); };
const context = { isDirty: false, hasSelection: false };
window.rhwpStudio = { automation: { getContext: () => context }, plugins: { deps: { getInputHandler: () => null } } };
// Each message that the script posts is recorded when it posts it; the window still delivers it.
const sent = [];
const postMessage = window.postMessage.bind(window);
window.postMessage = (message, ...rest) => {
  if (message?.type === "soksak-hwp") sent.push(message);
  postMessage(message, ...rest);
};
// jsdom delivers a posted message in a later task; the test waits for the delivery of listening.
const listening = new Promise((resolve) => {
  const announce = (event) => {
    if (event.data?.type !== "soksak-hwp" || event.data.event !== "listening") return;
    window.removeEventListener("message", announce);
    resolve();
  };
  window.addEventListener("message", announce);
});
await import("../build/test/ui/studio-host.js");
await listening;

test("the script posts listening once when it runs", () => {
  assert.deepEqual(sent, [{ type: "soksak-hwp", event: "listening" }]);
});

/** The messages that the host script posts while run() and the next animation frame of the page run. */
function posted(run) {
  const before = sent.length;
  run();
  frame();
  return sent.slice(before);
}

const key = (init) => new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

test("Command-S posts save and prevents the default action", async () => {
  const event = key({ code: "KeyS", key: "s", metaKey: true });
  assert.deepEqual(posted(() => window.document.body.dispatchEvent(event)), [{ type: "soksak-hwp", event: "save" }]);
  assert.equal(event.defaultPrevented, true);
});

test("an input event that makes the document dirty posts modified once", async () => {
  context.isDirty = true;
  assert.deepEqual(posted(() => {
    window.document.body.dispatchEvent(key({ code: "KeyA", key: "a" }));
    window.document.body.dispatchEvent(new window.Event("input", { bubbles: true }));
  }), [{ type: "soksak-hwp", event: "modified", modified: true }]);
  assert.deepEqual(posted(() => window.document.body.dispatchEvent(key({ code: "KeyB", key: "b" }))), []);
});

test("a reply of the editor that saves the document posts modified false", async () => {
  context.isDirty = false;
  // WebKit gives a message that a page posts to its own window that window as its source; jsdom gives none.
  const reply = new window.MessageEvent("message", { data: { type: "rhwp-response", id: "notifySaved-1", result: { ok: true } }, source: window });
  assert.deepEqual(posted(() => window.dispatchEvent(reply)),
    [{ type: "soksak-hwp", event: "modified", modified: false }]);
});

test("a pointer release that selects text posts selection, and a key that removes it posts it again", async () => {
  context.hasSelection = true;
  assert.deepEqual(posted(() => window.document.body.dispatchEvent(new window.Event("pointerup", { bubbles: true }))),
    [{ type: "soksak-hwp", event: "selection", selection: true }]);
  context.hasSelection = false;
  assert.deepEqual(posted(() => window.document.body.dispatchEvent(key({ code: "ArrowRight", key: "ArrowRight" }))),
    [{ type: "soksak-hwp", event: "selection", selection: false }]);
});

test("a context without isDirty posts an error", async () => {
  delete context.isDirty;
  const messages = posted(() => window.document.body.dispatchEvent(new window.Event("paste", { bubbles: true })));
  assert.deepEqual(messages, [{ type: "soksak-hwp", event: "error", message: "rhwp-studio reports isDirty undefined" }]);
  context.isDirty = false;
});

test("a failure of the editor to read its context posts an error and keeps the script running", async () => {
  const automation = window.rhwpStudio.automation;
  const getContext = automation.getContext;
  automation.getContext = () => { throw new Error("context unavailable"); };
  try {
    assert.deepEqual(posted(() => window.document.body.dispatchEvent(key({ code: "KeyC", key: "c" }))),
      [{ type: "soksak-hwp", event: "error", message: "rhwp-studio getContext failed: context unavailable" }]);
  } finally {
    automation.getContext = getContext;
  }
});
