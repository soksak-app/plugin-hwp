// The plugin API of one view page for the tests of this plugin. Its interface is the one the plugin uses, as core
// docs/spec/exposure.md, plugins.md and native-surfaces.md describe it: the view bridge (calls, commands, runtime, composition) and
// the exposure of a page. The fixture runs no code of core and reads no source of core. Each entry records its calls, and answers
// as the test arranges the answer; a use that the test did not arrange is refused with an error that names it.
//
// The arrangement of a view:
//
//     answers      {call: (params) => value}, which answers each calls.request of the page with the call name
//     sidecars     {name: (body, {id, cids}) => void}, which receives each send to the sidecar of the name; its replies reach the
//                  page through api.sidecarMessage
//     commands     {name: (params, options) => value}, which answers each runtime.command of the page with the name
//     regions      {name: {history, load(url), post(message)}}, the document regions that the composition of the page may create;
//                  history is the boolean that the attach of the region replies
//     page         the page identity of the operation identifiers p<page>.<n>
//
// The members of the api: the records (calls, logs, runs, regionCalls, sends, errors, registered, compositions, frames, exposure), the events and
// requests of the host (native, theme, sidecarMessage, run, document, exposure.request, bridgeReport) and settled().
import { setImmediate as turn } from "node:timers/promises";

const LEVELS = ["error", "warn", "info", "debug", "trace"];
const refuse = (what) => {
  throw new Error(`the plugin API fixture has no arrangement for ${what}`);
};
const clone = (value) => (value === undefined ? undefined : structuredClone(value));

export function createApi(view, arrangement) {
  const { answers = {}, sidecars = {}, commands = {}, regions = {}, page = "1" } = arrangement;
  // The count of the entries that the page used, and of the answers that wait for their delivery in a later task. settled() waits
  // until a turn in which neither changed.
  let activity = 0;
  let deferred = 0;
  let operations = 0;
  let bridge = null;
  const nativeListeners = new Map();
  const themeListeners = new Set();
  const sidecarListeners = new Map();
  const handlers = new Map();
  const handles = new Map();

  /** The answer of the host to an entry: delivered in a task of its own, after the entry has returned, as a host answers. */
  const later = (produce) => {
    activity += 1;
    deferred += 1;
    return turn().then(() => produce()).finally(() => { deferred -= 1; });
  };

  const api = {
    page,
    /** The options that the page passed to createViewBridge, or null before it. */
    get options() { return bridge; },
    calls: [],
    logs: [],
    runs: [],
    regionCalls: [],
    sends: [],
    errors: [],
    registered: [],
    compositions: [],
    frames: { starts: [], stops: 0 },
    exposure: { created: [], registered: [], binds: [], disposed: false },

    /** Waits until the page has made each entry call it makes in a turn, and the answers to them have been delivered. */
    async settled() {
      let seen;
      do {
        seen = activity;
        await turn();
      } while (activity !== seen || deferred > 0);
    },

    /** Delivers a host event to the page through its runtime.native.on subscriptions of the event. */
    async native(event, data) {
      const listeners = nativeListeners.get(event);
      if (listeners === undefined || listeners.size === 0) throw new Error(`the page has no runtime.native.on subscription of ${event}`);
      activity += 1;
      await Promise.all([...listeners].map((listener) => listener(clone(data))));
    },

    /** Delivers a theme message to the subscribers of runtime.theme. */
    theme(value) {
      activity += 1;
      for (const listener of themeListeners) listener(clone(value));
    },

    /** Delivers a message of the sidecar of the name to the page subscription of the session id. */
    sidecarMessage(name, id, body) {
      const listener = sidecarListeners.get(`${name}\0${id}`);
      if (listener === undefined) throw new Error(`the page has no subscription of the sidecar ${name} for ${id}`);
      activity += 1;
      listener(clone(body));
    },

    /** Delivers a request of core to the command that the page registered through commands.register, and resolves with its result. */
    run(name, params) {
      const run = handlers.get(name);
      if (run === undefined) throw new Error(`the page registered no command ${name} through commands.register`);
      activity += 1;
      return Promise.resolve().then(() => run(clone(params)));
    },

    /** Reports an event of the call layer to the report function that the page passed to createViewBridge. */
    bridgeReport(event) {
      if (bridge === null) throw new Error("the page has not created its view bridge");
      activity += 1;
      bridge.report(clone(event));
    },

    /** The document region of the name that the composition of the page created: state(state) and message(message) reach the page. */
    document(name) {
      const handle = handles.get(name);
      if (handle === undefined) throw new Error(`the composition of the page created no region ${name}`);
      return {
        state(state) {
          activity += 1;
          handle.state = clone(state);
          for (const listener of handle.stateListeners) listener(clone(state));
        },
        message(message) {
          activity += 1;
          for (const listener of handle.messageListeners) listener(clone(message));
        },
      };
    },

    createBridge(options) {
      if (bridge !== null) throw new Error("the page created a second view bridge");
      if (options?.handler !== view.window.webkit.messageHandlers["sok-view"]) {
        throw new TypeError("createViewBridge requires the sok-view handler of the window");
      }
      if (typeof options.report !== "function") throw new TypeError("createViewBridge requires the report function");
      bridge = options;
      return {
        calls: {
          request(command, params) {
            api.calls.push({ command, params: clone(params) });
            return later(() => {
              const answer = answers[command] ?? refuse(`the call ${command}`);
              return answer(clone(params)) ?? null;
            });
          },
        },
        commands: {
          register(name, run) {
            activity += 1;
            api.registered.push(name);
            handlers.set(name, run);
            return Promise.resolve();
          },
        },
        runtime: {
          native: {
            on(event, listener) {
              activity += 1;
              if (!nativeListeners.has(event)) nativeListeners.set(event, new Set());
              nativeListeners.get(event).add(listener);
              return Promise.resolve(() => nativeListeners.get(event).delete(listener));
            },
          },
          sidecar(name) {
            if (sidecars[name] === undefined) refuse(`the sidecar ${name}`);
            return {
              on(id, listener) {
                activity += 1;
                sidecarListeners.set(`${name}\0${id}`, listener);
                return Promise.resolve(() => sidecarListeners.delete(`${name}\0${id}`));
              },
              send(id, body, cids) {
                api.sends.push({ sidecar: name, id, body: clone(body), cids: cids ?? [] });
                return later(() => {
                  sidecars[name](clone(body), { id, cids: cids ?? [] });
                  return null;
                });
              },
            };
          },
          command(name, params, options = undefined) {
            api.runs.push({ name, params: clone(params), options: clone(options) });
            return later(() => (commands[name] ?? refuse(`the command ${name}`))(clone(params), options) ?? null);
          },
          beginOperation(event, fields) {
            activity += 1;
            const cids = [`p${page}.${++operations}`];
            api.logs.push({ level: "info", event, fields: recorded(fields), cids });
            return Promise.resolve(cids);
          },
          log: Object.fromEntries(LEVELS.map((level) => [level, (event, fields, options) => {
            activity += 1;
            const record = { level, event, fields: recorded(fields) };
            if (options?.cids !== undefined) record.cids = clone(options.cids);
            api.logs.push(record);
          }])),
          error(where, text) {
            activity += 1;
            api.errors.push({ where, text });
          },
          theme(listener) {
            themeListeners.add(listener);
          },
        },
        composition: {
          async create({ regions: elements, overlays }) {
            activity += 1;
            const created = { regions: elements, overlays, names: Object.keys(elements) };
            for (const name of created.names) {
              const arranged = regions[name] ?? refuse(`the document region ${name}`);
              if (typeof arranged.history !== "boolean") throw new TypeError(`the attach of the region ${name} replied without a boolean history`);
              handles.set(name, {
                history: arranged.history,
                state: null,
                stateListeners: new Set(),
                messageListeners: new Set(),
                arranged,
              });
            }
            api.compositions.push(created);
            return {
              region(name) {
                const handle = handles.get(name);
                if (handle === undefined || !created.names.includes(name)) throw new Error(`the composition has no region ${name}`);
                return {
                  get history() { return handle.history; },
                  get state() { return handle.state; },
                  onState(listener) {
                    handle.stateListeners.add(listener);
                    return () => handle.stateListeners.delete(listener);
                  },
                  onMessage(listener) {
                    handle.messageListeners.add(listener);
                    return () => handle.messageListeners.delete(listener);
                  },
                  post(message) {
                    api.regionCalls.push({ region: name, post: clone(message) });
                    return later(() => handle.arranged.post(clone(message)) ?? null);
                  },
                  load(url) {
                    api.regionCalls.push({ region: name, load: url });
                    return later(() => handle.arranged.load(url) ?? null);
                  },
                };
              },
              async dispose() {
                activity += 1;
                created.disposed = true;
                for (const name of created.names) handles.delete(name);
              },
            };
          },
        },
      };
    },

    createExpose(ports, declarations) {
      for (const port of ["register", "onRequest", "reply", "changed", "report"]) {
        if (typeof ports?.[port] !== "function") throw new TypeError(`createExpose requires the port ${port}`);
      }
      if (typeof declarations !== "function") throw new TypeError("createExpose requires the function that returns the declarations");
      const entries = { status: new Map(), command: new Map(), element: new Map() };
      const watches = new Map();
      const versions = new Map();
      const exposure = api.exposure;
      exposure.created.push({ declarations: declarations() });
      const register = (kind, name, entry) => {
        if (!declarations()[kind === "command" ? "commands" : kind].some((declared) => declared.name === name)) {
          throw new Error(`${kind} ${name} is not declared by the plugin`);
        }
        entries[kind].set(name, entry);
        exposure.registered.push({ kind, name });
        return ports.register(kind, name);
      };
      // The exposure request of the surface {id, method, params}, which reaches the page through ports.onRequest, and its reply
      // through ports.reply (core docs/spec/native-surfaces.md, view exposure).
      const answerRequest = async ({ id, method, params }) => {
        let payload;
        try {
          payload = { result: await serve(method, params) ?? null };
        } catch (error) {
          payload = { error: String(error?.message ?? error) };
        }
        await ports.reply(id, payload);
        return payload;
      };
      const serve = async (method, params) => {
        if (method === "status.get") return (entries.status.get(params.name) ?? refuse(`the status ${params.name}`)).read();
        if (method === "status.watch") {
          const { subscribe } = entries.status.get(params.name) ?? refuse(`the status ${params.name}`);
          if (watches.has(params.name)) throw new Error(`status ${params.name} is already watched`);
          watches.set(params.name, subscribe((value) => ports.changed(params.name, value, versions.set(params.name, (versions.get(params.name) ?? 0) + 1).get(params.name))));
          return null;
        }
        if (method === "status.unwatch") {
          (watches.get(params.name) ?? refuse(`a watch of ${params.name}`))();
          watches.delete(params.name);
          return null;
        }
        if (method === "command.run") return (entries.command.get(params.name) ?? refuse(`the command ${params.name}`)).run(params.params);
        throw new Error(`the plugin API fixture serves status.get, status.watch, status.unwatch and command.run, not ${method}`);
      };
      let stopRequests = null;
      let requests = 0;
      const subscribed = Promise.resolve(ports.onRequest(answerRequest)).then((stop) => { stopRequests = stop; });
      const unbinds = [];
      exposure.request = async (method, params) => {
        await subscribed;
        const id = ++requests;
        return answerRequest({ id, surface: view.window.sokSurface?.surface, method, params });
      };
      return {
        status: (name, read, subscribe) => register("status", name, { read, subscribe }),
        command: (name, run) => register("command", name, { run }),
        element: (name, element) => register("element", name, { element }),
        async bind(element, name, params, options = {}) {
          if (!declarations().commands.some((declared) => declared.name === name)) throw new Error(`command ${name} is not declared by the plugin`);
          const entry = entries.command.get(name) ?? refuse(`the command ${name}`);
          const listener = (event) => {
            if (options.when !== undefined && !options.when(event)) return;
            Promise.resolve().then(() => entry.run(typeof params === "function" ? params(event) : params)).then(undefined, (error) => {
              if (options.failed === undefined) throw error;
              options.failed(error);
            });
          };
          const type = options.event ?? "click";
          element.addEventListener(type, listener);
          unbinds.push(() => element.removeEventListener(type, listener));
          exposure.binds.push({ element, name, params, event: type });
        },
        delegate: () => refuse("the delegate of the exposure"),
        audit: () => refuse("the audit of the exposure"),
        async dispose() {
          exposure.disposed = true;
          for (const unwatch of watches.values()) unwatch();
          watches.clear();
          for (const unbind of unbinds) unbind();
          await subscribed;
          stopRequests?.();
        },
      };
    },

    observeFrames(options) {
      if (typeof options?.log?.trace !== "function") throw new TypeError("observeViewDocumentFrames requires log.trace");
      const observation = { options, emit: (event, fields) => options.log.trace(event, fields) };
      api.frames.starts.push(observation);
      return Promise.resolve(() => { api.frames.stops += 1; });
    },
  };

  /**
   * The fields of a log record (core docs/spec/plugins.md, logging): an object that does not name surface, or a function that returns
   * it. The host stores the surface of the document in the fields of each record.
   */
  function recorded(fields) {
    const built = typeof fields === "function" ? fields() : fields;
    if (built === null || typeof built !== "object" || Array.isArray(built)) throw new TypeError("the fields of a log record are an object or a function that returns one");
    if (Object.hasOwn(built, "surface")) throw new TypeError("the fields of a log record do not name surface");
    const surface = view.window.sokSurface?.surface;
    return surface === undefined ? clone(built) : { surface, ...clone(built) };
  }
  return api;
}
