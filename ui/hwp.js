// The HWP surface: opens the .hwp or .hwpx file tab.params.path of the project through the files sidecar with rhwp,
// draws its pages, edits the body text at a caret and saves the file in its own format (docs/features.md).
import { formatOf, fromBase64, loadRhwp, openDocument, toBase64 } from "./document.js";
import { connect } from "./requests.js";

const css = `:host{display:block;height:100%}
#frame{display:flex;height:100%;flex-direction:column;background:var(--card);color:var(--fg);font:var(--text-control)/1.4 var(--ui-font)}
#banner{display:flex;align-items:center;gap:8px;padding:4px 8px;border-bottom:1px solid var(--rule)}
#banner span{flex:1;min-width:0}
button{padding:2px 6px;border:0;border-radius:var(--r-xs);background:transparent;color:var(--muted);font:inherit;cursor:pointer}
button:hover{background:var(--inset);color:var(--fg)}
#scroller{flex:1;min-height:0;overflow:auto;background:var(--inset)}
#pages{position:relative;padding:12px;cursor:text}
#sheets{display:flex;flex-direction:column;align-items:center;gap:12px}
#overlay{position:absolute;left:0;top:0;width:0;height:0}
.page{position:relative;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.page>svg{display:block}
#caret{position:absolute;width:1.5px;background:#000;pointer-events:none}
#preedit{position:absolute;color:#000;background:#fff;border-bottom:1px solid #000;white-space:pre;pointer-events:none;font:inherit}
#input{position:absolute;width:1px;height:1em;padding:0;border:0;opacity:0;resize:none;overflow:hidden}
[hidden]{display:none!important}`;

const HTML = `<style>${css}</style><div id="frame" data-expose="hwp.frame">
<div id="banner" data-expose="hwp.banner" hidden><span></span><button data-expose="hwp.reload">다시 읽기</button><button data-expose="hwp.overwrite">덮어쓰기</button></div>
<div id="scroller"><div id="pages" data-expose="hwp.pages"><div id="sheets"></div><div id="overlay"></div></div></div></div>`;

/** Whether event is Command with key, without other modifiers. */
const shortcut = (event, key) => event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.code === `Key${key.toUpperCase()}`;

/* The edit of each beforeinput type that the input field turns into a command; composition is handled apart. */
const INPUT_ACTIONS = { insertText: "insert", insertLineBreak: "enter", insertParagraph: "enter", deleteContentBackward: "backspace", deleteContentForward: "delete" };
/* The edit of each key that moves the caret. */
const KEY_ACTIONS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

export async function mount(root, context) {
  // default: a tab without params cannot name a file; core.file.open always passes {path}.
  const path = context.tab.params?.path;
  if (typeof path !== "string" || path === "") throw new Error("the hwp tab requires params.path");
  if (context.project === null) throw new Error("this window shows no project");
  const format = formatOf(path);
  context.tab.title(path.slice(path.lastIndexOf("/") + 1));
  root.innerHTML = HTML;
  const frame = root.querySelector("#frame");
  const banner = root.querySelector("#banner");
  const pagesElement = root.querySelector("#pages");
  const sheets = root.querySelector("#sheets");
  const overlay = root.querySelector("#overlay");
  const caretElement = root.ownerDocument.createElement("div");
  caretElement.id = "caret";
  const preedit = root.ownerDocument.createElement("div");
  preedit.id = "preedit";
  preedit.hidden = true;
  const input = root.ownerDocument.createElement("textarea");
  input.id = "input";
  input.dataset.expose = "hwp.input";
  input.setAttribute("aria-label", path);
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocomplete", "off");
  input.spellcheck = false;
  // The caret, the composition and the input field stay in a layer that drawing does not replace, because moving the
  // focused input field into a new page would take its focus.
  overlay.append(caretElement, preedit, input);

  let document = null;
  let state = { path, format, version: null, modified: false, pages: 0, caret: { section: 0, paragraph: 0, offset: 0 },
    caretRect: { page: 0, x: 0, y: 0, height: 0 }, composing: "", disk: "same" };
  let edits = 0;
  let savedEdits = 0;
  let diskVersion = null;
  const listeners = new Set();
  const publish = () => { for (const fn of listeners) fn(state); };

  const showBanner = (text) => {
    banner.hidden = text === null;
    banner.querySelector("span").textContent = text ?? "";
  };

  /** Draws every page and places the caret, the composition and the input field at the caret. */
  const draw = () => {
    const count = document.pageCount();
    const pages = [];
    for (let page = 0; page < count; page += 1) {
      const element = root.ownerDocument.createElement("div");
      element.className = "page";
      element.dataset.page = String(page);
      element.innerHTML = document.renderPage(page);
      pages.push(element);
    }
    sheets.replaceChildren(...pages);
    const rect = document.caretRect();
    const page = pages[rect.pageIndex];
    if (!page) throw new Error(`the caret is on page ${rect.pageIndex} of ${count}`);
    // The layer starts at the top left corner of the pages element; the page's offset places the caret on the page.
    const x = page.offsetLeft + rect.x;
    const y = page.offsetTop + rect.y;
    const { height } = rect;
    Object.assign(caretElement.style, { left: `${x}px`, top: `${y}px`, height: `${height}px` });
    Object.assign(preedit.style, { left: `${x}px`, top: `${y}px`, height: `${height}px`, fontSize: `${height * 0.85}px` });
    Object.assign(input.style, { left: `${x}px`, top: `${y}px` });
    state = { ...state, pages: count, caret: document.caret, caretRect: { page: rect.pageIndex, x: rect.x, y: rect.y, height },
      modified: edits !== savedEdits };
    publish();
  };

  const files = await connect(context.runtime.sidecar(), context.surfaceId, (body) => {
    if (body.changed !== undefined) {
      diskChanged().catch((error) => context.tab.error(`다시 읽지 못했습니다 · ${error.message}`));
      return;
    }
    context.tab.error(`파일 감시가 멈췄습니다 · ${body.error}`);
  });
  const read = () => files.request({ operation: "readBytes", path });

  const load = (body) => {
    const next = openDocument(fromBase64(body.data), format);
    document?.free();
    document = next;
    edits = 0;
    savedEdits = 0;
    diskVersion = body.version;
    state = { ...state, version: body.version, disk: "same" };
    showBanner(null);
    draw();
    context.tab.modified(false);
  };

  async function diskChanged() {
    const body = await read();
    if (body.version === state.version) return;
    if (edits === savedEdits) {
      load(body);
      return;
    }
    diskVersion = body.version;
    state = { ...state, disk: "changed" };
    showBanner("디스크의 파일이 바뀌었습니다");
    publish();
  }

  const save = async ({ overwrite = false } = {}) => {
    if (typeof overwrite !== "boolean") throw new TypeError("hwp.save requires overwrite as true or false");
    try {
      const bytes = document.save();
      const reply = await files.request({ operation: "writeBytes", path, data: toBase64(bytes),
        expect: overwrite ? diskVersion : state.version });
      savedEdits = edits;
      diskVersion = reply.version;
      state = { ...state, version: reply.version, disk: "same", modified: false };
      showBanner(null);
      context.tab.modified(false);
      context.tab.error(null);
      publish();
      return { version: reply.version };
    } catch (error) {
      context.tab.error(`저장하지 못했습니다 · ${error.message}`);
      throw error;
    }
  };

  const reload = async () => {
    let body;
    try {
      body = await read();
    } catch (error) {
      context.tab.error(`다시 읽지 못했습니다 · ${error.message}`);
      throw error;
    }
    load(body);
    context.tab.error(null);
    return { version: body.version };
  };

  /** Applies an edit of the body text and draws the pages again. */
  const edit = ({ action, text } = {}) => {
    const before = edits;
    switch (action) {
      case "insert": document.insert(text); edits += 1; break;
      case "enter": document.enter(); edits += 1; break;
      case "backspace": document.backspace(); edits += 1; break;
      case "delete": document.delete(); edits += 1; break;
      case "left": document.left(); break;
      case "right": document.right(); break;
      case "up": document.vertical(-1); break;
      case "down": document.vertical(1); break;
      default: throw new Error(`hwp.edit has no action ${JSON.stringify(action)}`);
    }
    draw();
    if (before === savedEdits && edits !== savedEdits) context.tab.modified(true);
    return { caret: document.caret };
  };

  const point = ({ page, x, y } = {}) => {
    if (!Number.isInteger(page) || page < 0 || page >= document.pageCount() || !Number.isFinite(x) || !Number.isFinite(y)) {
      throw new RangeError(`hwp.point requires a page from 0 to ${document.pageCount() - 1} and a point`);
    }
    document.hit(page, x, y);
    draw();
    input.focus();
    return { caret: document.caret };
  };

  const compose = ({ text } = {}) => {
    if (typeof text !== "string") throw new TypeError("hwp.compose requires text");
    preedit.textContent = text;
    preedit.hidden = text === "";
    state = { ...state, composing: text };
    publish();
    return null;
  };

  await loadRhwp();
  load(await read());
  await files.request({ operation: "watch", paths: [path] });

  const expose = context.exposure;
  expose.status("hwp.document", () => state, (fn) => { listeners.add(fn); fn(state); return () => listeners.delete(fn); });
  expose.command("hwp.save", save);
  expose.command("hwp.reload", reload);
  expose.command("hwp.edit", edit);
  expose.command("hwp.point", point);
  expose.command("hwp.compose", compose);
  expose.command("hwp.text", () => document.text());
  expose.command("hwp.caret", (caret) => { document.place(caret); draw(); return { caret: document.caret }; });
  expose.command("hwp.focus", () => { input.focus(); return null; });
  for (const element of root.querySelectorAll("[data-expose]")) expose.dom(element.dataset.expose, element);

  // save and reload show their failures as the tab error, so a control that runs them does not report them again.
  const shown = () => {};
  await expose.bind(frame, "hwp.save", {}, { event: "keydown", when: (event) => shortcut(event, "s") && (event.preventDefault(), true), failed: shown });
  await expose.bind(banner.querySelector('[data-expose="hwp.reload"]'), "hwp.reload", {}, { failed: shown });
  await expose.bind(banner.querySelector('[data-expose="hwp.overwrite"]'), "hwp.save", { overwrite: true }, { failed: shown });
  // A click on a page places the caret at the point in page coordinates; a page draws at its own size, and the card
  // zoom scales the rectangle, so the point is scaled back by the page's width.
  await expose.bind(pagesElement, "hwp.point", (event) => {
    const page = event.target.closest(".page");
    const rect = page.getBoundingClientRect();
    const scale = page.offsetWidth / rect.width;
    return { page: Number(page.dataset.page), x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale };
  }, { event: "mousedown", when: (event) => event.target.closest(".page") !== null && (event.preventDefault(), true) });
  // The input field takes typed text, composition and editing keys at the caret; the edits run hwp.edit.
  await expose.bind(input, "hwp.edit", (event) => ({ action: INPUT_ACTIONS[event.inputType], text: event.data }), {
    event: "beforeinput",
    when: (event) => !event.isComposing && Object.hasOwn(INPUT_ACTIONS, event.inputType) && (event.preventDefault(), true),
  });
  await expose.bind(input, "hwp.edit", (event) => ({ action: KEY_ACTIONS[event.key] }), {
    event: "keydown",
    when: (event) => !event.isComposing && !event.metaKey && !event.ctrlKey && !event.altKey && Object.hasOwn(KEY_ACTIONS, event.key)
      && (event.preventDefault(), true),
  });
  await expose.bind(input, "hwp.edit", (event) => {
    input.value = "";
    compose({ text: "" });
    return { action: "insert", text: event.data };
  }, { event: "compositionend", when: (event) => typeof event.data === "string" && event.data !== "" });
  const composing = (event) => compose({ text: event.data });
  input.addEventListener("compositionupdate", composing);

  context.status.report("ready");
  return {
    focus: () => input.focus(),
    async dispose() {
      input.removeEventListener("compositionupdate", composing);
      listeners.clear();
      files.dispose();
      document.free();
      await expose.dispose();
      root.replaceChildren();
    },
  };
}
