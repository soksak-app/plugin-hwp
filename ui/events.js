// The one entrance through which this plugin stores events (core docs/spec/plugins.md#logging): it names an event with its
// whole name `plugin.<plugin>.<event>`, which events.json declares, and passes the rest to context.runtime.log.
const LEVELS = ["error", "warn", "info", "debug", "trace"];

/** Returns emitEvent(level, name, fields), which stores the event `name` of the plugin `pluginId` through runtime.log. */
export function createEmitter(runtime, pluginId) {
  const prefix = `plugin.${pluginId}.`;
  return function emitEvent(level, name, fields) {
    if (!LEVELS.includes(level)) throw new TypeError(`emitEvent requires a level of ${LEVELS.join(", ")}, not ${String(level)}`);
    if (typeof name !== "string" || !name.startsWith(prefix)) throw new TypeError(`emitEvent requires a name that starts with ${prefix}`);
    runtime.log[level](name.slice(prefix.length), fields);
  };
}

/** A failure as `<code>: <text>`: the name of the error is its code. */
export function errorText(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : `Error: ${String(error)}`;
}
