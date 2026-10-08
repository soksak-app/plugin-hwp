// A jsdom document as the global document of a test.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<div id='mount'></div>", { url: "https://app.test/", pretendToBeVisual: true });
const { window } = dom;
for (const name of ["window", "document", "navigator", "getComputedStyle", "Node", "HTMLElement", "Element", "Event",
  "KeyboardEvent", "InputEvent", "CompositionEvent", "MouseEvent"]) {
  Object.defineProperty(globalThis, name, { value: name === "window" ? window : window[name], configurable: true, writable: true });
}

export { window };
