---
"hunkdiff": minor
---

Add a commit-range slider to the bottom of the files pane. For a diff against one revision (or
between two commits), the slider lists every commit on the line between them; drag a handle, click
the track, or press `C` and use `h`/`l` (`tab` switches handles, `H`/`L` slide the range) to re-scope
the review to any sub-range, with the working tree as the newest position. Reviewer notes stay on
the content they were written on: a note is hidden while its content is off screen, and a note left
on a commit's version of a file records that commit in the `--store-notes` sidecar.
