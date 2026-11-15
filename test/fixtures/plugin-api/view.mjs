// The module that `@soksak/plugin-api/view` resolves to in the tests of this plugin. Its interface is the one the plugin uses, as
// core docs/spec/exposure.md, plugins.md and native-surfaces.md describe it: the view bridge over the sok-view handler, whose calls,
// commands, runtime and composition the page uses. Each entry records its calls and answers as the test arranges them.
import { currentView } from "./page.mjs";

/** The bridge of the open view over its sok-view handler. */
export function createViewBridge(options) {
  return currentView().api.createBridge(options);
}
