/**
 * Decides which reviewer notes annotate content the re-scoped review shows.
 *
 * A note's basis is the revision its side showed when it was written (null for the working
 * tree). It is visible only when the current view shows that same revision on that side and its
 * recorded owner hunk still covers its line; otherwise it is orphaned — hidden and inert, but kept
 * in the store and written back unchanged, so moving the range never moves a note.
 */
import { reviewHunkRange } from "../../core/review/geometry";
import {
  reviewNoteAnchorLine,
  reviewNoteOwnerHunkIndex,
  type ReviewNoteResolution,
  type ReviewStoredNote,
} from "../../core/review/state";
import type { ReviewDocumentV1, ReviewNoteV1, ReviewSide } from "../../core/review/types";

/** The revisions a review shows: `from` on the old side, `to` (null = working tree) on the new. */
export interface ReviewView {
  readonly from: string;
  readonly to: string | null;
}

/** Return the revision one side of the view shows. */
export function viewRevisionOfSide(view: ReviewView, side: ReviewSide): string | null {
  return side === "old" ? view.from : view.to;
}

/**
 * Resolve each user note against the view, by id.
 *
 * `basisOf` returns undefined when a note's basis is unknown; such notes stay active, which keeps
 * reviews without a timeline exactly as they were. Notes on files the view lacks are left out.
 */
export function userNoteResolutionsForView(
  notes: readonly ReviewStoredNote[],
  basisOf: (note: ReviewNoteV1) => string | null | undefined,
  view: ReviewView,
  document: ReviewDocumentV1,
): Map<string, ReviewNoteResolution> {
  const filesByKey = new Map(document.files.map((file) => [file.key, file]));
  const resolutions = new Map<string, ReviewNoteResolution>();
  for (const { note } of notes) {
    const file = filesByKey.get(note.fileKey);
    if (!file) continue;
    const basis = basisOf(note);
    if (basis === undefined) {
      resolutions.set(note.id, "active");
      continue;
    }
    const { side, line } = reviewNoteAnchorLine(note);
    const hunk = file.hunks[reviewNoteOwnerHunkIndex(note)];
    const [start, end] = hunk ? reviewHunkRange(hunk, side) : [1, 0];
    const visible = basis === viewRevisionOfSide(view, side) && line >= start && line <= end;
    resolutions.set(note.id, visible ? "active" : "orphaned");
  }
  return resolutions;
}
