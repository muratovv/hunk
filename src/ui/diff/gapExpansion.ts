/**
 * Directional expansion state for a single collapsed gap.
 *
 * Replaces the old per-gap boolean (whole gap shown or hidden) with a count of
 * unchanged lines revealed from each edge, so a gap can be walked open a step at
 * a time from the top (▲) or the bottom (▼) — GitHub-style incremental context.
 */
export interface GapExpansion {
  /** Lines revealed from the top (start) edge of the gap. */
  readonly top: number;
  /** Lines revealed from the bottom (end) edge of the gap. */
  readonly bottom: number;
}

/** Which edge of a gap an expand action grows. */
export type GapEdge = "top" | "bottom";

/**
 * A user action on a collapsed gap's affordances, threaded through the render
 * layers as a single callback so the whole diff pipeline stays on one contract.
 */
export type GapAction = "expand-top" | "expand-bottom" | "collapse";

/** A gap with nothing revealed yet. */
export const COLLAPSED: GapExpansion = { top: 0, bottom: 0 };

/** Lines revealed per ▲/▼ activation when no `expandStep` config is set (GitHub default). */
export const DEFAULT_EXPAND_STEP = 20;

/** Total unchanged lines a gap covers, from its 1-based inclusive range. */
export function gapSize(range: readonly [number, number]): number {
  return Math.max(0, range[1] - range[0] + 1);
}

/**
 * Clamp an expansion so the revealed edges never overlap or exceed the gap.
 * `top` wins ties: when both edges would cover the same line, `bottom` yields.
 */
export function clampExpansion(expansion: GapExpansion, total: number): GapExpansion {
  const top = Math.max(0, Math.min(expansion.top, total));
  const bottom = Math.max(0, Math.min(expansion.bottom, total - top));
  return { top, bottom };
}

/** True once the revealed edges cover the whole gap — no hidden middle remains. */
export function isFullyExpanded(expansion: GapExpansion, total: number): boolean {
  return expansion.top + expansion.bottom >= total;
}

/** Reveal `step` more lines from the given edge, clamped to the gap size. */
export function expandEdge(
  expansion: GapExpansion,
  edge: GapEdge,
  step: number,
  total: number,
): GapExpansion {
  const grown =
    edge === "top"
      ? { top: expansion.top + step, bottom: expansion.bottom }
      : { top: expansion.top, bottom: expansion.bottom + step };
  return clampExpansion(grown, total);
}

/**
 * The still-hidden middle of a partially expanded gap, as an offset window into
 * the gap (0-based, relative to the gap's first line). Returns `null` when the
 * gap is fully expanded. Callers translate these offsets onto the concrete
 * old/new line ranges.
 */
export function hiddenMiddle(
  expansion: GapExpansion,
  total: number,
): { startOffset: number; count: number } | null {
  const clamped = clampExpansion(expansion, total);
  const count = total - clamped.top - clamped.bottom;
  if (count <= 0) {
    return null;
  }
  return { startOffset: clamped.top, count };
}
