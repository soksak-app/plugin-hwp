// The end of the page that the document region "studio" shows (docs/spec/calls.md). A request to the editor page waits for
// its answer; no timer ends it. It ends with that page, which the region reports through onState: the region reports the
// end of the WebContent process of its page as the document state whose error is PROCESS_ENDED, and each navigation that
// it starts as a larger navigations count, after which the page that the request reached no longer answers it.

/** The error of the document state when the WebContent process of the page of the region ends (core native document view). */
export const PROCESS_ENDED = "the web content process ended";

/**
 * The reason why the page that the region showed when its navigations count was navigations has ended in state, or null while
 * that page lives. A state without a navigations count, or a page without one, ends only by the end of its process.
 */
export function pageEnd(state, navigations) {
  if (state?.error === PROCESS_ENDED) return "the web content process of the editor page ended";
  if (Number.isInteger(state?.navigations) && Number.isInteger(navigations) && state.navigations > navigations) {
    return "the document region started another navigation";
  }
  return null;
}
