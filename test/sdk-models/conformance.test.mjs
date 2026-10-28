// Conformance of the models of test/sdk-models to the published view and exposure cases recorded in
// test/fixtures/sdk-cases. Each step of a covered case is replayed against the model and its output is asserted.
// The page calls only part of each surface. EXCLUDED_CASES lists the cases that exercise an operation outside the
// page surface, with the reason. EXCLUDED_STEPS lists the steps of a covered case that exercise an operation outside the
// page surface. The test fails when a listed case or step is replayed, or when a listed item is absent from the fixtures.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createExpose } from "./expose.mjs";
import { createViewBridge } from "./view.mjs";

const fixtureFile = (name) => JSON.parse(readFileSync(new URL(`../fixtures/sdk-cases/${name}.json`, import.meta.url), "utf8"));
const fixture = (name) => fixtureFile(name).cases;
const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
const errorText = (error) => (error instanceof Error ? error.message : String(error?.message ?? error));

const EXCLUDED_CASES = {
  "view.composition.stream-subscribe-and-close": "the page does not subscribe to document streams (region.subscribe)",
  "binder.delegate.dispatches-declared-controls": "the page does not call expose.delegate",
  "binder.audit.reports-unbound-controls": "the page does not call expose.audit",
  "binder.run.runs-and-refuses": "the page does not call the binder run",
  "view.bridge.refuses-malformed-host-message": "the view channel refuses messages without the marker before the bridge receives them",
  "view.bridge.refuses-unsupported-page": "the page is always soksak://hwp/, so the bridge creation check is not reached",
  "view.bridge.sidecar-subscriptions": "the page subscribes to sidecar messages only, not to runtime.sidecar.onFailure",
  "view.native.exposure-calls-and-refusals": "the page registers exposure entries through calls.request, not exposureRegister or exposureReply",
  // The steps of these cases call zoom, go, entry or stop, which the page does not call. The bridge call ids that the
  // later steps record count those calls, so a replay that skips them diverges at the next post.
  "view.composition.document-calls-in-order": "the page does not call document zoom, go, entry or stop; their posts shift the call ids of the later steps",
  "view.composition.history-of-the-attach-reply": "the page does not call document go; the go post shifts the call ids of the step",
};
const EXCLUDED_STEPS = {
  "view.composition.update-and-region-refusals": "the page does not call composition.update, whose step posts composition.place",
  "view.composition.reload-and-restored-state": "the page does not call region.reload, whose step posts document.go",
};
// A composition step outside the page surface: a document call other than load or post, or composition.update.
const outsideComposition = (step) => (step.do !== undefined && (step.do.composition === "update"
  || (step.do.region !== undefined && !["load", "post"].includes(step.do.call))));

/** The cases of a surface that replay: every case except the excluded ones. */
function replayable(surface) {
  return fixture(surface).filter((entry) => !EXCLUDED_CASES[entry.id]);
}

// The window of the view channel and the element rectangles that the models read.
function viewWindow() {
  const sokView = { listener: null, attach(listener) { this.listener = listener; } };
  globalThis.window = { sokView, innerWidth: 800, innerHeight: 600 };
  return sokView;
}

test("the excluded cases and steps are present in the copied fixtures", () => {
  const ids = new Set(["view-bridge", "view-native", "view-composition", "view-operations", "create-binder", "expose", "calls", "view-commands"].flatMap((name) => fixture(name)).map((entry) => entry.id));
  for (const id of [...Object.keys(EXCLUDED_CASES), ...Object.keys(EXCLUDED_STEPS)]) assert.ok(ids.has(id), `excluded case ${id} is not in the fixtures`);
});

test("expose cases replay against the exposure model", async () => {
  for (const testCase of fixture("expose")) {
    const registered = [];
    const replies = [];
    const effects = [];
    const subscribers = new Set();
    const elements = new Map();
    let handle = null;
    let value = testCase.initial;
    const expose = createExpose({
      register: async (kind, name) => { registered.push({ kind, name }); },
      // The traces record the unregister of the port at dispose. The view port of the page has none (view.js).
      unregister: async () => { registered.push({ kind: "unregister" }); },
      onRequest: (answer) => { handle = answer; },
      reply: (id, payload) => { replies.push({ id, payload }); },
    }, testCase.declarations);
    // The fake element of a selector: its click runs the listeners of the page and records the click.
    const elementOf = (selector) => {
      const name = selector.replace("#", "");
      if (!elements.has(selector)) {
        const listeners = {};
        const element = {
          id: name,
          dataset: {},
          value: "",
          getBoundingClientRect: () => {
            const rect = testCase.rects?.[name] ?? { left: 0, top: 0, width: 0, height: 0 };
            return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, x: rect.left, y: rect.top };
          },
          addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
          removeEventListener: (type, fn) => { listeners[type] = (listeners[type] ?? []).filter((other) => other !== fn); },
          click: () => {
            effects.push(`click ${name}`);
            // The event names its element as the target and the current target, as the event of a click does.
            for (const fn of [...(listeners.click ?? [])]) fn({ type: "click", target: element, currentTarget: element });
          },
        };
        elements.set(selector, element);
      }
      return elements.get(selector);
    };
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = { registered: registered.length, replies: replies.length, effects: effects.length };
      let throws = null;
      try {
        if (step.status) await expose.status(step.status.name, () => value, (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); });
        else if (step.dom) await expose.dom(step.dom.name, elementOf(step.dom.selector));
        else if (step.command) await expose.command(step.command.name, (params) => { effects.push(`run ${step.command.name} ${JSON.stringify(params)}`); });
        // paramsFromValue binds a function that reads the value of the element at each run.
        else if (step.bind) await expose.bind(elementOf(step.bind.selector), step.bind.command,
          step.bind.paramsFromValue ? (event) => ({ value: event.currentTarget.value }) : step.bind.params);
        // inspect reads the bound element and changes nothing.
        else if (step.inspect) elementOf(step.inspect.selector);
        else if (step.click) {
          const target = elementOf(step.click.selector);
          if (step.click.value !== undefined) target.value = step.click.value;
          target.click();
        }
        else if (step.dispose) await expose.dispose();
        else if (step.race) {
          // The race of a registration with the dispose: the dispose has begun when the registration is made.
          const disposing = expose.dispose();
          try {
            await expose.status(step.race.name, () => value, () => () => {});
          } catch (error) {
            throws = errorText(error);
          }
          await disposing;
        } else if (step.request) handle(step.request);
        else if (step.set !== undefined) {
          value = step.set;
          for (const fn of [...subscribers]) fn(value);
        } else throw new Error(`unknown expose step in ${label}`);
      } catch (error) {
        throws = errorText(error);
      }
      await settle();
      const output = {
        registered: registered.slice(before.registered),
        replies: replies.slice(before.replies),
        effects: effects.slice(before.effects),
        result: null,
        throws,
      };
      assert.deepEqual(output, step.output, label);
    }
  }
});

test("call limit cases replay against the bridge model on a mocked clock", async (t) => {
  for (const testCase of fixture("calls")) {
    // The clock of the case starts at 0 and moves only by the advance steps; the limit timers are the mocked timers.
    t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
    const sokView = { listener: null, attach(listener) { this.listener = listener; } };
    globalThis.window = { sokView, innerWidth: 800, innerHeight: 600, location: { host: "probe" } };
    const posted = [];
    const reports = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) }, report: (event) => reports.push(event) });
    const outcomes = new Map();
    // Each step is followed by the microtasks of the settled promises only; the mocked timers do not run them.
    const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      const reportsBefore = reports.length;
      if (step.request) {
        const name = step.request.name;
        outcomes.set(name, null);
        bridge.calls.request(step.request.command, step.request.params, step.request.timeout)
          .then((value) => outcomes.set(name, { resolved: value }), (error) => outcomes.set(name, { rejected: error.message, code: error.code }));
      } else if (step.advance !== undefined) {
        t.mock.timers.tick(step.advance);
      } else if (step.reply) {
        sokView.listener({ sok: 1, ...step.reply });
      } else throw new Error(`unknown call step in ${label}`);
      await flush();
      const output = {
        sent: posted.slice(before).map(({ sok, ...rest }) => rest),
        reports: reports.slice(reportsBefore),
        outcome: outcomes.get(step.watch) ?? null,
      };
      assert.deepEqual(output, step.output, label);
    }
    t.mock.timers.reset();
  }
});

test("view command cases replay against the bridge model", async () => {
  for (const testCase of replayable("view-commands")) {
    const sokView = viewWindow();
    const posted = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) }, report: () => {} });
    const behaviors = { echo: (params) => params, fail: () => { throw new Error("save failed"); }, none: () => undefined, context: (params, context) => context };
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      let result = null;
      let throws = null;
      try {
        if (step.register) {
          const run = typeof step.register.run === "string" && step.register.run in behaviors ? behaviors[step.register.run] : step.register.run;
          const promise = bridge.commands.register(step.register.name, run);
          if (step.answer ?? step.register.answer) {
            await settle();
            sokView.listener({ sok: 1, id: posted.at(-1).id, ...(step.answer ?? step.register.answer) });
          }
          result = await promise;
        } else if (step.request) {
          sokView.listener({ sok: 1, ...step.request });
        } else throw new Error(`unknown command step in ${label}`);
      } catch (failure) {
        throws = errorText(failure);
      }
      await settle();
      assert.deepEqual({ posted: posted.slice(before), result, throws }, pick(step.output, ["posted", "result", "throws"]), label);
    }
  }
});

test("view operation cases replay against the bridge model", async (t) => {
  // The identifiers of a case are p<time origin of the page>.<n>; the case writes the origin as $ORIGIN.
  const origin = globalThis.performance.timeOrigin;
  const expected = (value) => JSON.parse(JSON.stringify(value).replaceAll("p$ORIGIN.", `p${origin}.`));
  for (const testCase of replayable("view-operations")) {
    await t.test(testCase.id, { timeout: 5000 }, async () => {
      const sokView = viewWindow();
      globalThis.window.location = { host: "probe" };
      let observe;
      const nextObservation = () => {
        return new Promise((resolve) => { observe = resolve; });
      };
      const publish = (value) => {
        if (observe === undefined) throw new Error("operation observation has no waiting consumer");
        const resolve = observe;
        observe = undefined;
        resolve(value);
      };
      const bridge = createViewBridge({ handler: { postMessage: (message) => {
        if (message.command === "runtime.log" && message.params.action === "clock") {
          sokView.listener({ sok: 1, id: message.id, result: { ts_us: 1, mono_ns: 1 } });
          return;
        }
        if (message.command === "runtime.log" && message.params.action === "batch") {
          const [record] = message.params.events;
          publish({ log: pick(record, ["level", "event", "fields", "cids"]) });
          sokView.listener({ sok: 1, id: message.id, result: null });
          return;
        }
        publish({ request: pick(message, ["command", "params", "cids"]) });
        sokView.listener({ sok: 1, id: message.id, result: null });
      } }, report: () => {} });
      const stored = new Map();
      for (const [index, step] of testCase.steps.entries()) {
        const label = `${testCase.id}#${index}`;
        const observation = nextObservation();
        let result = null;
        let throws = null;
        let actual = {};
        try {
          let promise;
          if (step.operation) {
            promise = bridge.runtime.beginOperation(step.operation.event, step.operation.fields);
          } else if (step.sidecar) {
            promise = bridge.runtime.sidecar(step.sidecar.name).send(step.sidecar.id, step.sidecar.body, stored.get(step.sidecar.cids));
          } else if (step.command) {
            promise = bridge.runtime.command(step.command.name, step.command.params, { cids: stored.get(step.command.cids) });
          } else throw new Error(`unknown operation step in ${label}`);
          actual = await observation;
          if (step.operation) stored.set(step.operation.as, promise);
          result = await promise;
          result = result === undefined ? null : result;
        } catch (failure) {
          throws = errorText(failure);
        }
        assert.deepEqual({ ...actual, result, throws }, expected(pick(step.output, ["log", "request", "result", "throws"])), label);
      }
    });
  }
});

test("command registration cases replay against the exposure model", async () => {
  for (const testCase of fixture("command-registration")) {
    const registered = [];
    const replies = [];
    let handle = null;
    const expose = createExpose({
      register: async (kind, name) => { registered.push({ kind, name }); },
      onRequest: (answer) => { handle = answer; },
      reply: (id, payload) => { replies.push({ id, payload }); },
    }, testCase.declarations);
    const behaviors = { echo: (params) => params, fail: () => { throw new Error("save failed"); }, none: () => undefined, context: (params, context) => context };
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = { registered: registered.length, replies: replies.length };
      let throws = null;
      try {
        if (step.command) await expose.command(step.command.name, behaviors[step.command.behavior]);
        else handle(step.request);
      } catch (error) {
        throws = errorText(error);
      }
      await settle();
      assert.deepEqual({ registered: registered.slice(before.registered), replies: replies.slice(before.replies), result: null, throws }, step.output, label);
    }
  }
});

test("view bridge cases replay against the bridge model", async () => {
  for (const testCase of replayable("view-bridge")) {
    const sokView = viewWindow();
    const posted = [];
    const received = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) }, report: () => {} });
    const host = (message) => sokView.listener(JSON.parse(JSON.stringify(message)));
    const pending = new Map();
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      if (step.action === "create") assert.deepEqual({ ready: true }, step.output, label);
      else if (step.action === "request") {
        const promise = bridge.calls.request(step.input.command, step.input.params);
        await settle();
        pending.set(posted[before].id, promise);
        assert.deepEqual(posted[before], step.output, label);
      } else if (step.action === "sidecar-send") {
        const promise = bridge.runtime.sidecar(step.input.sidecar).send(step.input.id, step.input.body);
        await settle();
        pending.set(posted[before].id, promise);
        assert.deepEqual(posted[before], step.output, label);
      } else if (step.action === "sidecar-subscribe") {
        const promise = bridge.runtime.sidecar(step.input.sidecar).on(step.input.id, () => {});
        await settle();
        pending.set(posted[before].id, promise);
        assert.deepEqual(posted[before], step.output, label);
      } else if (step.action === "host-reply") {
        host(step.input);
        await settle();
        if (step.output !== undefined) {
          const value = await pending.get(step.input.id);
          assert.deepEqual(value, step.output, label);
        }
      } else if (step.action === "subscribe") {
        bridge.runtime.theme((data) => received.push(data));
      } else if (step.action === "host-event") {
        const count = received.length;
        host(step.input);
        await settle();
        assert.deepEqual(received[count], step.output, label);
      } else throw new Error(`unknown bridge step ${step.action} in ${label}`);
    }
  }
});

test("view native cases replay against the bridge model", async () => {
  for (const testCase of replayable("view-native")) {
    const sokView = viewWindow();
    const posted = [];
    const delivered = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) }, report: () => {} });
    const listeners = new Map();
    const removers = new Map();
    const listenerFor = (label) => {
      if (!listeners.has(label)) listeners.set(label, (data) => delivered.push({ listener: label, data }));
      return listeners.get(label);
    };
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      const deliveredBefore = delivered.length;
      let result = null;
      let throws = null;
      if (step.on) {
        const promise = bridge.runtime.native.on(step.on.name, listenerFor(step.on.listener));
        if (step.answer) {
          await settle();
          sokView.listener({ sok: 1, id: posted.at(-1).id, ...step.answer });
        }
        try {
          const remove = await promise;
          removers.set(step.on.listener, remove);
          result = typeof remove;
        } catch (error) {
          throws = errorText(error);
        }
      } else if (step.off) {
        removers.get(step.off)();
      } else if (step.event) {
        sokView.listener({ sok: 1, event: step.event.event, data: step.event.data });
      } else throw new Error(`unknown native step in ${label}`);
      await settle();
      assert.deepEqual({ posted: posted.slice(before), delivered: delivered.slice(deliveredBefore), result, throws }, pick(step.output, ["posted", "delivered", "result", "throws"]), label);
    }
  }
});

test("view composition cases replay against the composition model", async () => {
  const { elements: rects, cases } = fixtureFile("view-composition");
  for (const testCase of cases.filter((entry) => !EXCLUDED_CASES[entry.id])) {
    const sokView = viewWindow();
    const posted = [];
    const delivered = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) }, report: () => {} });
    const elements = Object.fromEntries(Object.entries(rects).map(([name, rect]) => [name, rectElement(rect)]));
    // Answers the last posted call of the step, as the host does in posted order.
    const answer = async (payload) => {
      await settle();
      sokView.listener({ sok: 1, id: posted.at(-1).id, ...payload });
      await settle();
    };
    let composition = null;
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      if (EXCLUDED_STEPS[testCase.id] && outsideComposition(step)) continue;
      const before = posted.length;
      const deliveredBefore = delivered.length;
      let result = null;
      let throws = null;
      try {
        if (step.create) {
          // The trace names the regions and overlays and gives their rectangles in elements; the page passes an element per name.
          const created = bridge.composition.create({
            regions: Object.fromEntries(step.create.regions.map((name) => [name, elements[name]])),
            overlays: Object.fromEntries(step.create.overlays.map((name) => [name, elements[name]])),
          });
          for (const payload of step.answers) await answer(payload);
          composition = await created;
          result = composition.kind;
        } else if (step.listen) {
          const region = composition.region(step.listen.region);
          // The trace names the listener and its kind; a message listener receives the message of each document-message event.
          const listener = step.listen.kind === "message"
            ? (message) => delivered.push({ listener: step.listen.listener, message })
            : (state) => delivered.push({ listener: step.listen.listener, state });
          result = typeof (step.listen.kind === "message" ? region.onMessage(listener) : region.onState(listener));
        } else if (step.event) {
          const data = "message" in step.event
            ? { document: step.event.document, message: step.event.message }
            : { document: step.event.document, state: step.event.state };
          sokView.listener({ sok: 1, event: "message" in step.event ? "document-message" : "document-state", data });
        } else if (step.dispose) {
          // The rejection is taken at once, because the answers of the step arrive before the dispose settles.
          const done = composition.dispose().then(() => null, errorText);
          for (const payload of step.answers) await answer(payload);
          throws = await done;
        } else if (step.do?.composition === "region") {
          result = composition.region(step.do.args[0]).name;
        } else if (step.do) {
          const promise = composition.region(step.do.region)[step.do.call](...step.do.args);
          for (const payload of step.answers) await answer(payload);
          await promise;
        } else throw new Error(`unknown composition step in ${label}`);
      } catch (error) {
        throws = errorText(error);
      }
      await settle();
      const state = composition ? composition.region("doc").state : null;
      const history = composition ? composition.region("doc").history : null;
      assert.deepEqual(
        { posted: posted.slice(before), delivered: delivered.slice(deliveredBefore), result, throws, state, history },
        pick(step.output, ["posted", "delivered", "result", "throws", "state", "history"]),
        label,
      );
    }
  }
});

test("binder cases replay against the bind of the exposure model", async () => {
  for (const testCase of replayable("create-binder")) {
    const expose = createExpose({ register: async () => {}, onRequest: () => {}, reply: () => {} }, {
      // The commands of the binder cases are fixtures of the case file: fixture.save fails with its params.fail, and fixture.set returns.
      commands: [{ name: "fixture.save" }, { name: "fixture.set" }],
    });
    await expose.command("fixture.save", (params) => { if (params?.fail) throw new Error("command failed"); return null; });
    await expose.command("fixture.set", () => null);
    const elements = new Map();
    const elementFor = (id, tag) => {
      if (!elements.has(id)) {
        const listeners = {};
        elements.set(id, { id, tag, dataset: {}, value: "", addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); }, listeners });
      }
      return elements.get(id);
    };
    const marking = (id) => {
      const element = elements.get(id);
      return element ? Object.fromEntries(Object.entries({ command: element.dataset.command, params: element.dataset.params }).filter(([, value]) => value !== undefined)) : {};
    };
    const binderState = () => expose.binder();
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      let error = null;
      let id;
      if (step.bind) {
        const spec = step.bind;
        id = spec.id;
        const element = elementFor(spec.id, spec.tag);
        // The trace gives the when filter as an object of expected event fields; the page gives a predicate of the event.
        const when = spec.when ? (event) => Object.entries(spec.when).every(([key, value]) => event[key] === value) : undefined;
        try {
          // paramsFromValue binds a function that reads the value of the element at each run.
          const params = spec.paramsFromValue ? (event) => ({ value: event.currentTarget.value }) : spec.params;
          await expose.bind(element, spec.command, params, { event: spec.event, when, failed: () => {} });
        } catch (failure) {
          error = errorText(failure);
        }
      } else if (step.event) {
        id = step.event.id;
        const element = elementFor(id);
        // The control holds the value of the event, and the event names the control as its target (core binder.js reads it at each run).
        if (step.event.value !== undefined) element.value = step.event.value;
        const event = { type: step.event.type, key: step.event.key, value: step.event.value, target: element, currentTarget: element,
          preventDefault: () => {} };
        for (const handler of element.listeners[step.event.type] ?? []) handler(event);
      } else throw new Error(`unknown binder step in ${label}`);
      await settle();
      const state = binderState();
      const output = {
        calls: state.calls,
        changed: state.changed,
        failed: state.failed,
        result: null,
        error,
        element: id === undefined ? null : marking(id),
      };
      assert.deepEqual(output, pick(step.output, ["calls", "changed", "failed", "result", "error", "element"]), label);
    }
  }
});

function pick(source, keys) {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

function elementOf(name, rect, effects) {
  const box = { left: rect.left, top: rect.top, width: rect.width, height: rect.height, x: rect.left, y: rect.top };
  return { getBoundingClientRect: () => box, click: () => effects.push(`click ${name.split(".").pop()}`) };
}

function rectElement(rect) {
  return { getBoundingClientRect: () => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }) };
}
