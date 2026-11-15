import assert from "node:assert/strict";
import test from "node:test";
import { openPageHost } from "./fixtures/host.mjs";

// The caret of rhwp-studio as src/engine/caret-renderer.ts has it. Its blink timer is the state that the test reads: startBlink
// starts the timer and stopBlink clears it, so blinking() tells whether a tick of the caret is due, and no tick runs in the test.
class Caret {
  blinkTimer = null;
  currentRect = null;
  constructor(document) {
    this.element = document.createElement("div");
  }
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

// ui/studio-host.js runs in the editor page. Each test loads the real module into a host-mode view of the plugin, which provides the
// globals of that page: the visibility and the focus of the page, and the input handler of rhwp-studio, which the test sets. Each
// message that the script posts to its window is recorded in sent; the message is not delivered, because the script posts with its
// origin as the target and the view of a plugin has an opaque origin that jsdom refuses as a target.
const script = new URL("../ui/studio-host.js", import.meta.url);

/**
 * Opens a view with the globals of the editor page, and loads ui/studio-host.js into it. The page is visible and has the focus
 * until the test changes it. input.handler is the input handler that the editor returns, which the test sets before a reply.
 */
async function openEditor() {
  const view = await openPageHost({ host: { surface: "hwp-1" }, start: null });
  const { window } = view;
  const page = { visibility: "visible", focused: true };
  const input = { handler: null };
  const sent = [];
  window.postMessage = (message) => {
    if (message?.type === "soksak-hwp") sent.push(message);
  };
  Object.defineProperty(window.document, "visibilityState", { configurable: true, get: () => page.visibility });
  window.document.hasFocus = () => page.focused;
  window.rhwpStudio = {
    automation: { getContext: () => ({ isDirty: false, hasSelection: false }) },
    plugins: { deps: { getInputHandler: () => input.handler } },
  };
  await view.load(script);
  return {
    view, window, page, input, sent,
    errors: () => sent.filter((message) => message.event === "error").map((message) => message.message),
  };
}

/** Opens a view, loads the script, runs body, and closes the view when body ends. */
async function withEditor(body) {
  const editor = await openEditor();
  try {
    await body(editor);
  } finally {
    await editor.view.close();
  }
}

/** A reply of the editor, the first moment at which the script can have the input handler of a page that started. */
function reply({ window }) {
  window.dispatchEvent(new window.MessageEvent("message", { source: window, data: { type: "rhwp-response" } }));
}

function setVisibility({ window, page }, visibility) {
  page.visibility = visibility;
  window.document.dispatchEvent(new window.Event("visibilitychange"));
}

function setFocus({ window, page }, focused) {
  page.focused = focused;
  window.dispatchEvent(new window.Event(focused ? "focus" : "blur"));
}

/**
 * A caret that the input handler holds and that is shown in a visible page with the focus: the first reply makes the script take the
 * caret, and the caret blinks, as it does when the editor shows it.
 */
function shownCaret(editor) {
  const caret = new Caret(editor.window.document);
  editor.input.handler = { caret };
  caret.show({ pageIndex: 0 });
  reply(editor);
  return caret;
}

test("a page without the input handler yet has no caret to hold and posts no error", async () => {
  await withEditor((editor) => {
    reply(editor);
    assert.deepEqual(editor.errors(), []);
  });
});

test("the caret keeps blinking in a visible page that has the focus", async () => {
  await withEditor((editor) => {
    const caret = shownCaret(editor);
    assert.equal(caret.blinking(), true);
  });
});

test("a caret that started before the script had it stops at the first reply of a page without the focus", async () => {
  await withEditor((editor) => {
    const early = new Caret(editor.window.document);
    early.show({ pageIndex: 0 });
    editor.page.focused = false;
    editor.input.handler = { caret: early };
    reply(editor);
    assert.equal(early.blinking(), false);
  });
});

test("a hidden page runs no tick of the caret and shows the caret, and the caret blinks again when the page returns", async () => {
  await withEditor((editor) => {
    const caret = shownCaret(editor);
    setVisibility(editor, "hidden");
    assert.equal(caret.blinking(), false);
    assert.equal(caret.element.style.opacity, "1");
    setVisibility(editor, "visible");
    assert.equal(caret.blinking(), true);
  });
});

test("a page without the focus runs no tick of the caret, and the caret blinks again with the focus", async () => {
  await withEditor((editor) => {
    const caret = shownCaret(editor);
    setFocus(editor, false);
    assert.equal(caret.blinking(), false);
    assert.equal(caret.element.style.opacity, "1");
    setFocus(editor, true);
    assert.equal(caret.blinking(), true);
  });
});

test("a move of the caret in a hidden page starts no tick", async () => {
  await withEditor((editor) => {
    const caret = shownCaret(editor);
    setVisibility(editor, "hidden");
    caret.update({ pageIndex: 0 });
    assert.equal(caret.blinking(), false);
    setVisibility(editor, "visible");
    assert.equal(caret.blinking(), true);
  });
});

test("a caret that the editor hid stays still when the page returns", async () => {
  await withEditor((editor) => {
    const caret = shownCaret(editor);
    setFocus(editor, false);
    caret.hide();
    setFocus(editor, true);
    assert.equal(caret.blinking(), false);
    caret.show({ pageIndex: 0 });
    assert.equal(caret.blinking(), true);
    caret.hide();
  });
});

test("a page whose input handler has no caret says so", async () => {
  await withEditor((editor) => {
    // The handler of another shape: the script refuses it with an error record at the first reply.
    editor.input.handler = { caret: {} };
    reply(editor);
    assert.ok(editor.errors().some((message) => message.includes("caret")), `errors ${JSON.stringify(editor.errors())}`);
  });
});
