import { describe, expect, it } from "bun:test";
import type { KeyEvent } from "@opentui/core";
import { normalizeKeyEvent } from "./keyboardLayout";

function createKeyEvent(overrides: Partial<KeyEvent>): KeyEvent {
  return {
    ctrl: false,
    meta: false,
    option: false,
    shift: false,
    name: "",
    sequence: "",
    raw: "",
    ...overrides,
  } as KeyEvent;
}

describe("normalizeKeyEvent — Russian ЙЦУКЕН letters", () => {
  // Every bound single-letter shortcut, keyed by the Cyrillic glyph the physical
  // key produces on a Russian layout → the Latin the handler matches.
  const letterCases: Array<[string, string]> = [
    ["й", "q"], // quit
    ["ы", "s"], // sidebar
    ["к", "r"], // refresh
    ["е", "t"], // theme
    ["ф", "a"], // agent notes
    ["д", "l"], // line numbers
    ["ц", "w"], // line wrap
    ["ь", "m"], // hunk headers
    ["я", "z"], // expand gap up
    ["п", "g"], // jump top
    ["с", "c"], // create note
    ["а", "f"], // page down
    ["и", "b"], // page up
    ["о", "j"], // step down
    ["л", "k"], // step up
    ["в", "d"], // half page down
    ["у", "e"], // edit file
    ["г", "u"], // half page up
  ];

  for (const [cyrillic, latin] of letterCases) {
    it(`maps ${cyrillic} → ${latin} on name and sequence`, () => {
      const normalized = normalizeKeyEvent(createKeyEvent({ name: cyrillic, sequence: cyrillic }));
      expect(normalized.name).toBe(latin);
      expect(normalized.sequence).toBe(latin);
    });
  }
});

describe("normalizeKeyEvent — bound punctuation", () => {
  const punctuationCases: Array<[string, string]> = [
    ["х", "["], // hunk prev
    ["ъ", "]"], // hunk next
    ["Х", "{"], // annotated-hunk prev (shift)
    ["Ъ", "}"], // annotated-hunk next (shift)
    ["б", ","], // file prev
    ["ю", "."], // file next
  ];

  for (const [cyrillic, latin] of punctuationCases) {
    it(`maps ${cyrillic} → ${latin}`, () => {
      const normalized = normalizeKeyEvent(createKeyEvent({ name: cyrillic, sequence: cyrillic }));
      expect(normalized.name).toBe(latin);
      expect(normalized.sequence).toBe(latin);
    });
  }
});

describe("normalizeKeyEvent — Shift/uppercase variants keep shift", () => {
  const shiftCases: Array<[string, string]> = [
    ["У", "E"], // edit note (Shift+E)
    ["П", "G"], // jump bottom (Shift+G)
    ["Ь", "M"], // menu bar (Shift+M)
    ["Я", "Z"], // expand gap down (Shift+Z)
  ];

  for (const [cyrillic, latin] of shiftCases) {
    it(`maps ${cyrillic} → ${latin} with shift preserved`, () => {
      const normalized = normalizeKeyEvent(
        createKeyEvent({ name: cyrillic, sequence: cyrillic, shift: true }),
      );
      expect(normalized.sequence).toBe(latin);
      expect(normalized.shift).toBe(true);
    });
  }
});

describe("normalizeKeyEvent — passthrough (no regression for other layouts)", () => {
  it("leaves Latin letters untouched", () => {
    const key = createKeyEvent({ name: "q", sequence: "q" });
    expect(normalizeKeyEvent(key)).toBe(key);
  });

  it("leaves Latin punctuation untouched so US `.`/`,` file nav still works", () => {
    for (const glyph of [".", ",", "[", "]", "/", "?"]) {
      const key = createKeyEvent({ name: glyph, sequence: glyph });
      expect(normalizeKeyEvent(key)).toBe(key);
    }
  });

  it("leaves digits untouched (identical on Russian layout)", () => {
    for (const glyph of ["0", "1", "2"]) {
      const key = createKeyEvent({ name: glyph, sequence: glyph });
      expect(normalizeKeyEvent(key)).toBe(key);
    }
  });

  it("leaves named special keys untouched", () => {
    for (const name of ["escape", "return", "up", "down", "tab", "space", "pagedown"]) {
      const key = createKeyEvent({ name });
      expect(normalizeKeyEvent(key)).toBe(key);
    }
  });

  it("passes Ctrl and Meta chords through untouched", () => {
    const ctrlKey = createKeyEvent({ name: "й", sequence: "й", ctrl: true });
    expect(normalizeKeyEvent(ctrlKey)).toBe(ctrlKey);
    const metaKey = createKeyEvent({ name: "й", sequence: "й", meta: true });
    expect(normalizeKeyEvent(metaKey)).toBe(metaKey);
  });
});

describe("normalizeKeyEvent — copy semantics (R6: literal text entry preserved)", () => {
  it("returns a copy without mutating the original event", () => {
    const original = createKeyEvent({ name: "й", sequence: "й" });
    const normalized = normalizeKeyEvent(original);

    expect(normalized).not.toBe(original);
    expect(original.name).toBe("й");
    expect(original.sequence).toBe("й");
    expect(normalized.name).toBe("q");
  });

  it("preserves prototype methods on the copy", () => {
    const proto = { preventDefault() {}, stopPropagation() {} };
    const original = Object.assign(Object.create(proto), {
      ctrl: false,
      meta: false,
      shift: false,
      name: "й",
      sequence: "й",
    }) as unknown as KeyEvent;

    const normalized = normalizeKeyEvent(original);
    expect(typeof normalized.preventDefault).toBe("function");
    expect(() => normalized.preventDefault()).not.toThrow();
  });
});
