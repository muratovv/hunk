---
"hunkdiff": patch
---

Make single-key shortcuts work on non-Latin layouts. With a Russian (ЙЦУКЕН)
layout active, physical `q` sent `й`, so quit, hunk/file navigation, notes and
the other single-key shortcuts silently did nothing. Keys are now matched by
their physical US-QWERTY position, while the file filter, note drafts and
extension inputs still receive the literal character.
