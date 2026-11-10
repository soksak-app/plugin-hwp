// The host script over the caret of the page that make run-studio builds, not over a model of it. make pack builds ui/studio before it
// runs this test; without a build, the test is skipped.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { address, installPage, page, pluginOrigin, recordPosts, studio, whenDocument } from "./studio-page.mjs";

test("the host script stops the caret of the built page while nobody attends the page", async (t) => {
  if (!existsSync(page)) {
    t.skip("make run-studio builds ui/studio/index.html before this test");
    return;
  }
  for (const method of ["log", "info", "debug"]) t.mock.method(console, method, () => {});
  const dom = new JSDOM(readFileSync(page, "utf8"), { url: address, pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { document } = dom.window;
  installPage(dom.window, []);
  const attended = { visibility: "visible", focus: true };
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => attended.visibility });
  document.hasFocus = () => attended.focus;
  const { posted: messages, until } = recordPosts(dom.window);
  const script = readdirSync(path.join(studio, "assets")).find((file) => /^index-.*\.js$/.test(file));
  await import(pathToFileURL(path.join(studio, "assets", script)).href);
  // The page has started when its status line asks for a file.
  await whenDocument(dom.window, () => document.getElementById("sb-message")?.textContent === "HWP 파일을 선택해주세요.");
  await import("../build/test/ui/studio-host.js");
  const data = Array.from(readFileSync(path.join(studio, "samples", "biz_plan.hwp")));
  const reply = new dom.window.MessageEvent("message", { source: dom.window, origin: pluginOrigin,
    data: { type: "rhwp-request", id: "open", method: "loadFile", params: { data, fileName: "biz_plan.hwp", skipUnsavedGuard: true, suppressDialogs: true } } });
  dom.window.dispatchEvent(reply);
  await until(() => messages.some((message) => message.id === "open"));
  // The test gives the script the reply that WebKit would deliver to it, because this page records what it posts. The window
  // dispatches it to the listener of the script before it returns, and the script posts its errors when it reads them.
  dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: dom.window, origin: pluginOrigin, data: messages.find((message) => message.id === "open") }));
  assert.deepEqual(messages.filter((message) => message.type === "soksak-hwp" && message.event === "error"), []);

  const element = document.querySelector(".caret");
  assert.ok(element, "the built page has no caret element");
  // The blink timer of the caret of the built page is the state that the test reads: the timer runs while the caret blinks,
  // and a caret without its timer runs no tick.
  const caret = dom.window.rhwpStudio.plugins.deps.getInputHandler().caret;
  const blinking = () => caret.blinkTimer !== null;
  const change = (name, target) => target.dispatchEvent(new dom.window.Event(name));

  assert.notEqual(element.style.display, "none", "the built page shows no caret after it opened the document");
  assert.equal(blinking(), true, "the caret does not blink in a page that is attended");

  attended.visibility = "hidden";
  change("visibilitychange", document);
  assert.equal(blinking(), false, "the caret blinks in a hidden page");
  assert.equal(element.style.opacity, "1");
  attended.visibility = "visible";
  change("visibilitychange", document);
  assert.equal(blinking(), true, "the caret does not blink again in a page that returned");

  attended.focus = false;
  change("blur", dom.window);
  assert.equal(blinking(), false, "the caret blinks in a page without the focus");
  attended.focus = true;
  change("focus", dom.window);
  assert.equal(blinking(), true, "the caret does not blink again with the focus");
});
