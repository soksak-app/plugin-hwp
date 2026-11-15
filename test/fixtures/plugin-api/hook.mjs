// The resolve hook of the plugin API fixture. The application resolves the bare specifiers of a view page through the import map
// of the page, and this hook resolves the same specifiers for the test process: each entry of the map that the pages of this
// plugin import is mapped to a module of this folder. Every other specifier of the plugin API is refused, because the import map
// of the page has no such entry for this plugin, and every other specifier goes on to the default resolution.
const ENTRIES = new Map([
  ["@soksak/plugin-api", new URL("./index.mjs", import.meta.url).href],
  ["@soksak/plugin-api/view", new URL("./view.mjs", import.meta.url).href],
  ["@soksak/plugin-api/diagnostic-view-frames", new URL("./diagnostic-view-frames.mjs", import.meta.url).href],
]);

export function resolve(specifier, context, next) {
  const url = ENTRIES.get(specifier);
  if (url !== undefined) return { url, shortCircuit: true };
  if (specifier === "@soksak/plugin-api" || specifier.startsWith("@soksak/plugin-api/")) {
    throw new Error(`${specifier} is not mapped by the plugin API fixture: it maps ${[...ENTRIES.keys()].join(", ")}`);
  }
  return next(specifier, context);
}
