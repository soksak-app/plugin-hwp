// Model of the composition of a view page for the calls that the hwp page makes: composition.create over its document
// regions, region(name), region.load, region.post, region.onState, region.onMessage, region.state, region.history and
// dispose. The wire form is the form of test/fixtures/sdk-cases/view-composition.json. The trace names the regions and
// the elements in separate fields; the page passes an element per region name, and the conformance test adapts the
// trace input once.

/**
 * Creates the composition of the regions and overlays of one view page. request(command, params) posts a view call and
 * resolves with its result; subscribe(name, listener, label) subscribes to a native event of the view and resolves with
 * its remove function. options is {regions: {name: element}, overlays: {name: element}}.
 */
export async function createComposition({ request, subscribe }, { regions, overlays }) {
  const declaration = await request("composition.declaration", null);
  const documents = new Map();
  const label = Symbol("composition");
  for (const [name, element] of Object.entries(regions)) {
    const declared = declaration.regions.find((region) => region.name === name);
    if (declared?.kind !== "document") throw new Error(`surface composition has no document region "${name}"`);
    const attached = await request("document.attach", { name });
    documents.set(name, { region: createRegion(name, attached.history, request), element });
  }
  let disposed = false;
  // Each event reaches the region of its document only while the composition is attached.
  await subscribe("document-state", ({ document, state }) => {
    const entry = documents.get(document);
    if (disposed || !entry) return;
    entry.region.state = state;
    for (const listener of [...entry.region.listeners]) listener(state);
  }, label);
  await subscribe("document-message", ({ document, message }) => {
    const entry = documents.get(document);
    if (disposed || !entry) return;
    for (const listener of [...entry.region.messageListeners]) listener(message);
  }, label);
  // The document streams are not called by the page, so their events are not delivered.
  await subscribe("document-stream", () => {}, label);
  const rect = (element) => element.getBoundingClientRect();
  const viewport = () => ({ width: globalThis.window.innerWidth, height: globalThis.window.innerHeight });
  // right and bottom are the insets from the viewport edges, as the trace records them.
  const place = (name, element) => {
    const box = rect(element);
    const size = viewport();
    return { name, left: box.left, top: box.top, right: size.width - (box.left + box.width), bottom: size.height - (box.top + box.height), visible: true };
  };
  await request("composition.place", {
    regions: [...documents].map(([name, entry]) => place(name, entry.element)),
    overlays: Object.entries(overlays).map(([name, element]) => place(name, element)),
  });
  return {
    kind: declaration.kind,
    region(name) {
      const entry = documents.get(name);
      if (!entry) throw new Error(`surface composition has no region "${name}"`);
      return entry.region;
    },
    // A second dispose returns without a call. A refused detach is reported to the host, and the dispose then fails.
    async dispose() {
      if (disposed) return;
      disposed = true;
      const failures = [];
      for (const name of documents.keys()) {
        try {
          await request("document.detach", { name });
        } catch (error) {
          failures.push(error.message);
        }
      }
      if (failures.length > 0) {
        await request("composition.report", `surface composition cleanup failed: ${failures.join("; ")}`);
        throw new Error("surface composition cleanup failed");
      }
    },
  };
}

function createRegion(name, history, request) {
  return {
    name,
    history,
    state: null,
    listeners: new Set(),
    messageListeners: new Set(),
    onState(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    },
    onMessage(listener) {
      this.messageListeners.add(listener);
      return () => this.messageListeners.delete(listener);
    },
    async load(url) {
      await request("document.load", { name, url });
    },
    async post(message) {
      await request("document.post", { name, message });
    },
  };
}
