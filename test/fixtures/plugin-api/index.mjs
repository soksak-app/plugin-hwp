// The module that `@soksak/plugin-api` resolves to in the tests of this plugin. Its interface is the one the plugin uses, as core
// docs/spec/exposure.md, plugins.md and native-surfaces.md describe it: createExpose(ports, declarations) registers the status,
// command and element entries of a page and answers the exposure requests that reach it through the ports of the page. The
// fixture runs no code of core; it records what the page registers and does only what the specification states for each entry.
import { currentView } from "./page.mjs";

/** The exposure of the open view: the entries that the page registers, answered as the test arranges the requests. */
export function createExpose(ports, declarations) {
  return currentView().api.createExpose(ports, declarations);
}
