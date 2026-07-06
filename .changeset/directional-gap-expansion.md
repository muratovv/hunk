---
"hunkdiff": minor
---

Expand diff context around hunks GitHub-style: each collapsed gap now grows a step
at a time from the top (▲) or bottom (▼) instead of revealing the whole gap at
once. Click the chevrons or use `z` (expand up) / `Shift+z` (expand down); a Hide
control resets the gap. Set the step size with `expand_step` in `.hunk/config.toml`
(default 20).
