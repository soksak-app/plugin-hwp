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
  if (!declaration || typeof declaration !== "object" || Array.isArray(declaration)) {
    throw new TypeError("the HWP diagnostics declaration must be an object");
  }
  if (declaration.module !== "ui/hwp-diagnostics.js") {
    throw new TypeError("the HWP diagnostics declaration must name its excluded module");
  }
  const module = await loadModule(declaration.module);
  if (typeof module?.attach !== "function") {
    throw new TypeError("the HWP diagnostics module must export attach");
  }
  return { declaration, attach: module.attach };
}

/** Builds explicitly started diagnostics for the view page's own document root. */
export function createViewFrameDiagnostics({ document, documentRegion, observe, runtime }) {
  const root = document?.documentElement;
  const viewWindow = document?.defaultView;
  if (!root || typeof root.getBoundingClientRect !== "function") {
    throw new TypeError("HWP view diagnostics require document.documentElement");
  }
  if (!viewWindow?.history || !viewWindow.performance) {
    throw new TypeError("HWP view diagnostics require document history and performance");
  }
  if (!documentRegion || typeof documentRegion !== "object") {
    throw new TypeError("HWP view diagnostics require the owned studio document region");
  }
  if (typeof observe !== "function") throw new TypeError("HWP view diagnostics require the shared frame observer");
  if (typeof runtime?.log?.trace !== "function") throw new TypeError("HWP view diagnostics require runtime.log.trace");

  let active = false;
  let starting = false;
  let pendingStart = null;
  let stopObserver = null;
  let sequence = 0;
  let previousBackground = null;

  const dimensions = () => {
    const rect = root.getBoundingClientRect();
    if (!(Number.isFinite(rect.width) && rect.width >= 0 && Number.isFinite(rect.height) && rect.height >= 0)) {
      throw new Error("HWP view documentElement has invalid dimensions");
    }
    const history = documentRegion.state?.history;
    if (!Array.isArray(history?.entries) || history.entries.length === 0) {
      throw new Error("HWP studio document region has no reported session history entries");
    }
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
    if (active || starting) throw new Error("HWP view frame diagnostics are already active");
    if (!root.style || typeof root.style.getPropertyValue !== "function") {
      throw new TypeError("HWP view diagnostics require the document root's inline style");
    }
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
              if (event !== "view.content_frame") {
                throw new Error(`unexpected HWP view diagnostic event ${JSON.stringify(event)}`);
              }
              if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
                throw new TypeError("HWP view frame record fields must be an object");
              }
              if (!Number.isSafeInteger(fields.sequence) || fields.sequence < sequence) {
                throw new TypeError("HWP view frame sequence must be a nondecreasing safe integer");
              }
              sequence = fields.sequence + 1;
              return runtime.log.trace("view.content_frame", fields);
            },
          },
        });
        if (typeof stop !== "function") throw new TypeError("HWP view frame observer did not return a stop function");
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
    if (!active || !stopObserver) throw new Error("HWP view frame diagnostics are not active");
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
