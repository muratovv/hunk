import type { KeyEvent } from "@opentui/core";

/**
 * Physical-key layout normalization for keyboard shortcuts.
 *
 * Shortcut handlers match on the *produced character* (`key.name` /
 * `key.sequence`). On a non-Latin layout the same physical key produces a
 * different glyph — pressing physical `q` on a Russian (ЙЦУКЕН) layout delivers
 * `й`, so `key.name === "q"` never matches and the shortcut looks dead.
 *
 * We translate the produced glyph back to the US-QWERTY glyph at the same
 * physical key, at the single dispatch choke-point, before matching. Because we
 * key off the produced glyph (there is no reliable physical keycode on the raw
 * terminal input path — Kitty's `baseCode` is absent in tmux/Terminal.app), the
 * table may ONLY contain glyphs a US-layout user never types: i.e. non-Latin
 * glyphs. Mapping a Latin glyph (e.g. `.` → `/`) would hijack legitimate
 * US-layout input, so those entries are deliberately omitted (see note below).
 */

/**
 * Per-layout maps: produced glyph → US-QWERTY glyph at the same physical key.
 * Add support for another non-Latin layout by adding a record here — the
 * normalizer needs no code change.
 */
const LAYOUT_MAPS: Record<string, Record<string, string>> = {
  // Russian ЙЦУКЕН. Covers the three letter rows; every glyph is non-Latin, so
  // no entry can collide with US-layout input.
  //
  // Deliberately omitted: the US `/` key on ЙЦУКЕН produces Latin `.`
  // (unshifted) and `,` (shifted). Mapping those back would break `.`/`,` file
  // navigation for US-layout users, so `/` (filter) and `?` (help) are not
  // reachable by physical position on a Russian layout — an inherent limit of
  // glyph-based normalization.
  ru: {
    // Top row: q w e r t y u i o p [ ]
    й: "q", ц: "w", у: "e", к: "r", е: "t", н: "y", г: "u", ш: "i", щ: "o", з: "p", х: "[", ъ: "]",
    Й: "Q", Ц: "W", У: "E", К: "R", Е: "T", Н: "Y", Г: "U", Ш: "I", Щ: "O", З: "P", Х: "{", Ъ: "}",
    // Home row: a s d f g h j k l ; '
    ф: "a", ы: "s", в: "d", а: "f", п: "g", р: "h", о: "j", л: "k", д: "l", ж: ";", э: "'",
    Ф: "A", Ы: "S", В: "D", А: "F", П: "G", Р: "H", О: "J", Л: "K", Д: "L", Ж: ":", Э: '"',
    // Bottom row: z x c v b n m , .
    я: "z", ч: "x", с: "c", м: "v", и: "b", т: "n", ь: "m", б: ",", ю: ".",
    Я: "Z", Ч: "X", С: "C", М: "V", И: "B", Т: "N", Ь: "M", Б: "<", Ю: ">",
  },
};

/** Flattened produced-glyph → US-QWERTY-glyph lookup across all known layouts. */
const GLYPH_TO_LATIN: Record<string, string> = Object.assign({}, ...Object.values(LAYOUT_MAPS));

/** Look up the US-QWERTY equivalent of a produced glyph, if any. */
function latinFor(key: KeyEvent): string | undefined {
  return GLYPH_TO_LATIN[key.name] ?? GLYPH_TO_LATIN[key.sequence];
}

/**
 * Return a key whose `name`/`sequence` are translated to their US-QWERTY
 * equivalent when the produced glyph belongs to a known non-Latin layout;
 * otherwise return the key unchanged.
 *
 * The result is a copy — the original event is left untouched so other keypress
 * subscribers (Ctrl-C handling, focused text inputs) still see the literal
 * glyph. Ctrl/Meta chords are passed through untouched: they carry Latin key
 * names already and must not be reinterpreted.
 */
export function normalizeKeyEvent(key: KeyEvent): KeyEvent {
  if (key.ctrl || key.meta) {
    return key;
  }

  const latin = latinFor(key);
  if (latin === undefined) {
    return key;
  }

  // Preserve the prototype (KeyEvent methods like preventDefault) while
  // overriding only the two matched fields; never mutate the shared event.
  return Object.create(Object.getPrototypeOf(key), {
    ...Object.getOwnPropertyDescriptors(key),
    name: { value: latin, enumerable: true, writable: true, configurable: true },
    sequence: { value: latin, enumerable: true, writable: true, configurable: true },
  }) as KeyEvent;
}
