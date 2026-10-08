// Copies rhwp into ui/vendor/ (core docs/spec/plugins.md#third-party-libraries): rhwp.js and rhwp_bg.wasm of the exact
// @rhwp/core devDependency, and rhwp.LICENSE.txt with the license of @rhwp/core and the third-party licenses that the
// rhwp repository lists for the same version in THIRD_PARTY_LICENSES.md, which this repository keeps as
// vendor/rhwp-<version>-THIRD_PARTY_LICENSES.txt. rhwp.js loads rhwp_bg.wasm from the same folder. --check fails when
// the committed files differ from a new copy.
import { readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const VENDOR = join(ROOT, "ui/vendor");
const PACKAGE = dirname(realpathSync(join(ROOT, "node_modules/@rhwp/core/package.json")));
const { version, license } = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8"));
const NOTICES = join(ROOT, "vendor", `rhwp-${version}-THIRD_PARTY_LICENSES.txt`);

const outputs = new Map([
  ["rhwp.js", readFileSync(join(PACKAGE, "rhwp.js"))],
  ["rhwp_bg.wasm", readFileSync(join(PACKAGE, "rhwp_bg.wasm"))],
  ["rhwp.LICENSE.txt", Buffer.from(`# @rhwp/core ${version} (${license})\n\n${readFileSync(join(PACKAGE, "LICENSE"), "utf8").trim()}\n\n${readFileSync(NOTICES, "utf8").trim()}\n`)],
]);

if (process.argv.includes("--check")) {
  const committed = readdirSync(VENDOR).sort();
  const built = [...outputs.keys()].sort();
  if (JSON.stringify(committed) !== JSON.stringify(built)) {
    console.error(`ui/vendor holds ${committed.join(", ")}, but a build writes ${built.join(", ")}; run pnpm build`);
    process.exit(1);
  }
  for (const [file, bytes] of outputs) {
    if (!readFileSync(join(VENDOR, file)).equals(bytes)) {
      console.error(`ui/vendor/${file} differs from a new build; run pnpm build`);
      process.exit(1);
    }
  }
} else {
  for (const [file, bytes] of outputs) writeFileSync(join(VENDOR, file), bytes);
}
