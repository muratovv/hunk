/**
 * Collapsed-gap addressing: which file lines an expandable gap covers.
 *
 * A gap is addressed by a stable id (`before:<hunkIndex>` / `trailing:<hunkIndex>`) and
 * resolves to one inclusive line range per side. Renderers draw those ranges, expansion
 * slices source text with them, and note validation accepts or rejects a line against
 * them — so all three must resolve the same address (`docs/browser-review-seam-audit.md`,
 * A1/A2/A5).
 *
 * The input is the parsed diff geometry rather than a projected `ReviewFileV1`, so the
 * terminal's row builder can resolve an address without projecting a document first;
 * `reviewGapSourceForFile` adapts a semantic file onto the same shape.
 */
import type { ReviewHunkSpan } from "./geometry";
import type { ReviewFileChangeKind, ReviewFileV1, ReviewLineRange, ReviewSide } from "./types";

export type ReviewGapPosition = "before" | "trailing";

export interface ReviewGapHunk extends ReviewHunkSpan {
  collapsedBefore: number;
  additionLineIndex: number;
  deletionLineIndex: number;
}

/**
 * The parsed facts gap addressing needs.
 *
 * `additionLines` / `deletionLines` are the patch's per-side line arrays; their lengths
 * are the file's line totals only when the patch is complete, which is why a partial
 * patch has no trailing gap.
 */
export interface ReviewGapSource {
  hunks: readonly ReviewGapHunk[];
  additionLines: readonly string[];
  deletionLines: readonly string[];
  isPartial: boolean;
  /** One side's line total from loaded source; sizes a partial patch's trailing gap. */
  sourceLines?: { side: ReviewSide; count: number };
}

export interface ReviewGapAddress {
  position: ReviewGapPosition;
  hunkIndex: number;
  oldRange: ReviewLineRange;
  newRange: ReviewLineRange;
  /** Rows the gap renders; both sides always span exactly this many lines. */
  lineCount: number;
}

/** Lines one ▲ / ▼ press reveals (GitHub's step). */
export const REVIEW_GAP_REVEAL_STEP = 20;

/** Which edge of a gap a reveal grows from: `top` borders the hunk above, `bottom` the one below. */
export type ReviewGapEdge = "top" | "bottom";

/** Lines revealed from each edge of one gap; everything between them stays collapsed. */
export interface ReviewGapReveal {
  top: number;
  bottom: number;
}

/** Fit a reveal into a gap of `lineCount` lines; the top edge wins when the two overlap. */
export function clampReviewGapReveal(reveal: ReviewGapReveal, lineCount: number): ReviewGapReveal {
  const top = Math.max(0, Math.min(reveal.top, lineCount));
  return { top, bottom: Math.max(0, Math.min(reveal.bottom, lineCount - top)) };
}

/** Build the stable id of one collapsed gap inside a single file. */
export function reviewGapId(position: ReviewGapPosition, hunkIndex: number) {
  return `${position}:${hunkIndex}`;
}

/** Parse one gap id back into its position and hunk index, or undefined when malformed. */
export function parseReviewGapId(gapId: string) {
  const match = /^(before|trailing):(\d+)$/.exec(gapId);
  if (!match) {
    return undefined;
  }
  const hunkIndex = Number(match[2]);
  return Number.isSafeInteger(hunkIndex)
    ? { position: match[1] as ReviewGapPosition, hunkIndex }
    : undefined;
}

/** Adapt one projected semantic file onto the geometry gap addressing reads. */
export function reviewGapSourceForFile(file: ReviewFileV1): ReviewGapSource {
  return {
    hunks: file.hunks,
    additionLines: file.additionLines,
    deletionLines: file.deletionLines,
    isPartial: file.flags.partial,
  };
}

/**
 * The gap of unchanged lines the patch omitted before one hunk.
 *
 * Each side's gap ends at the last line before the hunk's own content. A side with rows
 * ends one line before its start; a side with none — the old side of a pure insertion,
 * the new side of a pure deletion — is positioned *at* that last line, so the gap ends
 * there. Getting this wrong shifts every expanded line label on that side by one, which
 * is exactly what the terminal's own copy did (A1).
 *
 * The gap's length is the parser's `collapsedBefore`. Returns undefined when there is no
 * gap, or when its start would fall outside the file.
 */
export function reviewLeadingGap(
  source: ReviewGapSource,
  hunkIndex: number,
): ReviewGapAddress | undefined {
  const hunk = source.hunks[hunkIndex];
  if (!hunk || hunk.collapsedBefore <= 0) {
    return undefined;
  }

  const oldEnd = hunk.deletionStart - (hunk.deletionCount > 0 ? 1 : 0);
  const newEnd = hunk.additionStart - (hunk.additionCount > 0 ? 1 : 0);
  const oldStart = oldEnd - hunk.collapsedBefore + 1;
  const newStart = newEnd - hunk.collapsedBefore + 1;
  if (oldStart <= 0 || newStart <= 0) {
    return undefined;
  }

  return {
    position: "before",
    hunkIndex,
    oldRange: [oldStart, oldEnd],
    newRange: [newStart, newEnd],
    lineCount: hunk.collapsedBefore,
  };
}

/**
 * The gap of unchanged lines after the file's last hunk.
 *
 * Length comes from what each side's line array has left over once the last hunk is
 * consumed, and the two leftovers must agree because the gap renders as paired rows. A
 * partial patch has no authoritative totals: its trailing gap exists only once a caller
 * supplies `sourceLines` from loaded source.
 *
 * Known limitation (A2): a last hunk with a zero-count side leaves the two leftovers one
 * apart, so no trailing gap is offered even though the file has unchanged lines after
 * the hunk. Every consumer agrees on hiding it — correcting the count changes what the
 * terminal renders and is staged as its own change.
 */
export function reviewTrailingGap(source: ReviewGapSource): ReviewGapAddress | undefined {
  const hunkIndex = source.hunks.length - 1;
  const hunk = source.hunks[hunkIndex];
  if (!hunk) {
    return undefined;
  }
  if (source.isPartial) {
    return source.sourceLines ? partialTrailingGap(hunk, hunkIndex, source.sourceLines) : undefined;
  }

  const oldCount = source.deletionLines.length - (hunk.deletionLineIndex + hunk.deletionCount);
  const newCount = source.additionLines.length - (hunk.additionLineIndex + hunk.additionCount);
  if (oldCount !== newCount || oldCount <= 0) {
    return undefined;
  }

  const oldStart = hunk.deletionStart + hunk.deletionCount;
  const newStart = hunk.additionStart + hunk.additionCount;
  return {
    position: "trailing",
    hunkIndex,
    oldRange: [oldStart, oldStart + oldCount - 1],
    newRange: [newStart, newStart + newCount - 1],
    lineCount: oldCount,
  };
}

/**
 * The tail of a partial patch, sized from one side's loaded source.
 *
 * A zero-count side is positioned *at* its last line before the hunk (see
 * `reviewLeadingGap`), so its tail resumes one line later; the other side follows by the
 * same offset because unchanged lines pair one to one.
 */
function partialTrailingGap(
  hunk: ReviewGapHunk,
  hunkIndex: number,
  sourceLines: NonNullable<ReviewGapSource["sourceLines"]>,
): ReviewGapAddress | undefined {
  const nextLine = (start: number, count: number) => start + Math.max(count, 1);
  const oldStart = nextLine(hunk.deletionStart, hunk.deletionCount);
  const newStart = nextLine(hunk.additionStart, hunk.additionCount);
  const start = sourceLines.side === "old" ? oldStart : newStart;
  const lineCount = sourceLines.count - start + 1;
  if (lineCount <= 0) {
    return undefined;
  }

  return {
    position: "trailing",
    hunkIndex,
    oldRange: [oldStart, oldStart + lineCount - 1],
    newRange: [newStart, newStart + lineCount - 1],
    lineCount,
  };
}

/** Resolve one gap id against the current geometry, or undefined when it addresses nothing. */
export function reviewGapAddress(
  source: ReviewGapSource,
  gapId: string,
): ReviewGapAddress | undefined {
  const parsed = parseReviewGapId(gapId);
  if (!parsed) {
    return undefined;
  }
  if (parsed.position === "before") {
    return reviewLeadingGap(source, parsed.hunkIndex);
  }
  const trailing = reviewTrailingGap(source);
  return trailing?.hunkIndex === parsed.hunkIndex ? trailing : undefined;
}

/**
 * The gaps bordering one hunk: the one above it and the one below it (the next hunk's
 * leading gap, or the file's trailing gap after the last hunk). The hunk owns the bottom
 * edge of the first and the top edge of the second.
 */
export function reviewGapsAroundHunk(
  source: ReviewGapSource,
  hunkIndex: number,
): { above?: ReviewGapAddress; below?: ReviewGapAddress } {
  const above = reviewLeadingGap(source, hunkIndex);
  const below =
    hunkIndex + 1 < source.hunks.length
      ? reviewLeadingGap(source, hunkIndex + 1)
      : reviewTrailingGap(source);
  return { ...(above ? { above } : {}), ...(below ? { below } : {}) };
}

/**
 * A caller's claim that one line it is addressing came from an expanded gap.
 *
 * A line inside a gap is not in the patch at all, so nothing about the file proves it
 * exists: a surface that expanded a gap and then addressed a line in it has to say which
 * gap, and which content it was reading. The identity is what makes the claim checkable
 * across a reload — the same gap over different source text is a different set of lines.
 */
export interface ReviewExpandedLineClaim {
  gapId: string;
  side: ReviewSide;
  line: number;
  /** Identity of the source the caller expanded; must still be the file's own. */
  sourceIdentity: string;
}

/**
 * Resolve one expanded-line claim against the file's current geometry.
 *
 * Returns the gap the line belongs to, or undefined when the claim does not hold — the
 * gap is gone, the line falls outside it, or the source behind it has been replaced. The
 * gap's `hunkIndex` is what an anchor uses as the owning hunk, so a note on an expanded
 * line stays attached to the hunk the reviewer was reading (`docs/browser-review-seam-
 * audit.md`, B10/D3).
 */
export function resolveReviewExpandedLine(
  file: ReviewFileV1,
  claim: ReviewExpandedLineClaim,
): ReviewGapAddress | undefined {
  if (file.sourceIdentity === undefined || file.sourceIdentity !== claim.sourceIdentity) {
    return undefined;
  }
  const address = reviewGapAddress(reviewGapSourceForFile(file), claim.gapId);
  if (!address) {
    return undefined;
  }
  const [start, end] = claim.side === "old" ? address.oldRange : address.newRange;
  return claim.line >= start && claim.line <= end ? address : undefined;
}

/**
 * Which side's full source text fills this file's expanded gaps.
 *
 * A deleted file has no new side to read, so its gaps come from the old one. Both ranges
 * of a gap stay addressable either way; this only decides where the text is read from.
 */
export function reviewExpansionSide(changeKind: ReviewFileChangeKind): ReviewSide {
  return changeKind === "deleted" ? "old" : "new";
}
