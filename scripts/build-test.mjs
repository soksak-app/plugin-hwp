// Builds the UI tree of the tests (build/test/ui) with each @soksak/* import rewritten to its model in test/sdk-models.
// Diagnostic-only UI modules are included and their API calls use consumer fakes. A UI import of an SDK name without a
// model, or of a name the model does not export, fails the build. The models are consumer-boundary fakes of the plugin;
// their conformance to published cases is checked by test/sdk-models/conformance.test.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceUI = path.join(root, "ui");
const sourceModels = path.join(root, "test", "sdk-models");
const outputRoot = path.join(root, "build", "test");
const outputUI = path.join(outputRoot, "ui");
const outputModels = path.join(outputRoot, "sdk-models");

// Each SDK specifier maps to its model file (relative to test/sdk-models) and the names that the model exports.
const MODELS = {
  "@soksak/plugin-api": { file: "index.mjs", names: ["createExpose"] },
  "@soksak/plugin-api/view": { file: "view.mjs", names: ["createViewBridge"] },
  "@soksak/plugin-api/diagnostic-view-frames": { file: "diagnostic-view-frames.mjs", names: ["observeViewDocumentFrames"] },
};

const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});

fs.rmSync(outputRoot, { recursive: true, force: true });
// The editor build under ui/studio is not part of the consumer test tree.
fs.cpSync(sourceUI, outputUI, { recursive: true, filter: (source) =>
  !source.startsWith(path.join(sourceUI, "studio") + path.sep) });
fs.cpSync(sourceModels, outputModels, { recursive: true });

const modelPath = (specifier, file) => {
  const model = MODELS[specifier];
  if (!model) throw new Error(`no test model for ${specifier} imported by ${path.relative(root, file)}`);
  const target = path.relative(path.dirname(file), path.join(outputModels, model.file)).split(path.sep).join("/");
  return target.startsWith(".") ? target : `./${target}`;
};

let rewritten = 0;
for (const file of walk(outputUI).filter((name) => /\.(?:mjs|js)$/.test(name))) {
  const source = fs.readFileSync(file, "utf8");
  const withStaticModels = source.replace(/import\s+(\{[^}]*\})\s+from\s+(["'])(@soksak\/[^"']+)\2\s*;?/g, (statement, names, quote, specifier) => {
    const model = MODELS[specifier];
    if (!model) throw new Error(`no test model for ${specifier} imported by ${path.relative(root, file)}`);
    const imported = names.slice(1, -1).split(",").map((name) => name.trim()).filter(Boolean).map((name) => name.split(/\s+as\s+/)[0]);
    for (const name of imported) {
      if (!model.names.includes(name)) throw new Error(`test model of ${specifier} does not export ${name} (${path.relative(root, file)})`);
    }
    return `import ${names} from ${quote}${modelPath(specifier, file)}${quote};`;
  });
  const next = withStaticModels.replace(/import\s*\(\s*(["'])(@soksak\/[^"']+)\1\s*\)/g,
    (statement, quote, specifier) => `import(${quote}${modelPath(specifier, file)}${quote})`);
  if (next !== source) {
    fs.writeFileSync(file, next);
    rewritten += 1;
  }
  if (/from\s+["']@soksak\//.test(next) || /import\(\s*["']@soksak\//.test(next)) {
    throw new Error(`SDK specifier left in test UI tree: ${path.relative(root, file)}`);
  }
}
console.log(`Built test UI tree: ${walk(outputUI).length} files, ${rewritten} rewritten to test models`);
