import assert from "node:assert/strict";
import test from "node:test";
import { openPageHost } from "./fixtures/host.mjs";

// ui/studio-host.js runs in the editor page. Each test loads the real module into a host-mode view of the plugin, which provides the
// globals of that page: the rhwp-studio object with an automation context that the test changes. Each message that the script posts
// to its window is recorded in sent when it posts it. The message is not delivered: the script posts with its origin as the target,
// and the view of a plugin has an opaque origin that jsdom refuses as a target, so the test drives the listeners with its own events.
const script = new URL("../ui/studio-host.js", import.meta.url);

/**
 * The next animation frame of the view. The script queues its frame callbacks during the action before this request, and the frame
 * runs the callbacks in the order they were queued, so the callbacks of the action run before this one.
 */
const frame = (window) => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

/** Opens a view with the globals of the editor page and records the messages that the script posts. */
async function openEditor(context) {
  const view = await openPageHost({ host: { surface: "hwp-1" }, start: null });
  const { window } = view;
  const sent = [];
  window.postMessage = (message) => {
    if (message?.type === "soksak-hwp") sent.push(message);
  };
  window.rhwpStudio = { automation: { getContext: () => context }, plugins: { deps: { getInputHandler: () => null } } };
  return { view, window, sent };
}

/** Opens a view, loads ui/studio-host.js into it, runs body, and closes the view when body ends. */
async function withEditor(context, body) {
  const editor = await openEditor(context);
  try {
    await editor.view.load(script);
    await frame(editor.window);
    await body(editor);
  } finally {
    await editor.view.close();
  }
}

/** The messages that the host script posts while run() and the next animation frame of the page run. */
async function posted({ window, sent }, run) {
  const before = sent.length;
  run();
  await frame(window);
  return sent.slice(before);
}

const key = (window, init) => new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

test("the script posts listening once when it runs", async () => {
  await withEditor({ isDirty: false, hasSelection: false }, ({ sent }) => {
    assert.deepEqual(sent, [{ type: "soksak-hwp", event: "listening" }]);
  });
});

test("Command-S posts save and prevents the default action", async () => {
  await withEditor({ isDirty: false, hasSelection: false }, async (editor) => {
    const event = key(editor.window, { code: "KeyS", key: "s", metaKey: true });
    assert.deepEqual(await posted(editor, () => editor.window.document.body.dispatchEvent(event)),
      [{ type: "soksak-hwp", event: "save" }]);
    assert.equal(event.defaultPrevented, true);
  });
});

test("an input event that makes the document dirty posts modified once", async () => {
  await withEditor({ isDirty: true, hasSelection: false }, async (editor) => {
    const { window } = editor;
    assert.deepEqual(await posted(editor, () => {
      window.document.body.dispatchEvent(key(window, { code: "KeyA", key: "a" }));
      window.document.body.dispatchEvent(new window.Event("input", { bubbles: true }));
    }), [{ type: "soksak-hwp", event: "modified", modified: true }]);
    assert.deepEqual(await posted(editor, () => window.document.body.dispatchEvent(key(window, { code: "KeyB", key: "b" }))), []);
  });
});

test("a reply of the editor that saves the document posts modified false", async () => {
  const context = { isDirty: true, hasSelection: false };
  await withEditor(context, async (editor) => {
    const { window } = editor;
    // The document is dirty first, so the script has posted modified true; the save then clears the state that it reports.
    assert.deepEqual(await posted(editor, () => window.document.body.dispatchEvent(new window.Event("input", { bubbles: true }))),
      [{ type: "soksak-hwp", event: "modified", modified: true }]);
    context.isDirty = false;
    // WebKit gives a message that a page posts to its own window that window as its source; jsdom gives none.
    const reply = new window.MessageEvent("message", { data: { type: "rhwp-response", id: "notifySaved-1", result: { ok: true } }, source: window });
    assert.deepEqual(await posted(editor, () => window.dispatchEvent(reply)),
      [{ type: "soksak-hwp", event: "modified", modified: false }]);
  });
});

test("a pointer release that selects text posts selection, and a key that removes it posts it again", async () => {
  const context = { isDirty: false, hasSelection: true };
  await withEditor(context, async (editor) => {
    const { window } = editor;
    assert.deepEqual(await posted(editor, () => window.document.body.dispatchEvent(new window.Event("pointerup", { bubbles: true }))),
      [{ type: "soksak-hwp", event: "selection", selection: true }]);
    context.hasSelection = false;
    assert.deepEqual(await posted(editor, () => window.document.body.dispatchEvent(key(window, { code: "ArrowRight", key: "ArrowRight" }))),
      [{ type: "soksak-hwp", event: "selection", selection: false }]);
  });
});

test("a context without isDirty posts an error", async () => {
  const context = { isDirty: false, hasSelection: false };
  await withEditor(context, async (editor) => {
    delete context.isDirty;
    const messages = await posted(editor, () => editor.window.document.body.dispatchEvent(new editor.window.Event("paste", { bubbles: true })));
    assert.deepEqual(messages, [{ type: "soksak-hwp", event: "error", message: "rhwp-studio reports isDirty undefined" }]);
  });
});

test("a failure of the editor to read its context posts an error and keeps the script running", async () => {
  await withEditor({ isDirty: false, hasSelection: false }, async (editor) => {
    const { window } = editor;
    // The automation object of the editor is the one that openEditor set; the test makes its getContext throw for one event.
    window.rhwpStudio.automation.getContext = () => { throw new Error("context unavailable"); };
    assert.deepEqual(await posted(editor, () => window.document.body.dispatchEvent(key(window, { code: "KeyC", key: "c" }))),
      [{ type: "soksak-hwp", event: "error", message: "rhwp-studio getContext failed: context unavailable" }]);
  });
});
