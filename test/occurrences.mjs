// The occurrences that a test waits for (docs/spec/calls.md, tests). A fake records each occurrence that a test can observe
// (a posted message, a served call, a log record, a delivered event) in a recorded list, and each push runs the waits whose
// check now holds, in the turn of the push. A test awaits the occurrence that it asserts; a wait has no limit, no count of
// turns and no timer. The end of the event loop is the event after which no occurrence can come: the process emits
// beforeExit when nothing is left to run, and each wait still open then is rejected with the state it waits for, so the
// test fails by that event.

/** The waits of this process that have not resolved. A wait leaves the set when it resolves or is rejected. */
const open = new Set();

process.on("beforeExit", () => {
  for (const wait of [...open]) {
    open.delete(wait);
    wait.reject(new Error(`the event loop ended before ${wait.what}`));
  }
});

/**
 * A wait for what: start(resolve, reject) runs at once, as the executor of a promise. The wait resolves or rejects by
 * start, or is rejected at the end of the event loop.
 */
export function waitFor(what, start) {
  return new Promise((resolve, reject) => {
    const wait = {
      what,
      resolve: (value) => { open.delete(wait); resolve(value); },
      reject: (error) => { open.delete(wait); reject(error); },
    };
    open.add(wait);
    start(wait.resolve, wait.reject);
  });
}

/** A wait for what that the fake marks: {promise, resolve}; resolve marks the occurrence. */
export function occurrence(what) {
  let mark;
  const promise = waitFor(what, (resolve) => { mark = resolve; });
  return { promise, resolve: mark };
}

/**
 * Creates the waits of one fake. until(check, what) resolves once check() holds, at once or at the push that makes it hold;
 * what names the state for the end of the event loop and is the source of check when it is not given.
 */
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
  const until = (check, what = `${check} held`) => waitFor(what, (resolve) => {
    if (check()) resolve();
    else checks.add({ check, resolve });
  });
  return { recorded, until, changed };
}
