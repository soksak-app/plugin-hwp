// Model of createViewBridge of the plugin API view entry for the calls that the hwp view page makes: calls.request with the
// call limit, commands.register, runtime.native.on, runtime.theme, runtime.sidecar and composition.create. The wire form
// of each call is the form that the published view and calls cases (test/fixtures/sdk-cases) record. A call outside this
// surface throws an error that names the call. The conformance test is test/sdk-models/conformance.test.mjs.
import { createComposition } from "./composition.mjs";

// The default limit of a call, in milliseconds, when the call declares none (calls.json).
const DEFAULT_LIMIT = 10000;

/**
 * Creates the bridge of one view page. The page posts through handler.postMessage and receives the host messages
 * through window.sokView.attach. report(event) receives the call-layer reports: timeout, late-reply and open-calls.
 */
export function createViewBridge({ handler, report }) {
  if (typeof report !== "function") throw new TypeError("createViewBridge requires the report function");
  let sequence = 0;
  let operationSequence = 0;
  const pending = new Map();
  const late = new Map();
  const commands = new Map();
  const nativeSubscriptions = new Map();
  const themeListeners = new Map();
  const sidecarListeners = [];
  const nativeListeners = new Map();
  const plugin = () => globalThis.window?.location?.host;
  const page = () => String(globalThis.window?.performance?.timeOrigin);

  const post = (message) => handler.postMessage(message);
  const openCalls = () => {
    const started = [...pending.values()].map((entry) => entry.startedAt);
    report({ kind: "open-calls", plugin: plugin(), count: pending.size, oldestStartedAt: started.length > 0 ? Math.min(...started) : null });
  };
  // A request posts {sok, id, command, params} and resolves with the result of the reply with the same id. A reply that
  // arrives after the limit is reported as late and is not passed to the caller.
  function request(command, params, timeout = DEFAULT_LIMIT, cids) {
    const id = ++sequence;
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      const entry = { command, startedAt, resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        pending.delete(id);
        late.set(id, { command, startedAt });
        report({ kind: "timeout", plugin: plugin(), command, timeout });
        openCalls();
        const error = new Error(`command ${command} did not reply within ${timeout}ms`);
        error.code = -32000;
        reject(error);
      }, timeout);
      pending.set(id, entry);
      post({ sok: 1, id, command, params, ...(cids === undefined ? {} : { cids }) });
      openCalls();
    });
  }
  const failure = (error) => ({ code: -32000, message: error instanceof Error ? error.message : String(error) });

  // A host request for a command of the view is answered by its registered run function.
  async function runCommand(message) {
    const run = commands.get(message.command);
    if (run === undefined) {
      post({ sok: 1, reply: message.id, error: { code: 1002, message: `view command ${message.command} is not registered` } });
      return;
    }
    try {
      const result = await run(message.params, message.cids === undefined ? {} : { cids: message.cids });
      post({ sok: 1, reply: message.id, result: result === undefined ? null : result });
    } catch (error) {
      post({ sok: 1, reply: message.id, error: failure(error) });
    }
  }

  // The host messages: replies to requests, command requests, host events and sidecar events.
  const onHost = (message) => {
    if (message.sok !== 1) return;
    if (message.command !== undefined) return void runCommand(message);
    if (message.id !== undefined && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error !== undefined) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result ?? null);
      openCalls();
      return;
    }
    if (message.id !== undefined && late.has(message.id)) {
      const entry = late.get(message.id);
      late.delete(message.id);
      report({ kind: "late-reply", plugin: plugin(), command: entry.command, delay: Date.now() - entry.startedAt });
      return;
    }
    if (message.event === "sidecar.message" || message.event === "sidecar.failure") {
      const kind = message.event === "sidecar.message" ? "message" : "failure";
      for (const listener of sidecarListeners) {
        if (listener.kind === kind && listener.id === message.data.id) listener.fn(kind === "message" ? message.data.body : message.data.reason);
      }
      return;
    }
    if (message.event === "theme") {
      for (const listener of themeListeners.values()) listener(message.data);
      return;
    }
    if (message.event !== undefined) {
      const listeners = nativeListeners.get(`native:${message.event}`);
      if (listeners) for (const listener of [...listeners.values()]) listener(message.data);
    }
  };
  if (typeof globalThis.window?.sokView?.attach !== "function") throw new Error("createViewBridge requires window.sokView.attach of the view channel");
  globalThis.window.sokView.attach(onHost);

  // A subscription posts its command once; later listeners of the same key share it. A refused subscription removes
  // its listeners, so the next listener subscribes again.
  function subscribe(key, command, params, listener, label) {
    if (!nativeListeners.has(key)) nativeListeners.set(key, new Map());
    const listeners = nativeListeners.get(key);
    listeners.set(label, listener);
    const remove = () => { listeners.delete(label); };
    if (nativeSubscriptions.has(key)) return nativeSubscriptions.get(key).then(() => remove);
    const subscribed = request(command, params).then(() => undefined, (error) => {
      nativeSubscriptions.delete(key);
      nativeListeners.delete(key);
      throw error;
    });
    nativeSubscriptions.set(key, subscribed);
    return subscribed.then(() => remove);
  }
  // The sidecar subscriptions share their request as the native subscriptions do.
  function subscribeSidecar(key, command, params) {
    if (nativeSubscriptions.has(key)) return nativeSubscriptions.get(key);
    const subscribed = request(command, params).then(() => undefined, (error) => {
      nativeSubscriptions.delete(key);
      throw error;
    });
    nativeSubscriptions.set(key, subscribed);
    return subscribed;
  }

  let clock = null;
  const runtimeError = (where, text) => request("runtime.error", { where, text });
  const writeLog = (level, event, fields = {}, options = undefined) => {
    const record = { level, event: `plugin.${plugin()}.${event}`, fields: typeof fields === "function" ? fields() : fields,
      page: page(), ...(options?.cids === undefined ? {} : { cids: options.cids }) };
    const send = async () => {
      clock ??= await request("runtime.log", { action: "clock" });
      return request("runtime.log", { action: "batch", events: [{ ...record, ts_us: clock.ts_us, mono_ns: clock.mono_ns }] });
    };
    void send().catch(async (error) => {
      const text = `page event batch failed: ${error?.message ?? error}`;
      try { await runtimeError("log batch", text); }
      catch (failure) { report({ where: "log batch", text, error: failure }); }
    });
  };
  const runtime = {
    native: {
      on(name, listener) {
        if (typeof name !== "string" || name === "") return Promise.reject(new Error("runtime.native.on requires a non-empty name"));
        // The listener label is the listener function itself, so one listener object keeps one entry.
        return subscribe(`native:${name}`, "runtime.native.on", { name }, listener, listener);
      },
    },
    // An operation starts with its first event: the event is written through runtime.log with the identifiers that
    // beginOperation returns, and the identifiers are the cids of every later call of the operation.
    beginOperation(event, fields) {
      const cids = [`p${globalThis.performance.timeOrigin}.${++operationSequence}`];
      writeLog("info", event, fields, { cids });
      return cids;
    },
    log: Object.fromEntries(["error", "warn", "info", "debug", "trace"].map((level) => [level,
      (event, fields, options) => writeLog(level, event, fields, options)])),
    error: runtimeError,
    // A command of the host with cids: the request carries them, and its answer is the answer of the command.
    command(name, params, options = {}) {
      return request(name, params, DEFAULT_LIMIT, options.cids);
    },
    theme(listener) {
      themeListeners.set(listener, listener);
      return () => themeListeners.delete(listener);
    },
    sidecar(name) {
      return {
        send(id, body, cids = []) {
          return request("runtime.sidecar.send", { id, sidecar: name, body, cids });
        },
        on(id, fn) {
          const entry = { kind: "message", id, fn };
          sidecarListeners.push(entry);
          const remove = () => { sidecarListeners.splice(sidecarListeners.indexOf(entry), 1); };
          return subscribeSidecar(`sidecar.message:${name}:${id}`, "runtime.sidecar.on", { id, sidecar: name })
            .then(() => remove);
        },
      };
    },
  };

  const bridge = {
    calls: {
      request(command, params, timeout) {
        return request(command, params, timeout);
      },
    },
    runtime,
    commands: {
      register(name, run) {
        if (typeof name !== "string" || name === "") throw new Error("commands.register requires a non-empty name");
        if (typeof run !== "function") throw new Error(`commands.register requires a function for ${name}`);
        return request("runtime.command.register", { name }).then(() => {
          commands.set(name, run);
          return null;
        });
      },
    },
    composition: {
      create(options) {
        return createComposition({ request, subscribe: (name, listener, label) => subscribe(`native:${name}`, "runtime.native.on", { name }, listener, label) }, options);
      },
    },
  };
  return bridge;
}
