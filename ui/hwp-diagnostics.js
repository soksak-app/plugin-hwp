import { createViewDiagnosticDisposer, createViewFrameDiagnostics } from "./view-diagnostics.js";

const markerType = "soksak-hwp-viewport-marker";
const markerColor = [255, 0, 255];
const markerColorCss = "rgb(255, 0, 255)";
const viewportFields = ["borderWidth", "clientHeight", "clientWidth", "fixedContainingBlock", "innerHeight", "innerWidth",
  "markerColor", "rect", "visualViewport"];
const rectFields = ["bottom", "left", "right", "top"];
const visualViewportFields = ["height", "offsetLeft", "offsetTop", "scale", "width"];
const containingBlockFields = ["contain", "containerType", "filter", "perspective", "transform", "willChange"];

const exactKeys = (value, fields) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join(",") === fields.join(",");

function requireStudioViewport(value) {
  if (!exactKeys(value, viewportFields) || !Array.isArray(value.markerColor)
      || value.markerColor.length !== 3 || value.markerColor.some((channel, index) => channel !== markerColor[index])
      || value.borderWidth !== 2 || !exactKeys(value.rect, rectFields)
      || !exactKeys(value.visualViewport, visualViewportFields)
      || !exactKeys(value.fixedContainingBlock, containingBlockFields)) {
    throw new TypeError("HWP studio viewport marker returned an invalid evidence shape");
  }
  const numbers = [value.rect.left, value.rect.top, value.rect.right, value.rect.bottom, value.innerWidth, value.innerHeight,
    value.clientWidth, value.clientHeight, value.visualViewport.width, value.visualViewport.height,
    value.visualViewport.offsetLeft, value.visualViewport.offsetTop, value.visualViewport.scale];
  if (!numbers.every(Number.isFinite) || value.innerWidth <= 0 || value.innerHeight <= 0
      || value.rect.left !== 0 || value.rect.top !== 0 || value.rect.right !== value.innerWidth
      || value.rect.bottom !== value.innerHeight || value.clientWidth !== value.innerWidth
      || value.clientHeight !== value.innerHeight || value.visualViewport.width !== value.innerWidth
      || value.visualViewport.height !== value.innerHeight || value.visualViewport.offsetLeft !== 0
      || value.visualViewport.offsetTop !== 0 || value.visualViewport.scale !== 1) {
    throw new TypeError("HWP studio viewport marker returned inconsistent viewport dimensions");
  }
  const expected = { contain: "none", containerType: "normal", filter: "none", perspective: "none", transform: "none", willChange: "auto" };
  for (const [property, required] of Object.entries(expected)) {
    if (value.fixedContainingBlock[property] !== required) {
      throw new TypeError(`HWP studio viewport marker returned unsupported fixed-position containing-block value ${property}`);
    }
  }
  return value;
}

/** Combines view-frame diagnostics with the studio's captured-pixel viewport marker. */
export function createStudioViewportDiagnostics({ diagnostics, documentRegion }) {
  if (!diagnostics || typeof diagnostics.start !== "function" || typeof diagnostics.stop !== "function"
      || typeof diagnostics.read !== "function" || typeof diagnostics.dispose !== "function") {
    throw new TypeError("HWP studio viewport diagnostics require frame diagnostics");
  }
  if (!documentRegion || typeof documentRegion.onMessage !== "function" || typeof documentRegion.post !== "function") {
    throw new TypeError("HWP studio viewport diagnostics require the studio document region message channel");
  }
  let disposed = false;
  let markerActive = false;
  let markerStarting = false;
  let pendingStart = null;
  let disposal = null;
  let nextMarkerRequest = 0;
  const pendingRequests = new Set();
  const markerRequest = (operation) => {
    const id = `viewport-${++nextMarkerRequest}`;
    return new Promise((resolve, reject) => {
      let settled = false;
      let unsubscribe;
      let timeout;
      let request;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        pendingRequests.delete(request);
        clearTimeout(timeout);
        let failure = error;
        try {
          unsubscribe?.();
        } catch (cleanupError) {
          failure = failure ? new AggregateError([failure, cleanupError], "HWP viewport marker request cleanup failed") : cleanupError;
        }
        if (failure) reject(failure);
        else resolve(result);
      };
      unsubscribe = documentRegion.onMessage((message) => {
        if (message?.type !== markerType || message.id !== id) return;
        if (message.error !== undefined) finish(new Error(`HWP studio viewport marker ${operation}: ${message.error}`));
        else finish(null, message.result);
      });
      if (typeof unsubscribe !== "function") throw new TypeError("HWP studio viewport marker listener did not return its disposer");
      timeout = setTimeout(() => {
        finish(new Error(`HWP studio viewport marker ${operation} request ${id} timed out after 10 s`));
      }, 10_000);
      request = { operation, cancel: () => finish(new Error(`HWP studio viewport marker ${operation} request ${id} was cancelled during disposal`)) };
      pendingRequests.add(request);
      try {
        Promise.resolve(documentRegion.post({ type: markerType, id, operation })).then(undefined, (error) => finish(error));
      } catch (error) {
        finish(error);
      }
    });
  };
  const stopMarker = async () => {
    if (!markerActive) return null;
    const result = await markerRequest("stop");
    if (result !== null) throw new TypeError("HWP studio viewport marker stop must return null");
    markerActive = false;
    return result;
  };
  const start = async () => {
    if (disposed) throw new Error("HWP view diagnostics are disposed");
    if (markerActive || markerStarting || diagnostics.read().enabled) {
      throw new Error("HWP view frame diagnostics are already active");
    }
    markerStarting = true;
    pendingStart = (async () => {
      let marker;
      try {
        marker = await markerRequest("start");
        marker = requireStudioViewport(marker);
        markerActive = true;
        const result = await diagnostics.start();
        return { ...result, studioViewport: marker };
      } catch (error) {
        try {
          const result = await markerRequest("stop");
          if (result !== null) throw new TypeError("HWP studio viewport marker stop must return null");
          markerActive = false;
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], "HWP view diagnostic start and viewport marker cleanup failed");
        }
        throw error;
      }
    })();
    try {
      return await pendingStart;
    } finally {
      markerStarting = false;
      pendingStart = null;
    }
  };
  const stop = async () => {
    let result;
    let failure;
    if (markerStarting) {
      try {
        await pendingStart;
      } catch (error) {
        failure = error;
      }
    }
    if (!failure) {
      try {
        result = await diagnostics.stop();
      } catch (error) {
        failure = error;
      }
    }
    try {
      await stopMarker();
    } catch (error) {
      failure = failure ? new AggregateError([failure, error], "HWP view observer and viewport marker stop failed") : error;
    }
    if (failure) throw failure;
    return { ...result, studioViewport: null };
  };
  const read = async () => ({
    ...diagnostics.read(),
    studioViewport: markerActive ? requireStudioViewport(await markerRequest("read")) : null,
  });
  const dispose = () => {
    if (disposal) return disposal;
    disposed = true;
    disposal = (async () => {
      let failure;
      if (markerStarting) {
        try {
          await pendingStart;
        } catch (error) {
          failure = error;
        }
      }
      for (const request of [...pendingRequests]) request.cancel();
      try {
        await diagnostics.dispose();
      } catch (error) {
        failure = failure ? new AggregateError([failure, error], "HWP diagnostics disposal failed") : error;
      }
      try {
        await stopMarker();
      } catch (error) {
        failure = failure ? new AggregateError([failure, error], "HWP diagnostics disposal failed") : error;
      }
      if (failure) throw failure;
    })();
    return disposal;
  };
  return { start, stop, read, dispose };
}

/** Attaches the opt-in HWP view-frame commands declared by diagnostics.json. */
export async function attach({ context, document, documentRegion }) {
  if (!context || typeof context.exposure?.command !== "function" || typeof context.runtime?.log?.trace !== "function") {
    throw new TypeError("HWP diagnostics require the view context, command exposure, and trace logger");
  }
  const { observeViewDocumentFrames } = await import("@soksak/plugin-api/diagnostic-view-frames");
  const diagnostics = createViewFrameDiagnostics({
    document,
    documentRegion,
    observe: observeViewDocumentFrames,
    runtime: context.runtime,
  });
  let disposed = false;
  const commands = createStudioViewportDiagnostics({ diagnostics, documentRegion });
  const command = (run) => (...args) => {
    if (disposed) throw new Error("HWP diagnostics are disposed");
    return run(...args);
  };
  await context.exposure.command("hwp.diagnostics.frames.start", command(commands.start));
  await context.exposure.command("hwp.diagnostics.frames.stop", command(commands.stop));
  await context.exposure.command("hwp.diagnostics.frames.read", command(commands.read));

  return createViewDiagnosticDisposer({
    viewWindow: document.defaultView,
    onDisposeStart: () => { disposed = true; },
    cleanup: () => commands.dispose(),
    onError: (error) => context.runtime.log.error("report", {
      text: `HWP diagnostics dispose: ${String(error?.message ?? error)}`,
    }),
  });
}

/** Attaches the studio-side diagnostic message handler without changing release startup. */
export async function attachStudio({ document, window: studioWindow }) {
  if (!document?.documentElement || !studioWindow?.addEventListener || !studioWindow?.getComputedStyle) {
    throw new TypeError("HWP studio viewport diagnostics require its document and window");
  }
  let marker = null;
  let disposed = false;
  const removeMarker = () => {
    if (marker === null) return;
    const current = marker;
    marker = null;
    current.remove();
  };
  const viewport = () => {
    const root = document.documentElement;
    const visual = studioWindow.visualViewport;
    if (!visual) throw new Error("HWP studio has no visualViewport for marker validation");
    const style = studioWindow.getComputedStyle(root);
    const fixedContainingBlock = {
      transform: style.transform,
      perspective: style.perspective,
      filter: style.filter,
      contain: style.contain,
      willChange: style.willChange,
      containerType: style.containerType,
    };
    const values = {
      markerColor,
      borderWidth: 2,
      rect: null,
      innerWidth: studioWindow.innerWidth,
      innerHeight: studioWindow.innerHeight,
      clientWidth: root.clientWidth,
      clientHeight: root.clientHeight,
      visualViewport: {
        width: visual.width,
        height: visual.height,
        offsetLeft: visual.offsetLeft,
        offsetTop: visual.offsetTop,
        scale: visual.scale,
      },
      fixedContainingBlock,
    };
    const dimensions = [values.innerWidth, values.innerHeight, values.clientWidth, values.clientHeight,
      visual.width, visual.height, visual.offsetLeft, visual.offsetTop, visual.scale];
    if (!dimensions.every(Number.isFinite) || values.innerWidth <= 0 || values.innerHeight <= 0) {
      throw new Error("HWP studio viewport dimensions must be finite and positive");
    }
    if (visual.scale !== 1 || visual.offsetLeft !== 0 || visual.offsetTop !== 0
        || visual.width !== values.innerWidth || visual.height !== values.innerHeight) {
      throw new Error("HWP studio visual viewport must have scale 1, zero offsets, and match the inner dimensions");
    }
    if (values.clientWidth !== values.innerWidth || values.clientHeight !== values.innerHeight) {
      throw new Error("HWP studio document root has a viewport gutter");
    }
    const expectedContainingBlock = {
      transform: "none", perspective: "none", filter: "none", contain: "none", willChange: "auto", containerType: "normal",
    };
    for (const [property, expected] of Object.entries(expectedContainingBlock)) {
      if (fixedContainingBlock[property] !== expected) {
        throw new Error(`HWP studio document root establishes a fixed-position containing block through ${property}: ${fixedContainingBlock[property]}`);
      }
    }
    if (marker !== null) {
      const rect = marker.getBoundingClientRect();
      values.rect = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      if (rect.left !== 0 || rect.top !== 0 || rect.right !== values.innerWidth || rect.bottom !== values.innerHeight) {
        throw new Error("HWP studio viewport marker does not match the full viewport rectangle");
      }
    }
    return values;
  };
  const startMarker = () => {
    if (marker !== null) throw new Error("HWP studio viewport marker is already active");
    viewport();
    const root = document.documentElement;
    const element = document.createElement("div");
    element.setAttribute("data-soksak-hwp-viewport-marker", "");
    Object.assign(element.style, {
      position: "fixed",
      inset: "0",
      boxSizing: "border-box",
      border: `2px solid ${markerColorCss}`,
      pointerEvents: "none",
      backgroundColor: "transparent",
      opacity: "1",
      filter: "none",
      mixBlendMode: "normal",
      transform: "none",
      boxShadow: "none",
      zIndex: "2147483647",
    });
    root.append(element);
    marker = element;
    try {
      return viewport();
    } catch (error) {
      removeMarker();
      throw error;
    }
  };
  const onMessage = async (event) => {
    const request = event.data;
    if (disposed || event.source !== studioWindow || event.origin !== studioWindow.location.origin
        || request?.type !== markerType || typeof request.id !== "string") return;
    const fields = Object.keys(request).sort().join(",");
    if (fields === "id,result,type" || (fields === "error,id,type" && typeof request.error === "string")) return;
    let result;
    let error;
    try {
      if (!["start", "read", "stop"].includes(request.operation)) {
        throw new TypeError(`unknown HWP studio viewport marker operation ${JSON.stringify(request.operation)}`);
      }
      if (request.operation === "start") result = startMarker();
      else if (request.operation === "read") result = marker === null ? null : viewport();
      else {
        removeMarker();
        result = null;
      }
    } catch (failure) {
      error = String(failure?.message ?? failure);
      if (request.operation === "start") removeMarker();
    }
    studioWindow.postMessage({ type: markerType, id: request.id, ...(error === undefined ? { result } : { error }) }, studioWindow.location.origin);
  };
  const onPageHide = () => dispose();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    studioWindow.removeEventListener("message", onMessage);
    studioWindow.removeEventListener("pagehide", onPageHide);
    removeMarker();
  };
  studioWindow.addEventListener("message", onMessage);
  try {
    studioWindow.addEventListener("pagehide", onPageHide, { once: true });
  } catch (error) {
    studioWindow.removeEventListener("message", onMessage);
    throw error;
  }
  return dispose;
}
