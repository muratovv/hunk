import type { KeyEvent } from "@opentui/core";

/**
 * Layout-independent shortcuts: read a non-Latin glyph as the US-QWERTY key at the same position.
 *
 * Shortcuts match the produced character, so on ЙЦУКЕН physical `q` arrives as `й` and never
 * matches. The glyph is the only signal: tmux has no kitty keyboard protocol, and under OpenTUI's
 * default kitty flags unmodified text keys still arrive as plain UTF-8, with no base-layout key. The table holds non-Latin
 * glyphs only — ЙЦУКЕН puts Latin `.`/`,` on the US `/` key, and mapping those would hijack
 * US-layout `.`/`,` navigation, so `/` and `?` stay unreachable by position.
 */
const LAYOUT_ROWS: ReadonlyArray<readonly [layout: string, us: string]> = [
  ["йцукенгшщзхъ", "qwertyuiop[]"],
  ["фывапролджэ", "asdfghjkl;'"],
  ["ячсмитьбю", "zxcvbnm,."],
  ["ЙЦУКЕНГШЩЗХЪ", "QWERTYUIOP{}"],
  ["ФЫВАПРОЛДЖЭ", 'ASDFGHJKL:"'],
  ["ЯЧСМИТЬБЮ", "ZXCVBNM<>"],
];

const GLYPH_TO_US = new Map(
  LAYOUT_ROWS.flatMap(([layout, us]) =>
    [...layout].map((glyph, index) => [glyph, us[index]!] as const),
  ),
);

/** Return the key as shortcut matching should see it, translating a known non-Latin glyph. */
export function normalizeKeyEvent(key: KeyEvent): KeyEvent {
  // Only plain text keys are layout glyphs; a chord keeps whatever the terminal reported.
  if (key.ctrl || key.meta || key.option) {
    return key;
  }

  const name = GLYPH_TO_US.get(key.name);
  const sequence = GLYPH_TO_US.get(key.sequence);
  if (name === undefined && sequence === undefined) {
    return key;
  }

  // A view over the raw event: other fields read through, and consuming it must mark the raw
  // event, which OpenTUI checks before handing the key to the focused renderable.
  return Object.create(key, {
    name: { value: name ?? key.name, enumerable: true },
    sequence: { value: sequence ?? key.sequence, enumerable: true },
    preventDefault: { value: () => key.preventDefault() },
    stopPropagation: { value: () => key.stopPropagation() },
  }) as KeyEvent;
}
