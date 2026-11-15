// Registers the resolve hook of the plugin API fixture: `node --import ./test/fixtures/plugin-api/register.mjs --test test/`.
// The hook runs in the thread of the test process (module.registerHooks), so the modules of the fixture that it maps are the same
// instances that the tests import.
import { registerHooks } from "node:module";
import { resolve } from "./hook.mjs";

registerHooks({ resolve });
