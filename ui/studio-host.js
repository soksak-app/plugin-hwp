// The host script of the editor page (docs/studio.md). scripts/build-studio.mjs adds it to ui/studio/index.html, so it
// runs in the page of rhwp-studio, which exposes window.rhwpStudio.automation to hosts that integrate inside the page.
// It posts these messages to its own window, and the document region passes them to the surface page:
//   {type: "soksak-hwp", event: "listening"} once, when the script runs: the script is the last module script of the
//   page, so the scripts of rhwp-studio, which install its message listener, have run before it.
//   {type: "soksak-hwp", event: "save"} when Command-S is pressed; the embed mode of rhwp-studio registers no save
//   command and only prevents the default action of the shortcut.
//   {type: "soksak-hwp", event: "modified", modified} when the unsaved state of the document changes. rhwp-studio has no
//   change event for a page at the top level, so the script reads the state after each input event and after each
//   reply of rhwp-studio to a request of the surface page.
//   {type: "soksak-hwp", event: "selection", selection} when hasSelection of the automation context changes, read at
//   the same times.
//   {type: "soksak-hwp", event: "error", message} when the script cannot read that state or hold the caret.
// It also holds the caret of rhwp-studio still while the page is hidden or has no focus: each change of the opacity of the
// caret asks WebKit for a frame, and the timer of the caret knows neither state.
import { startStudioHost } from "./view-diagnostics.js";

const post = (body) => window.postMessage({ type: "soksak-hwp", ...body }, location.origin);

let modified = false;
let selection = false;
let scheduled = false;
const check = () => {
  scheduled = false;
  const automation = window.rhwpStudio?.automation;
  if (automation === undefined) {
    post({ event: "error", message: "rhwp-studio exposes no window.rhwpStudio.automation" });
    return;
  }
  let context;
  try {
    context = automation.getContext();
  } catch (error) {
    post({ event: "error", message: `rhwp-studio getContext failed: ${error instanceof Error ? error.message : String(error)}` });
    return;
  }
  const { isDirty, hasSelection } = context;
  if (typeof isDirty !== "boolean") {
    post({ event: "error", message: `rhwp-studio reports isDirty ${JSON.stringify(isDirty)}` });
    return;
  }
  if (typeof hasSelection !== "boolean") {
    post({ event: "error", message: `rhwp-studio reports hasSelection ${JSON.stringify(hasSelection)}` });
    return;
  }
  if (isDirty !== modified) {
    modified = isDirty;
    post({ event: "modified", modified });
  }
  if (hasSelection !== selection) {
    selection = hasSelection;
    post({ event: "selection", selection });
  }
};
const schedule = () => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(check);
};

let caret = null;
const attended = () => document.visibilityState === "visible" && document.hasFocus();
/**
 * Takes the caret of the input handler, which the page creates when the editor starts. rhwp-studio gives a host no input
 * handler; the registry of its plugins holds the function that returns it. Every start of the timer of the caret passes startBlink.
 */
const takeCaret = () => {
  const getInputHandler = window.rhwpStudio?.plugins?.deps?.getInputHandler;
  if (typeof getInputHandler !== "function") {
    post({ event: "error", message: "the plugin registry of rhwp-studio has no getInputHandler" });
    return;
  }
  const handler = getInputHandler();
  if (handler === null) return;
  if (typeof handler.caret?.startBlink !== "function" || typeof handler.caret.stopBlink !== "function") {
    post({ event: "error", message: "the input handler of rhwp-studio has no caret with startBlink and stopBlink" });
    return;
  }
  caret = handler.caret;
  const startBlink = caret.startBlink;
  caret.startBlink = function () {
    // startBlink shows the caret; a caret that nobody attends stays shown without its timer.
    startBlink.call(this);
    if (!attended()) this.stopBlink();
  };
};
const holdCaret = () => {
  if (caret === null) takeCaret();
  if (caret === null) return;
  if (attended()) {
    if (caret.blinkTimer === null && caret.currentRect !== null) caret.startBlink();
  } else if (caret.blinkTimer !== null) {
    caret.startBlink();
  }
};
document.addEventListener("visibilitychange", holdCaret);
window.addEventListener("focus", holdCaret);
window.addEventListener("blur", holdCaret);

window.addEventListener("keydown", (event) => {
  if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.code === "KeyS") {
    event.preventDefault();
    post({ event: "save" });
    return;
  }
  schedule();
}, true);
for (const type of ["keyup", "input", "compositionend", "paste", "cut", "drop", "pointerup"]) {
  window.addEventListener(type, schedule, true);
}
window.addEventListener("message", (event) => {
  if (event.source === window && event.data?.type === "rhwp-response") {
    schedule();
    holdCaret();
  }
});

void startStudioHost(location.href, { document, window, post });
