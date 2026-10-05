import type { ReviewGapEdge } from "../../core/review/expansion";

/** What a click on a gap separator or a hunk header asks the review to do. */
export type GapAction =
  /** Reveal one step from an edge, or `lines` of them when the caller knows how many. */
  | { kind: "reveal"; gapId: string; edge: ReviewGapEdge; lines?: number }
  | { kind: "collapse-gap"; gapId: string }
  /** Undo what one hunk's own ▲ / ▼ revealed. */
  | { kind: "collapse-hunk"; hunkIndex: number }
  /** Fetch the file's source so a partial patch's trailing gap can be sized. */
  | { kind: "load-source" };
