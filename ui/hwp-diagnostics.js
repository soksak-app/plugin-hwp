import { observeViewDocumentFrames } from "@soksak/plugin-api/diagnostic-view-frames";
import { createViewFrameDiagnostics } from "./view-diagnostics.js";

/** Attaches the opt-in HWP view-frame commands declared by diagnostics.json. */
export async function attach({ context, document, documentRegion }) {
  if (!context || typeof context.exposure?.command !== "function" || typeof context.runtime?.log?.trace !== "function") {
    throw new TypeError("HWP diagnostics require the view context, command exposure, and trace logger");
  }
  const diagnostics = createViewFrameDiagnostics({
    document,
    documentRegion,
    observe: observeViewDocumentFrames,
    runtime: context.runtime,
  });
  let disposed = false;
  const command = (run) => (...args) => {
    if (disposed) throw new Error("HWP view diagnostics are disposed");
    return run(...args);
  };
  await context.exposure.command("hwp.diagnostics.frames.start", command(diagnostics.start));
  await context.exposure.command("hwp.diagnostics.frames.stop", command(diagnostics.stop));
  await context.exposure.command("hwp.diagnostics.frames.read", command(diagnostics.read));

  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    document.defaultView.removeEventListener("pagehide", onPageHide);
    await diagnostics.dispose();
  };
  const onPageHide = () => {
    dispose().catch((error) => context.runtime.log.error("report", {
      text: `HWP diagnostics dispose: ${String(error?.message ?? error)}`,
    }));
  };
  document.defaultView.addEventListener("pagehide", onPageHide, { once: true });
  return dispose;
}
