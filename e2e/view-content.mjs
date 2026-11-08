// Reads the shown content of an hwp view through the public value that holds it, the glyphs of the first page (getPageSvg), checks
// that the host presents the root document and the studio region that show it, and declares the content case of a measurement: the
// fixture document two-paragraphs.hwp in a folder of the project.
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { valueProof, visibleDocument } from "@soksak/window-check/view-content.mjs";
import { FIXTURE, lines } from "./hwp-support.mjs";

/**
 * The text that the hwp view of surface holds as its shown content: the glyphs of its first page, line by line, while its root document
 * and its studio region are visible. The caller waits for the presentation of the window (host.window.presented) after this read.
 */
export async function readHwpContent(s, surface) {
  await visibleDocument(s, surface, "");
  await visibleDocument(s, surface, "studio");
  return (await lines(s, surface)).join("\n");
}

/** Reads the content of surface (readHwpContent) and returns the proof that it holds expected (valueProof). */
export async function hwpContentProof(s, surface, expected) {
  return valueProof(expected, await readHwpContent(s, surface), `hwp ${surface}`);
}

/**
 * The content case of an hwp measurement: a copy of the fixture document in a folder of the project, removed by the cleanups of the
 * session, as `{ params, ready }`. `ready(_, { tab })` waits until the tab shows the one page of the document and its studio region and
 * returns the content check, which reads the content after the display.
 */
export async function hwpContentCase(s, diagnostic) {
  const { root } = await s.get("core.project");
  const folder = `view-content-${process.pid}`;
  mkdirSync(join(root, folder));
  s.cleanup(() => rmSync(join(root, folder), { recursive: true, force: true }));
  const path = `${folder}/content.hwp`;
  copyFileSync(FIXTURE, join(root, path));
  const expected = "속삭한글문서확인";
  return {
    params: { path },
    ready: async (_, { tab }) => {
      await s.until("core.surfaces", (all) => all.some((item) => item.surface === tab && item.exposes.includes("status hwp.document")),
        `${tab} did not register hwp.document`);
      await s.until("hwp.document", (value) => value.path === path && value.phase === "ready" && value.pages === 1,
        `${tab} did not reach hwp.document readiness`, { surface: tab });
      const rect = await s.rect("hwp.studio", undefined, tab);
      assert.ok(rect.width > 0 && rect.height > 0, `${tab}: hwp.studio has no visible area`);
      return async () => {
        await hwpContentProof(s, tab, expected);
        diagnostic(`hwp ${tab} shows ${JSON.stringify(expected)}`);
      };
    },
  };
}
