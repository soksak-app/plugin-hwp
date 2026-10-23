// The hwp view page (core docs/spec/plugins.md#view-surfaces): the host serves it at soksak://hwp/ui/index.html in the
// web view of the surface, and injects the view channel script and the theme script before this page runs. The page
// builds the surface context of its view over the view channel (@soksak/plugin-api/view) and mounts the hwp module
// into a shadow root of the page. Every entry of the context runs through the call route of a view (core
// docs/spec/native-surfaces.md#view-surfaces, view calls): the tab reports, the event records as the call runtime.log,
// the tab state, the sidecar, and the commands. The page reads the start values of the surface (the tab, its params,
// its origin, its project and the declarations of the plugin) from window.sokSurface, which the host injects before
// the page runs.
import { createExpose } from "@soksak/plugin-api";
import { createViewBridge } from "@soksak/plugin-api/view";
import { mount } from "./hwp.js";
import { messageText } from "./events.js";

/**
 * A refused record is an error of the view: it is shown as the error line of the view (runtime.error), and the console of the
 * page keeps the line too. A refusal of the error line itself has no other route left, so the console takes it.
 */
function refusedLog(calls, event, error) {
  const text = `${event}: ${messageText(error)}`;
  console.error(`runtime.log ${text}`);
  calls.request("runtime.error", { where: "log", text })
    .then(undefined, (refusal) => console.error(`runtime.error log: ${messageText(refusal)}`));
}

const LOG_LEVELS = ["error", "warn", "info", "debug", "trace"];

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value !== "";

// The form of each start value (core docs/spec/native-surfaces.md#view-surfaces, start values): params are the tab
// parameters or null, origin is {directory} with a path or null, project is {root} or null, and declarations
// are the exposes of the plugin.
const START_FORM = {
  params: (value) => value !== undefined,
  origin: (value) => isRecord(value) && (value.directory === null || isText(value.directory)),
  project: (value) => value === null || (isRecord(value) && isText(value.id) && isText(value.root)),
  declarations: isRecord,
};

/** The frozen start values of the surface, which the host of the view injects before the page runs (#H22). */
export function startValues(windowRef = window) {
  const start = windowRef.sokSurface;
  if (start === null || typeof start !== "object" || !isText(start.surface)) {
    throw new Error(`the view of ${windowRef.location.host} has no start values: the host provides window.sokSurface {surface, params, origin, project, declarations} before the page runs`);
  }
  for (const [name, valid] of Object.entries(START_FORM)) {
    if (!valid(start[name])) {
      throw new Error(`the start values of the view of ${windowRef.location.host} are not {surface, params, origin, project, declarations}: ${name} is ${JSON.stringify(start[name]) ?? "undefined"}`);
    }
  }
  return start;
}

/**
 * The surface context of the view of one page, over the view bridge: every entry runs through the call route of the view,
 * and the theme arrives as the theme message.
 *
 *     bridge    createViewBridge() of @soksak/plugin-api/view over the sok-view handler of the view
 *     start     the frozen start values {surface, params, origin, project, declarations}
 *     report    report(text): writes one record to the application log
 *
 * Returns {context}.
 */
export function createViewContext({ bridge, start, report }) {
  if (typeof report !== "function") throw new TypeError("createViewContext requires the report function");
  const { calls, commands, runtime } = bridge;
  // The fire-and-forget calls of the context: a refusal of the route is a record, not a lost report.
  const send = (command, params) => calls.request(command, params)
    .then(undefined, (error) => report(`view call ${command}: ${error?.message ?? error}`));
  // The exposure of the page: the local entries answer the binds and the exposure requests, and each registration goes
  // through the channel. A command is declared by commands.register of the bridge, which registers the same handler for
  // the requests of core, so the local registration sends no declaration of its own.
  const exposure = createExpose({
    register: (kind, name) => kind === "command"
      ? Promise.resolve()
      : calls.request("runtime.native.call", { name: "registered", payload: { kind, name } }).then(() => undefined),
    // The exposure requests of the surface (status.get, status.watch, status.next, status.unwatch, command.run, dom.rect,
    // dom.act) reach the view as the host event exposure-request {id, surface, method, params} through the subscription
    // runtime.native.on (core docs/spec/native-surfaces.md#view-surfaces, view exposure), and the answer replies through
    // exposureReply.
    onRequest: (answer) => runtime.native.on("exposure-request", answer),
    reply: (id, payload) => send("runtime.native.call", { name: "exposureReply", payload: { id, ...payload } }),
    report,
  }, () => start.declarations);
  return {
    context: {
      surfaceId: start.surface,
      pluginId: window.location.host,
      project: start.project,
      origin: start.origin,
      tab: {
        params: start.params ?? null,
        title: (text) => send("tab.title", text),
        footer: (text) => send("tab.footer", text),
        notify: (text, policy) => send("tab.notify", { text, policy }),
        modified: (value) => send("tab.modified", value),
        error: (text) => send("tab.error", text),
        keep: (reason, on) => send("tab.keep", { reason, on }),
        state: {
          read: () => calls.request("tab.state.read", null),
          write: (value) => send("tab.state.write", value),
        },
      },
      runtime: {
        // The sidecar is named by the page, as the view bridge names it (core docs/spec/native-surfaces.md#view-surfaces).
        sidecar: (name) => runtime.sidecar(name),
        command: (name, params, options) => runtime.command(name, params, options),
        // beginOperation writes the first event of an operation and returns the identifiers that its later calls carry.
        beginOperation: runtime.beginOperation,
        // The fields are built before the send, because a call carries values and not builders. Core applies the level
        // gate at the delivery and gives the view no level query, so the fields are built while the level is off too.
        // A refused runtime.log call is reported as the error line of the view (refusedLog).
        log: Object.fromEntries(LOG_LEVELS.map((level) => [level,
          (event, fields, options) => calls.request("runtime.log", { level, event, fields: typeof fields === "function" ? fields() : fields, ...(options?.cids === undefined ? {} : { cids: options.cids }) })
            .then(undefined, (error) => refusedLog(calls, event, error))])),
        theme: runtime.theme,
      },
      // The composition of the declared regions and overlays of the view, whose operations reach the main page as
      // view calls (core docs/spec/native-surfaces.md#view-surfaces, regions).
      composition: bridge.composition,
      exposure: {
        status: (name, read, subscribe) => exposure.status(name, read, subscribe),
        command: (name, run) => Promise.all([exposure.command(name, run), commands.register(name, run)]).then(() => undefined),
        dom: (name, element) => exposure.dom(name, element),
        bind: exposure.bind,
        delegate: exposure.delegate,
        audit: exposure.audit,
        dispose: async () => {
          await exposure.dispose();
        },
      },
      // The state of the surface is the state that the workbench keeps; the page of a view reports no phase.
      status: { report: () => {} },
    },
  };
}

/** Sets the theme on the root of the page, as the theme script of the view and each later theme message carry it. */
function applyTheme(theme) {
  if (theme?.scheme !== "dark" && theme?.scheme !== "light") throw new Error("the theme must have scheme dark or light");
  document.documentElement.style.colorScheme = theme.scheme;
  for (const [token, value] of Object.entries(theme.tokens ?? {})) {
    document.documentElement.style.setProperty(token, value);
  }
}

/** The errors and unhandled rejections of this page are written to the application log when they occur. */
function installPageErrors(report) {
  for (const [type, pick] of [["error", (event) => event.error], ["unhandledrejection", (event) => event.reason]]) {
    addEventListener(type, (event) => {
      const error = pick(event);
      report(`view hwp: ${error?.message ?? String(error)}`);
    });
  }
}

// The page: the start values, the bridge over the injected channel, the theme of the document, and the mount into the
// shadow root of the page body.
const start = startValues();
// The records of the page are written through runtime.log of the surface context, which exists after the bridge. A record that
// occurs before then waits in pending and is written when the context exists.
const pending = [];
let context = null;
// The record of the page: the event report of plugin.hwp.report, whose name the writer of the page completes with the plugin prefix.
const report = (text) => {
  if (context === null) pending.push(text);
  else context.runtime.log.error("report", { text });
};
const bridge = createViewBridge({
  handler: window.webkit.messageHandlers["sok-view"],
  report: (event) => {
    // The count of open calls changes with each call, and a record of it would be a call that reports again, so the count is
    // not a record. The losses (timeouts, late replies, lost peers) and the snapshot losses are records.
    if (event.kind === "open-calls") return;
    report(`view calls of hwp: ${JSON.stringify(event)}`);
  },
});
installPageErrors(report);
if (window.sokTheme) applyTheme(window.sokTheme);
bridge.runtime.theme(applyTheme);
context = createViewContext({ bridge, start, report }).context;
for (const text of pending.splice(0)) report(text);
const host = document.body.appendChild(document.createElement("div"));
host.style.cssText = "height:100%";
try {
  await mount(host.attachShadow({ mode: "open" }), context);
} catch (error) {
  report(`view hwp: mount failed: ${error?.message ?? error}`);
}
