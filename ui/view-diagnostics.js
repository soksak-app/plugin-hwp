import assert from "node:assert/strict";

export const DIAGNOSTIC_CONTENT_COLOR = "rgb(25, 211, 162)";

/** Loads the opt-in module declared by the installed diagnostic build, or returns null for a release plugin. */
export async function loadDiagnostics(pageHref = window.location.href,
  loadModule = (modulePath) => import(new URL(`../${modulePath}`, pageHref).href)) {
  let response;
  try {
    response = await fetch(new URL("../diagnostics.json", pageHref).href);
  } catch (error) {
    throw new Error(`the HWP diagnostics declaration cannot be read: ${error?.message ?? error}`);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`the HWP diagnostics declaration answered ${response.status}`);
  const declaration = await response.json();
  assert.ok(declaration && typeof declaration === "object" && !Array.isArray(declaration),
    "the HWP diagnostics declaration must be an object");
  assert.equal(declaration.module, "ui/hwp-diagnostics.js",
    "the HWP diagnostics declaration must name its excluded module");
  const module = await loadModule(declaration.module);
  assert.equal(typeof module?.attach, "function", "the HWP diagnostics module must export attach");
  return { declaration, attach: module.attach };
}

/** Builds explicitly started diagnostics for the view page's own document root. */
export function createViewFrameDiagnostics({ document, documentRegion, observe, runtime }) {
  const root = document?.documentElement;
  const viewWindow = document?.defaultView;
  assert.ok(root && typeof root.getBoundingClientRect === "function",
    "HWP view diagnostics require document.documentElement");
  assert.ok(viewWindow?.history && viewWindow.performance,
    "HWP view diagnostics require document history and performance");
  assert.ok(documentRegion && typeof documentRegion === "object",
    "HWP view diagnostics require the owned studio document region");
  assert.equal(typeof observe, "function", "HWP view diagnostics require the shared frame observer");
  assert.equal(typeof runtime?.log?.trace, "function", "HWP view diagnostics require runtime.log.trace");

  let active = false;
  let starting = false;
  let pendingStart = null;
  let stopObserver = null;
  let sequence = 0;
  let previousBackground = null;

  const dimensions = () => {
    const rect = root.getBoundingClientRect();
    assert.ok(Number.isFinite(rect.width) && rect.width >= 0 && Number.isFinite(rect.height) && rect.height >= 0,
      "HWP view documentElement has invalid dimensions");
    const history = documentRegion.state?.history;
    assert.ok(Array.isArray(history?.entries) && history.entries.length > 0,
      "HWP studio document region has no reported session history entries");
    return {
      historyEntries: viewWindow.history.length,
      regionHistoryEntries: history.entries.length,
      width: rect.width,
      height: rect.height,
    };
  };

  const read = () => ({ enabled: active || starting, sequence, ...dimensions() });

  const restoreBackground = () => {
    if (previousBackground === null) return;
    const { value, priority } = previousBackground;
    if (value === "") root.style.removeProperty("background-color");
    else root.style.setProperty("background-color", value, priority);
    previousBackground = null;
  };

  const start = async () => {
    assert.ok(!active && !starting, "HWP view frame diagnostics are already active");
    assert.ok(root.style && typeof root.style.getPropertyValue === "function",
      "HWP view diagnostics require the document root's inline style");
    sequence = 0;
    starting = true;
    previousBackground = {
      value: root.style.getPropertyValue("background-color"),
      priority: root.style.getPropertyPriority("background-color"),
    };
    pendingStart = (async () => {
      try {
        root.style.setProperty("background-color", DIAGNOSTIC_CONTENT_COLOR, "important");
        const stop = await observe({
          document,
          ResizeObserver: viewWindow.ResizeObserver,
          requestAnimationFrame: viewWindow.requestAnimationFrame.bind(viewWindow),
          cancelAnimationFrame: viewWindow.cancelAnimationFrame.bind(viewWindow),
          timeOriginMs: viewWindow.performance.timeOrigin,
          log: {
            trace(event, fields) {
              assert.equal(event, "view.content_frame", `unexpected HWP view diagnostic event ${JSON.stringify(event)}`);
              assert.ok(fields && typeof fields === "object" && !Array.isArray(fields),
                "HWP view frame record fields must be an object");
              assert.ok(Number.isSafeInteger(fields.sequence) && fields.sequence >= sequence,
                "HWP view frame sequence must be a nondecreasing safe integer");
              sequence = fields.sequence + 1;
              return runtime.log.trace("view.content_frame", fields);
            },
          },
        });
        assert.equal(typeof stop, "function", "HWP view frame observer did not return a stop function");
        stopObserver = stop;
        active = true;
        return read();
      } catch (error) {
        restoreBackground();
        throw error;
      } finally {
        starting = false;
        pendingStart = null;
      }
    })();
    return pendingStart;
  };

  const stop = async () => {
    assert.ok(active && stopObserver, "HWP view frame diagnostics are not active");
    const stop = stopObserver;
    stopObserver = null;
    active = false;
    try {
      await stop();
    } finally {
      restoreBackground();
    }
    return read();
  };

  const dispose = async () => {
    if (starting) await pendingStart;
    if (active) await stop();
  };

  return { start, stop, read, dispose };
}
