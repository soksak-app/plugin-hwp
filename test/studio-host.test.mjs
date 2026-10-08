import assert from "node:assert/strict";
import test from "node:test";
import { window } from "./dom.mjs";

// ui/studio-host.js runs in the editor page; the test gives it the globals of that page and a fake automation context.
globalThis.location = window.location;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
const context = { isDirty: false };
window.rhwpStudio = { automation: { getContext: () => context } };
await import("../ui/studio-host.js");

/** Collects the messages of the host script that the window receives while run() and two animation frames pass. */
async function posted(run) {
  const messages = [];
  const listen = (event) => { if (event.data?.type === "soksak-hwp") messages.push(event.data); };
  window.addEventListener("message", listen);
  run();
  for (let frame = 0; frame < 2; frame += 1) await new Promise((resolve) => window.requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
  window.removeEventListener("message", listen);
  return messages;
}

const key = (init) => new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

test("Command-S posts save and prevents the default action", async () => {
  const event = key({ code: "KeyS", key: "s", metaKey: true });
  assert.deepEqual(await posted(() => window.document.body.dispatchEvent(event)), [{ type: "soksak-hwp", event: "save" }]);
  assert.equal(event.defaultPrevented, true);
});

test("an input event that makes the document dirty posts modified once", async () => {
  context.isDirty = true;
  assert.deepEqual(await posted(() => {
    window.document.body.dispatchEvent(key({ code: "KeyA", key: "a" }));
    window.document.body.dispatchEvent(new window.Event("input", { bubbles: true }));
  }), [{ type: "soksak-hwp", event: "modified", modified: true }]);
  assert.deepEqual(await posted(() => window.document.body.dispatchEvent(key({ code: "KeyB", key: "b" }))), []);
});

test("a reply of the editor that saves the document posts modified false", async () => {
  context.isDirty = false;
  // WebKit gives a message that a page posts to its own window that window as its source; jsdom gives none.
  const reply = new window.MessageEvent("message", { data: { type: "rhwp-response", id: "notifySaved-1", result: { ok: true } }, source: window });
  assert.deepEqual(await posted(() => window.dispatchEvent(reply)),
    [{ type: "soksak-hwp", event: "modified", modified: false }]);
});

test("a context without isDirty posts an error", async () => {
  delete context.isDirty;
  const messages = await posted(() => window.document.body.dispatchEvent(new window.Event("paste", { bubbles: true })));
  assert.deepEqual(messages, [{ type: "soksak-hwp", event: "error", message: "rhwp-studio reports isDirty undefined" }]);
  context.isDirty = false;
});
