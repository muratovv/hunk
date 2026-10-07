---
"hunkdiff": minor
---

Add a commit-range slider to the bottom of the files pane. For a diff against one revision (or
between two commits), its positions are the commits in between plus the uncommitted work when there
is any. Drag a handle, click the track, or press `C` and use `h`/`l` (`tab` switches handles, `H`/`L`
slide the range) to re-scope the review; the range is inclusive, so both handles on one commit show
exactly that commit. Refresh and watch pick up new commits and uncommitted work. Reviewer notes stay
on the content they were written on: a note is hidden while its content is off screen, and a note
left on a commit's version of a file records that commit in the `--store-notes` sidecar.
