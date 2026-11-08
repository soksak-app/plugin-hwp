// Unit checks of the content reader of the hwp view (e2e/view-content.mjs) over a fake session.
import assert from "node:assert/strict";
import test from "node:test";
import { hwpContentProof } from "../view-content.mjs";

/** A session whose host.window shows the root document and the studio of the surface `probe`; `runs` answers each command by name. */
function session(runs, { visible = true } = {}) {
  const frame = { x: 0, y: 0, width: 100, height: 50 };
  const host = { documents: [{ surface: "probe", document: "", visible, frame }, { surface: "probe", document: "studio", visible, frame }] };
  return {
    get: async (name) => { assert.equal(name, "host.window"); return host; },
    run: async (name, params, surface) => {
      assert.equal(surface, "probe");
      assert.ok(name in runs, `unexpected command ${name}`);
      return runs[name](params);
    },
  };
}

const svg = '<text x="1" y="10">속삭</text><text x="2" y="10">한글</text><text x="1" y="20">문서확인</text>';

test("hwp content reads the glyphs of the first page line by line", { timeout: 5000 }, async () => {
  const read = { "hwp.request": ({ method }) => { assert.equal(method, "getPageSvg"); return svg; } };
  assert.equal((await hwpContentProof(session(read), "probe", "속삭한글문서확인")).actual, "속삭한글\n문서확인");
});

test("hwp content refuses other glyphs and a hidden studio", { timeout: 5000 }, async () => {
  await assert.rejects(hwpContentProof(session({ "hwp.request": () => '<text x="1" y="10">다른</text>' }), "probe", "속삭한글문서확인"),
    /does not show "속삭한글문서확인"/);
  await assert.rejects(hwpContentProof(session({ "hwp.request": () => svg }, { visible: false }), "probe", "속삭한글문서확인"),
    /shows no document region/);
});
