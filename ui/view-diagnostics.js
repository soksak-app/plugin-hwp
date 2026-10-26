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

/** Loads the diagnostic-only studio companion from the declared diagnostic module, or returns null for a release. */
export async function loadStudioDiagnostics(pageHref = window.location.href,
  loadModule = (modulePath) => import(new URL(`../../${modulePath}`, pageHref).href)) {
  let response;
  try {
    response = await fetch(new URL("../../diagnostics.json", pageHref).href);
  } catch (error) {
    throw new Error(`the HWP studio diagnostics declaration cannot be read: ${error?.message ?? error}`);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`the HWP studio diagnostics declaration answered ${response.status}`);
  const declaration = await response.json();
  if (!declaration || typeof declaration !== "object" || Array.isArray(declaration)) {
    throw new TypeError("the HWP studio diagnostics declaration must be an object");
  }
  if (declaration.module !== "ui/hwp-diagnostics.js") {
    throw new TypeError("the HWP studio diagnostics declaration must name its excluded module");
  }
  const module = await loadModule(declaration.module);
  if (typeof module?.attachStudio !== "function") {
    throw new TypeError("the HWP diagnostic module must export attachStudio");
  }
  return { declaration, attachStudio: module.attachStudio };
}

/** Starts the studio companion only when the diagnostic page URL explicitly opts in. */
export async function startStudioDiagnostics(pageHref = window.location.href, {
  document = window.document,
  window: studioWindow = window,
  loadModule,
} = {}) {
  if (new URL(pageHref).searchParams.get("diagnostics") !== "1") return null;
  const loaded = await loadStudioDiagnostics(pageHref, loadModule);
  if (loaded === null) throw new Error("the HWP studio diagnostic build has no diagnostics.json declaration");
  const dispose = await loaded.attachStudio({ document, window: studioWindow });
  if (typeof dispose !== "function") throw new TypeError("the HWP studio diagnostic companion must return its disposer");
  return dispose;
}

/** Reports startup failure without declaring the studio ready; reports listening only after diagnostic attachment. */
export async function startStudioHost(pageHref = window.location.href, {
  document = window.document,
  window: studioWindow = window,
  post,
  loadModule,
} = {}) {
  if (typeof post !== "function") throw new TypeError("HWP studio startup requires its message poster");
  let dispose;
  try {
    dispose = await startStudioDiagnostics(pageHref, { document, window: studioWindow, loadModule });
  } catch (error) {
    post({ event: "error", message: `HWP studio diagnostics failed: ${error instanceof Error ? error.message : String(error)}` });
    return false;
  }
  if (dispose) {
    studioWindow.addEventListener("pagehide", () => {
      Promise.resolve(dispose()).catch((error) => post({
        event: "error", message: `HWP studio diagnostics dispose failed: ${error instanceof Error ? error.message : String(error)}`,
      }));
    }, { once: true });
  }
  post({ event: "listening" });
  return true;
}

/** Shares disposal between the view mount and the pagehide event. */
export function createViewDiagnosticDisposer({ viewWindow, onDisposeStart, cleanup, onError }) {
  if (!viewWindow?.addEventListener || !viewWindow?.removeEventListener
      || typeof onDisposeStart !== "function" || typeof cleanup !== "function" || typeof onError !== "function") {
    throw new TypeError("HWP view diagnostic disposal requires the view window and cleanup callbacks");
  }
  let disposal = null;
  const dispose = () => {
    if (disposal !== null) return disposal;
    onDisposeStart();
    viewWindow.removeEventListener("pagehide", onPageHide);
    disposal = Promise.resolve().then(cleanup);
    return disposal;
  };
  const onPageHide = () => {
    dispose().catch(onError);
  };
  viewWindow.addEventListener("pagehide", onPageHide, { once: true });
  return dispose;
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

  const start = async () => {
    if (active || starting) throw new Error("HWP view frame diagnostics are already active");
    sequence = 0;
    starting = true;
    pendingStart = (async () => {
      try {
        const stop = await observe({
          document,
          ResizeObserver: viewWindow.ResizeObserver,
          requestAnimationFrame: viewWindow.requestAnimationFrame.bind(viewWindow),
          cancelAnimationFrame: viewWindow.cancelAnimationFrame.bind(viewWindow),
          now: viewWindow.performance.now.bind(viewWindow.performance),
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
    await stop();
    return read();
  };

  const dispose = async () => {
    if (starting) await pendingStart;
    if (active) await stop();
  };

  return { start, stop, read, dispose };
}
