---
"hunkdiff": patch
---

Make keyboard shortcuts work on non-Latin layouts. With a Russian (ЙЦУКЕН)
layout active, pressing physical `q` sent `й`, so quit, hunk/file navigation,
and other single-key shortcuts silently did nothing. Keys are now normalized to
their physical US-QWERTY equivalent before matching, while typing in the file
filter and review notes still inserts the literal character.
