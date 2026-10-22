// The one entrance through which this plugin stores events (core docs/spec/plugins.md#logging): it names an event with its
// whole name `plugin.<plugin>.<event>`, which events.json declares, and passes the rest to context.runtime.log.
const LEVELS = ["error", "warn", "info", "debug", "trace"];

/**
 * Returns emitEvent(level, name, fields, cids), which stores the event `name` of the plugin `pluginId` through runtime.log.
 * cids is the list that beginOperation returned for the operation of the event, and it is omitted when none is given.
 */
export function createEmitter(runtime, pluginId) {
  const prefix = `plugin.${pluginId}.`;
  return function emitEvent(level, name, fields, cids) {
    if (!LEVELS.includes(level)) throw new TypeError(`emitEvent requires a level of ${LEVELS.join(", ")}, not ${String(level)}`);
    if (typeof name !== "string" || !name.startsWith(prefix)) throw new TypeError(`emitEvent requires a name that starts with ${prefix}`);
    // events: forwarded
    runtime.log[level](name.slice(prefix.length), fields, cids === undefined ? undefined : { cids });
  };
}

/** The text of a thrown value for the tab error: the message of an Error, and the value itself otherwise. */
export function messageText(error) {
  return error instanceof Error ? error.message : String(error);
}

/** A failure as `<code>: <text>`: the name of the error is its code. */
export function errorText(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : `Error: ${String(error)}`;
}
