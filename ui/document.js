// An HWP or HWPX document of rhwp with a caret: the editing operations of the surface (docs/features.md).
import initRhwp, { HwpDocument } from "./vendor/rhwp.js";

let ready = null;

/** Loads the rhwp WebAssembly module once; input is what rhwp's init takes, and the page passes nothing. */
export function loadRhwp(input) {
  // default: the page loads rhwp_bg.wasm beside rhwp.js, which rhwp's init finds from its own URL.
  ready ??= initRhwp(input === undefined ? undefined : { module_or_path: input });
  return ready;
}

/** The bytes of standard base64 with padding. */
export function fromBase64(data) {
  const text = atob(data);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
  return bytes;
}

/** Standard base64 with padding of bytes. */
export function toBase64(bytes) {
  let text = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(text);
}

/** The format of a file name: hwpx for .hwpx and hwp for .hwp; another name is an error. */
export function formatOf(path) {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (name.endsWith(".hwpx")) return "hwpx";
  if (name.endsWith(".hwp")) return "hwp";
  throw new Error(`${path} is not an .hwp or .hwpx file`);
}

const parse = (json, operation) => {
  const value = JSON.parse(json);
  if (value && value.ok === false) throw new Error(`${operation}: ${value.error ?? json}`);
  return value;
};

/**
 * A document opened from bytes, saved in its own format, with a caret {section, paragraph, offset} in the body text.
 * Each edit returns the caret after it.
 */
export function openDocument(bytes, format) {
  const document = new HwpDocument(bytes);
  let caret = { section: 0, paragraph: 0, offset: 0 };
  const length = (section, paragraph) => document.getParagraphLength(section, paragraph);
  const paragraphs = (section) => document.getParagraphCount(section);
  const sections = () => document.getSectionCount();
  const place = (next) => {
    if (!Number.isInteger(next.section) || next.section < 0 || next.section >= sections()) {
      throw new RangeError(`section ${next.section} is outside the ${sections()} sections`);
    }
    if (!Number.isInteger(next.paragraph) || next.paragraph < 0 || next.paragraph >= paragraphs(next.section)) {
      throw new RangeError(`paragraph ${next.paragraph} is outside the ${paragraphs(next.section)} paragraphs of section ${next.section}`);
    }
    const end = length(next.section, next.paragraph);
    if (!Number.isInteger(next.offset) || next.offset < 0 || next.offset > end) {
      throw new RangeError(`offset ${next.offset} is outside paragraph ${next.paragraph}, which has ${end} characters`);
    }
    caret = { section: next.section, paragraph: next.paragraph, offset: next.offset };
    return caret;
  };
  return {
    format,
    get caret() { return caret; },
    pageCount: () => document.pageCount(),
    renderPage: (page) => document.renderPageSvg(page),
    /**
     * The caret rectangle in page coordinates: {pageIndex, x, y, height}. getCursorRect gives the caret's x, but on a
     * line with text it answers the baseline with height 0, so the top and the height come from the caret's line.
     */
    caretRect() {
      const point = JSON.parse(document.getCursorRect(caret.section, caret.paragraph, caret.offset));
      const { lineIndex } = JSON.parse(document.getLineInfo(caret.section, caret.paragraph, caret.offset));
      const none = 0xffffffff;
      const line = JSON.parse(document.getCursorRectOnLine(caret.section, caret.paragraph, lineIndex, false, none, none, none, none));
      return { pageIndex: line.pageIndex, x: point.x, y: line.y, height: line.height };
    },
    /** Places the caret at a point of a page. */
    hit(page, x, y) {
      const found = JSON.parse(document.hitTest(page, x, y));
      return place({ section: found.sectionIndex, paragraph: found.paragraphIndex, offset: found.charOffset });
    },
    place,
    /** The text of the body, its paragraphs joined by a line break and its sections by a blank line. */
    text() {
      const parts = [];
      for (let section = 0; section < sections(); section += 1) {
        const lines = [];
        for (let paragraph = 0; paragraph < paragraphs(section); paragraph += 1) {
          lines.push(length(section, paragraph) === 0 ? "" : document.getTextRange(section, paragraph, 0, length(section, paragraph)));
        }
        parts.push(lines.join("\n"));
      }
      return parts.join("\n\n");
    },
    insert(text) {
      if (typeof text !== "string" || text === "") throw new TypeError("insert requires text");
      const lines = text.split(/\r\n|\r|\n/);
      lines.forEach((line, index) => {
        if (index > 0) this.enter();
        if (line !== "") {
          const result = parse(document.insertText(caret.section, caret.paragraph, caret.offset, line), "insertText");
          caret = { ...caret, offset: result.charOffset };
        }
      });
      return caret;
    },
    enter() {
      const result = parse(document.splitParagraph(caret.section, caret.paragraph, caret.offset), "splitParagraph");
      caret = { section: caret.section, paragraph: result.paraIdx, offset: result.charOffset };
      return caret;
    },
    backspace() {
      if (caret.offset > 0) {
        parse(document.deleteText(caret.section, caret.paragraph, caret.offset - 1, 1), "deleteText");
        caret = { ...caret, offset: caret.offset - 1 };
      } else if (caret.paragraph > 0) {
        const result = parse(document.mergeParagraph(caret.section, caret.paragraph), "mergeParagraph");
        caret = { section: caret.section, paragraph: result.paraIdx, offset: result.charOffset };
      }
      return caret;
    },
    delete() {
      if (caret.offset < length(caret.section, caret.paragraph)) {
        parse(document.deleteText(caret.section, caret.paragraph, caret.offset, 1), "deleteText");
      } else if (caret.paragraph + 1 < paragraphs(caret.section)) {
        parse(document.mergeParagraph(caret.section, caret.paragraph + 1), "mergeParagraph");
      }
      return caret;
    },
    left() {
      if (caret.offset > 0) return place({ ...caret, offset: caret.offset - 1 });
      if (caret.paragraph > 0) return place({ ...caret, paragraph: caret.paragraph - 1, offset: length(caret.section, caret.paragraph - 1) });
      return caret;
    },
    right() {
      if (caret.offset < length(caret.section, caret.paragraph)) return place({ ...caret, offset: caret.offset + 1 });
      if (caret.paragraph + 1 < paragraphs(caret.section)) return place({ ...caret, paragraph: caret.paragraph + 1, offset: 0 });
      return caret;
    },
    /** Moves the caret one line up (-1) or down (+1). */
    vertical(delta) {
      const none = 0xffffffff;
      const found = JSON.parse(document.moveVertical(caret.section, caret.paragraph, caret.offset, delta, -1, none, none, none, none));
      return place({ section: found.sectionIndex, paragraph: found.paragraphIndex, offset: found.charOffset });
    },
    /** The bytes of the document in its own format; content that the format would lose is an error. */
    save() {
      const exported = format === "hwpx" ? document.exportHwpxWithReport() : document.exportHwpWithReport();
      const loss = JSON.parse(exported.contentLoss());
      if (loss.count > 0) {
        exported.free();
        throw new Error(`saving as ${format} would lose ${loss.count} items: ${JSON.stringify(loss.losses).slice(0, 400)}`);
      }
      return exported.takeBytes();
    },
    free: () => document.free(),
  };
}
