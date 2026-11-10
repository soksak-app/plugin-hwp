// Checks that the test command of package.json runs every test file under test/, including the subdirectories of test/.
// The command's arguments select the files: a directory selects the test files under it, and a glob selects the files it matches.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts.test;
const nodeTest = script.split("&&").map((part) => part.trim()).find((part) => part.startsWith("node --test "));
assert.ok(nodeTest, "the test script runs no node --test command");
const patterns = nodeTest.slice("node --test ".length).trim().split(/\s+/).map((pattern) => pattern.replace(/^"(.*)"$/, "$1"));

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

// A test is judged by the events that it waits for, not by time (docs/spec/calls.md, tests): neither the test command nor
// the test run of make pack sets a time limit on a test.
test("the test commands set no time limit on a test", () => {
  const makefile = readFileSync(path.join(root, "Makefile"), "utf8");
  for (const [where, text] of [["package.json", script], ["Makefile", makefile]]) {
    assert.doesNotMatch(text, /--test-timeout/, `${where} sets a time limit on the tests`);
  }
});
