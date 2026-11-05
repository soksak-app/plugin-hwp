// The host script over the caret of the page that make run-studio builds, not over a model of it. make pack builds ui/studio before it
// runs this test; without a build, the test is skipped.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { address, installPage, page, pluginOrigin, studio } from "./studio-page.mjs";

test("the host script stops the caret of the built page while nobody attends the page", { timeout: 60_000 }, async (t) => {
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
  const messages = [];
  dom.window.postMessage = (message) => { messages.push(message); };
  const script = readdirSync(path.join(studio, "assets")).find((file) => /^index-.*\.js$/.test(file));
  await import(pathToFileURL(path.join(studio, "assets", script)).href);
  const until = async (done, what) => {
    for (let elapsed = 0; !done(); elapsed += 50) {
      assert.ok(elapsed < 30_000, what);
      await delay(50);
    }
  };
  await until(() => document.getElementById("sb-message")?.textContent === "HWP 파일을 선택해주세요.", "the page did not start");
  await import("../build/test/ui/studio-host.js");
  const data = Array.from(readFileSync(path.join(studio, "samples", "biz_plan.hwp")));
  const reply = new dom.window.MessageEvent("message", { source: dom.window, origin: pluginOrigin,
    data: { type: "rhwp-request", id: "open", method: "loadFile", params: { data, fileName: "biz_plan.hwp", skipUnsavedGuard: true, suppressDialogs: true } } });
  dom.window.dispatchEvent(reply);
  await until(() => messages.some((message) => message.id === "open"), "the page did not answer loadFile");
  // The test gives the script the reply that WebKit would deliver to it, because this page records what it posts.
  dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: dom.window, origin: pluginOrigin, data: messages.find((message) => message.id === "open") }));
  await delay(0);
  assert.deepEqual(messages.filter((message) => message.type === "soksak-hwp" && message.event === "error"), []);

  const element = document.querySelector(".caret");
  assert.ok(element, "the built page has no caret element");
  let ticks = 0;
  const observer = new dom.window.MutationObserver((records) => { ticks += records.filter((record) => record.attributeName === "style").length; });
  observer.observe(element, { attributes: true });
  t.after(() => observer.disconnect());
  /** The changes of the style of the caret over 1.2 s, which is two ticks of its timer of 500 ms. */
  const ticksOver = async () => {
    await delay(0);
    ticks = 0;
    await delay(1200);
    return ticks;
  };
  const change = (name, target) => target.dispatchEvent(new dom.window.Event(name));

  assert.notEqual(element.style.display, "none", "the built page shows no caret after it opened the document");
  assert.ok(await ticksOver() >= 2, "the caret does not blink in a page that is attended");

  attended.visibility = "hidden";
  change("visibilitychange", document);
  assert.equal(await ticksOver(), 0, "the caret blinks in a hidden page");
  assert.equal(element.style.opacity, "1");
  attended.visibility = "visible";
  change("visibilitychange", document);
  assert.ok(await ticksOver() >= 2, "the caret does not blink again in a page that returned");

  attended.focus = false;
  change("blur", dom.window);
  assert.equal(await ticksOver(), 0, "the caret blinks in a page without the focus");
  attended.focus = true;
  change("focus", dom.window);
  assert.ok(await ticksOver() >= 2, "the caret does not blink again with the focus");
});
