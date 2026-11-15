// The module that `@soksak/plugin-api/diagnostic-view-frames` resolves to in the tests of this plugin. Its interface is the one the
// plugin uses, as core docs/spec/plugin-processes.md and native-surfaces.md describe it: observeViewDocumentFrames(options) starts
// the observation of the frames of a view document, writes its records through options.log.trace, and resolves with the function
// that stops it. The fixture records each start and stop; the test emits the frame records.
import { currentView } from "./page.mjs";

/** Starts the observation of the open view, which the test answers through the frames of its api. */
export function observeViewDocumentFrames(options) {
  return currentView().api.observeFrames(options);
}
