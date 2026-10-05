import { describe, expect, test } from "bun:test";
import { KeyEvent, type ParsedKey } from "@opentui/core";
import { normalizeKeyEvent } from "./keyboardLayout";

/** Build the event OpenTUI's raw parser emits for one printable character. */
function rawKey(char: string, fields: Partial<ParsedKey> = {}) {
  return new KeyEvent({
    name: char,
    sequence: char,
    raw: char,
    ctrl: false,
    meta: false,
    option: false,
    shift: false,
    number: false,
    eventType: "press",
    source: "raw",
    ...fields,
  });
}

describe("normalizeKeyEvent", () => {
  test("reads a Russian-layout glyph as the US-QWERTY key at the same position", () => {
    const key = normalizeKeyEvent(rawKey("й"));

    expect(key.name).toBe("q");
    expect(key.sequence).toBe("q");
  });

  test("covers all three ЙЦУКЕН letter rows, unshifted and shifted", () => {
    const layout = "йцукенгшщзхъфывапролджэячсмитьбюЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ";
    const us = "qwertyuiop[]asdfghjkl;'zxcvbnm,.QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>";

    const normalized = [...layout]
      .map((glyph) => normalizeKeyEvent(rawKey(glyph)).sequence)
      .join("");

    expect(normalized).toBe(us);
  });

  test("consuming the normalized key consumes the event OpenTUI routes on", () => {
    const raw = rawKey("о");
    const key = normalizeKeyEvent(raw);

    key.preventDefault();
    key.stopPropagation();

    expect(raw.defaultPrevented).toBe(true);
    expect(raw.propagationStopped).toBe(true);
    expect(key.defaultPrevented).toBe(true);
  });

  test("never rewrites the raw event focused text inputs receive", () => {
    const raw = rawKey("й", { shift: false, source: "kitty" });
    const key = normalizeKeyEvent(raw);

    expect(raw.name).toBe("й");
    expect(raw.sequence).toBe("й");
    expect(key.raw).toBe("й");
    expect(key.source).toBe("kitty");
  });

  test("passes modifier chords through untouched", () => {
    for (const modifier of ["ctrl", "meta", "option"] as const) {
      const key = rawKey("й", { [modifier]: true });
      expect(normalizeKeyEvent(key)).toBe(key);
    }
  });

  test("leaves US-layout input as the very same event", () => {
    for (const char of ["q", "Q", ".", ",", "/", "?", "[", "1"]) {
      const key = rawKey(char);
      expect(normalizeKeyEvent(key)).toBe(key);
    }
  });
});
