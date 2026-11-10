// The occurrences that a test waits for (docs/spec/calls.md, tests). A fake records each occurrence that a test can observe
// (a posted message, a served call, a log record, a delivered event) in a recorded list, and each push runs the waits whose
// check now holds, in the turn of the push. A test awaits the occurrence that it asserts; a wait has no count of turns and no
// timer, and it ends only by its occurrence. A test whose occurrence does not come is failed with its name by the limit of the
// test runner (the test script of package.json).

/** A wait that the fake marks: {promise, resolve}; resolve marks the occurrence. */
export function occurrence() {
  let mark;
  const promise = new Promise((resolve) => { mark = resolve; });
  return { promise, resolve: mark };
}

/** Creates the waits of one fake. until(check) resolves once check() holds, at once or at the push that makes it hold. */
export function createOccurrences() {
  const checks = new Set();
  const changed = () => {
    for (const entry of [...checks]) {
      if (!entry.check()) continue;
      checks.delete(entry);
      entry.resolve();
    }
  };
  /** A list whose push records an occurrence: each push runs the waits after the items are in the list. */
  const recorded = (list = []) => {
    // The push is not enumerable, so the list compares as the array of its items.
    Object.defineProperty(list, "push", {
      value: (...items) => {
        const length = Array.prototype.push.apply(list, items);
        changed();
        return length;
      },
    });
    return list;
  };
  const until = (check) => new Promise((resolve) => {
    if (check()) resolve();
    else checks.add({ check, resolve });
  });
  return { recorded, until, changed };
}
