import type { ReviewGapEdge } from "../../core/review/expansion";

/** What a click on a gap's row asks the review to do. */
export type GapAction =
  /** Reveal one more step of the gap from one edge. */
  | { kind: "reveal"; gapId: string; edge: ReviewGapEdge }
  | { kind: "collapse-gap"; gapId: string }
  /** Fetch the file's source so a partial patch's trailing gap can be sized. */
  | { kind: "load-source" };
