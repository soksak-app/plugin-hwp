import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createEmitter, errorText, messageText } from "../build/test/ui/events.js";

const read = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));
const manifest = read("plugin.json");
const catalog = read("events.json");
const LEVELS = ["error", "warn", "info", "debug", "trace"];
const CLASSES = ["lifecycle", "input", "call", "io", "frame"];
const TYPES = ["string", "number", "boolean", "array", "object", "null"];

function fakeRuntime() {
  const stored = [];
  const log = Object.fromEntries(LEVELS.map((level) => [level, (event, fields) => stored.push({ level, event, fields: typeof fields === "function" ? fields() : fields })]));
  return { stored, runtime: { log } };
}

test("the emitter stores an event of the plugin under the name without the plugin prefix", () => {
  const { stored, runtime } = fakeRuntime();
  const emitEvent = createEmitter(runtime, "hwp");
  emitEvent("warn", "plugin.hwp.read", { path: "a.hwp" });
  assert.deepEqual(stored, [{ level: "warn", event: "read", fields: { path: "a.hwp" } }]);
});

test("the emitter refuses a name of another plugin and a level that does not exist", () => {
  const { stored, runtime } = fakeRuntime();
  const emitEvent = createEmitter(runtime, "hwp");
  assert.throws(() => emitEvent("info", "plugin.files.read", {}), /plugin\.hwp\./);
  assert.throws(() => emitEvent("loud", "plugin.hwp.read", {}), /level/);
  assert.deepEqual(stored, []);
});

test("errorText states a failure as <code>: <text>", () => {
  assert.equal(errorText(new TypeError("bad")), "TypeError: bad");
  assert.equal(errorText("plain"), "Error: plain");
});

test("plugin.json names the catalog and the catalog declares plugin events of the contract", () => {
  assert.equal(manifest.events, "events.json");
  assert.equal(catalog.schema, 3);
  assert.deepEqual(catalog.layers, ["plugin"]);
  assert.ok(Object.keys(catalog.events).length > 0);
  for (const [name, entry] of Object.entries(catalog.events)) {
    assert.match(name, /^plugin\.hwp\.[a-z_]+(\.[a-z_]+)*$/, name);
    assert.equal(entry.layer, "plugin", name);
    assert.ok(CLASSES.includes(entry.class), `${name}: class ${entry.class}`);
    for (const level of [entry.level].flat()) assert.ok(LEVELS.includes(level), `${name}: level ${level}`);
    assert.ok(entry.description.length > 0, name);
    assert.equal(entry.fields.$schema, "https://json-schema.org/draft/2020-12/schema", name);
    assert.equal(entry.fields.type, "object", name);
    assert.ok(Array.isArray(entry.fields.required), name);
    for (const field of entry.fields.required) assert.ok(Object.hasOwn(entry.fields.properties, field), `${name}.${field}`);
    for (const [field, property] of Object.entries(entry.fields.properties)) {
      for (const type of [property.type].flat()) assert.ok(TYPES.includes(type), `${name}.${field}: type ${type}`);
    }
  }
});

test("the release holds the catalog", () => {
  assert.ok(read("package.json").files.includes("events.json"));
});

test("messageText gives the message of an Error and the value of a thrown string", () => {
  assert.equal(messageText(new Error("boom")), "boom");
  assert.equal(messageText("place refused"), "place refused");
});
