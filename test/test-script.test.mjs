// Checks that the test command of package.json runs every test file under test/, including the subdirectories of test/.
// The command's arguments select the files: a directory selects the test files under it, and a glob selects the files it matches.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts.test;
// The test script loads the resolve hook of the plugin API fixture with --import before --test.
const NODE_TEST = /^node (?:--import \S+ )?--test /;
const nodeTest = script.split("&&").map((part) => part.trim()).find((part) => NODE_TEST.test(part));
assert.ok(nodeTest, "the test script runs no node --test command");
// The options of node --test, such as the limit of the runner, select no file.
const patterns = nodeTest.replace(NODE_TEST, "").trim().split(/\s+/).filter((part) => !part.startsWith("--")).map((pattern) => pattern.replace(/^"(.*)"$/, "$1"));

// Each test file under test/, as a path relative to the repository root with forward slashes.
function testFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...testFiles(full));
    else if (entry.name.endsWith(".test.mjs")) found.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return found;
}

// A file is selected when a pattern names it, as a glob, or names a directory that contains it.
const selected = (file) => patterns.some((pattern) => path.matchesGlob(file, pattern)
  || (!/[*?[]/.test(pattern) && file.startsWith(pattern.replace(/\/$/, "") + "/")));

test("the test command runs every test file under test/, including its subdirectories", () => {
  const files = testFiles(path.join(root, "test"));
  assert.ok(files.length > 0, "no test file was found under test/");
  assert.deepEqual(files.filter((file) => !selected(file)), [], "the test command does not run these test files");
});

// A test is judged by the events that it waits for, not by time (docs/spec/calls.md, tests): a wait ends only by its event, and the
// limit of the runner, the limit of each core test, fails a test whose event does not come with its name. The test command and the
// test run of make pack both run node --test with that limit.
test("the test commands run node --test with the runner limit of 120000 ms", () => {
  const makefile = readFileSync(path.join(root, "Makefile"), "utf8");
  const runs = [["package.json", nodeTest], ...makefile.split("\n").filter((line) => /\bnode --test\b/.test(line)).map((line) => ["Makefile", line.trim()])];
  assert.equal(runs.length, 2, "the test command and the test run of make pack are the node --test runs");
  for (const [where, run] of runs) {
    assert.deepEqual(run.split(/\s+/).filter((part) => part.startsWith("--test-timeout")), ["--test-timeout=120000"], `${where}: ${run}`);
  }
});

// The tests resolve @soksak/plugin-api to the fixture of this repository: the test command registers the resolve hook before it runs
// the test files, as the import map of the application resolves the specifiers for the page.
test("the test command registers the resolve hook of the plugin API fixture", () => {
  assert.match(nodeTest, /^node --import \.\/test\/fixtures\/plugin-api\/register\.mjs --test /);
});
