// A probe of two waits whose occurrence never comes (docs/spec/calls.md, tests): the runner fails each test at its limit with its
// name.
import { test } from "node:test";
import { occurrence } from "./occurrences.mjs";

test("the first wait that never comes fails at the limit of the runner", async () => {
  await occurrence("the first occurrence").promise;
});

test("the second wait that never comes fails at the limit of the runner", async () => {
  await occurrence("the second occurrence").promise;
});
