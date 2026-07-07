/** Minimal anchor shape a note needs to be an edit target. */
export interface EditTargetCandidate {
  hunkIndex: number;
  side: "old" | "new";
  line: number;
}

/** A concrete line anchor to measure candidate distance against. */
export interface EditTargetReference {
  side: "old" | "new";
  line: number;
}

/**
 * Pick which user note a keyboard "edit" should target on the selected hunk.
 *
 * Named on purpose (not an ad-hoc array index): only notes on `hunkIndex` are
 * candidates, kept in their sidebar order. With a `reference` line, choose the
 * candidate whose anchor line is nearest (ties broken toward the same side, then
 * earliest in order). Without a reference, choose the first candidate. No
 * candidates → null.
 */
export function resolveEditTargetNote<T extends EditTargetCandidate>(
  notes: readonly T[],
  hunkIndex: number,
  reference?: EditTargetReference,
): T | null {
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestSameSide = false;

  for (const note of notes) {
    if (note.hunkIndex !== hunkIndex) {
      continue;
    }

    // No reference line: the first candidate in sidebar order wins.
    if (!reference) {
      return note;
    }

    const distance = Math.abs(note.line - reference.line);
    const sameSide = note.side === reference.side;
    const closer = distance < bestDistance;
    const sameDistanceBetterSide = distance === bestDistance && sameSide && !bestSameSide;
    if (best === null || closer || sameDistanceBetterSide) {
      best = note;
      bestDistance = distance;
      bestSameSide = sameSide;
    }
  }

  return best;
}
