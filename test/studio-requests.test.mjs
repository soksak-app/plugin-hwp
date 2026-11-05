// The built editor page starts and opens a document without a request outside the plugin. The test runs the script of ui/studio on a
// jsdom document at a plugin address and records each address that the page asks for. Nothing leaves the machine: the recording
// fetch answers only files of the plugin, and the recording FontFace loads nothing. make pack builds ui/studio before it runs this
// test; without a build, the test is skipped.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

import { address, inPlugin, installPage, page, pluginOrigin, studio } from "./studio-page.mjs";

test("the built editor page opens a document without a request outside the plugin", { timeout: 60_000 }, async (t) => {
  if (!existsSync(page)) {
    t.skip("make run-studio builds ui/studio/index.html before this test");
    return;
  }
  for (const method of ["log", "info", "debug"]) t.mock.method(console, method, () => {});
  const requested = [];
  const dom = new JSDOM(readFileSync(page, "utf8"), { url: address, pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { document } = dom.window;
  installPage(dom.window, requested);
  const replies = [];
  dom.window.postMessage = (message) => { replies.push(message); };
  const script = readdirSync(path.join(studio, "assets")).find((file) => /^index-.*\.js$/.test(file));
  await import(pathToFileURL(path.join(studio, "assets", script)).href);
  const until = async (done, what) => {
    for (let elapsed = 0; !done(); elapsed += 50) {
      assert.ok(elapsed < 30_000, `${what}; the status line says ${JSON.stringify(document.getElementById("sb-message")?.textContent)}`);
      await delay(50);
    }
  };
  await until(() => document.getElementById("sb-message")?.textContent === "HWP 파일을 선택해주세요.", "the page did not start");

  const data = Array.from(readFileSync(path.join(studio, "samples", "biz_plan.hwp")));
  dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: dom.window, origin: pluginOrigin,
    data: { type: "rhwp-request", id: "open", method: "loadFile", params: { data, fileName: "biz_plan.hwp", skipUnsavedGuard: true, suppressDialogs: true } } }));
  await until(() => replies.some((reply) => reply.id === "open"), "the page did not answer loadFile");
  assert.deepEqual(replies.find((reply) => reply.id === "open"), { type: "rhwp-response", id: "open", result: { pageCount: 6 } });

  const faces = document.getElementById("rhwp-web-font-faces")?.textContent ?? "";
  for (const [, url] of faces.matchAll(/url\("([^"]+)"\)/g)) requested.push(new URL(url, address).href);
  for (const element of document.querySelectorAll("[src], link[href]")) {
    requested.push(new URL(element.getAttribute("src") ?? element.getAttribute("href"), address).href);
  }
  assert.ok(requested.some((url) => url.endsWith(".wasm")), "the page requested no WebAssembly file, so the recording missed its start");
  assert.deepEqual([...new Set(requested.filter((url) => !inPlugin(url)))], []);
});
