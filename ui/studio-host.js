// The host script of the editor page (docs/studio.md). scripts/build-studio.mjs adds it to ui/studio/index.html, so it
// runs in the page of rhwp-studio, which exposes window.rhwpStudio.automation to hosts that integrate inside the page.
// It posts these messages to its own window, and the document region passes them to the surface page:
//   {type: "soksak-hwp", event: "save"} when Command-S is pressed; the embed mode of rhwp-studio registers no save
//   command and only prevents the default action of the shortcut.
//   {type: "soksak-hwp", event: "modified", modified} when the unsaved state of the document changes. rhwp-studio has no
//   change event for a page at the top level, so the script reads the state after each input event and after each
//   reply of rhwp-studio to a request of the surface page.
//   {type: "soksak-hwp", event: "selection", selection} when hasSelection of the automation context changes, read at
//   the same times.
//   {type: "soksak-hwp", event: "error", message} when the script cannot read that state.
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
  const { isDirty, hasSelection } = automation.getContext();
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
  if (event.source === window && event.data?.type === "rhwp-response") schedule();
});
