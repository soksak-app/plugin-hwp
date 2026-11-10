// The view starts no timer (docs/spec/calls.md): a wait of the page ends by the event that it waits for, never by a limit.
// recordTimers wraps setTimeout and setInterval of the process once. A call whose caller is a file under the built ui is
// recorded as {name, delay, file} in the list of the latest recordTimers and does not start: the test asserts the list at
// the point where the wait has begun, so a wait that starts a timer fails at that point and names the timer. A call of a
// fake, of jsdom or of node starts its timer as before.

const source = /\/build\/test\/ui\/[^/]+\.js/;
let sink = null;

/** Records each timer that a built ui file starts from now on in list (a recorded list of test/occurrences.mjs). */
export function recordTimers(list) {
  sink = list;
  for (const name of ["setTimeout", "setInterval"]) {
    const start = globalThis[name];
    if (start.recordsTimers) continue;
    const recording = function (callback, delay, ...rest) {
      const caller = new Error().stack.split("\n")[2] ?? "";
      const file = caller.match(source)?.[0];
      if (file === undefined) return start.call(this, callback, delay, ...rest);
      sink?.push({ name, delay: delay ?? 0, file });
      return { recorded: name };
    };
    recording.recordsTimers = true;
    globalThis[name] = recording;
  }
  return list;
}
