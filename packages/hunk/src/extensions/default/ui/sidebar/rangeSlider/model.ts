/**
 * Models the files pane's commit-range slider: ordered changes plus a from/to handle pair.
 *
 * Each stop is one change — a commit, or the uncommitted work — oldest-left. A selection is
 * inclusive: both handles on one commit show exactly that commit. `from <= to` always holds.
 * Everything here is pure; the pane and the keyboard mode share it through the slider store.
 */
import type { ExtensionReviewTimeline } from "../../../../../extension-api/types";

/** One change the handles can rest on: a commit, or the uncommitted work. */
export interface RangeStop {
  readonly id: string;
  /** Short identity painted beside a handle, e.g. a short sha or `WIP`. */
  readonly label: string;
  /** One-line description, e.g. the commit subject. */
  readonly detail: string;
  /** Old-side revision when the selection starts here: the state before this change. */
  readonly oldRevision: string;
  /** New-side revision when the selection ends here; null is the working tree. */
  readonly newRevision: string | null;
}

export type RangeHandle = "from" | "to";

export interface RangeSelection {
  readonly from: number;
  readonly to: number;
  /** The handle that keyboard movement and drags apply to. */
  readonly active: RangeHandle;
}

/**
 * List the timeline's changes oldest-left: each commit, then the uncommitted work when there is any.
 *
 * On a clean working-tree review the last commit ends at the working tree, so the full selection is
 * still the review that was launched.
 */
export function rangeStopsFromTimeline(timeline: ExtensionReviewTimeline): RangeStop[] {
  const stops: RangeStop[] = [];
  let before = timeline.base.revision;
  for (const commit of timeline.commits) {
    stops.push({
      id: commit.revision,
      label: commit.displayRevision,
      detail: commit.title,
      oldRevision: before,
      newRevision: commit.revision,
    });
    before = commit.revision;
  }
  if (timeline.workingTree && timeline.workingTreeChanged) {
    stops.push({
      id: "working-tree",
      label: "WIP",
      detail: "uncommitted changes",
      oldRevision: before,
      newRevision: null,
    });
  } else if (timeline.workingTree && stops.length > 0) {
    stops[stops.length - 1] = { ...stops[stops.length - 1]!, newRevision: null };
  }
  return stops;
}

/** Place the handles on the timeline's current range, falling back to the full range. */
export function rangeSelectionFromTimeline(
  timeline: ExtensionReviewTimeline,
  stops: readonly RangeStop[],
  active: RangeHandle = "from",
): RangeSelection {
  const { current } = timeline;
  const from = stops.findIndex((stop) => stop.oldRevision === current.from);
  const to = stops.findIndex((stop) => stop.newRevision === current.to || stop.id === current.to);
  if (from < 0 || to < from) return fullRangeSelection(stops.length);
  return { from, to, active };
}

/** Return the selection spanning every stop. */
export function fullRangeSelection(stopCount: number): RangeSelection {
  return { from: 0, to: Math.max(0, stopCount - 1), active: "from" };
}

/** Clamp a value into an inclusive integer interval. */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Put one handle on a stop; it may share the other handle's stop but never cross it. */
export function placeHandle(
  selection: RangeSelection,
  handle: RangeHandle,
  index: number,
  stopCount: number,
): RangeSelection {
  if (stopCount < 1) return selection;
  return handle === "from"
    ? { ...selection, from: clamp(index, 0, selection.to), active: "from" }
    : { ...selection, to: clamp(index, selection.from, stopCount - 1), active: "to" };
}

/** Step the active handle by `delta` stops. */
export function moveActiveHandle(selection: RangeSelection, delta: number, stopCount: number) {
  const current = selection.active === "from" ? selection.from : selection.to;
  return placeHandle(selection, selection.active, current + delta, stopCount);
}

/** Slide both handles together, keeping the span, e.g. to step commit by commit. */
export function shiftRange(selection: RangeSelection, delta: number, stopCount: number) {
  const span = selection.to - selection.from;
  const from = clamp(selection.from + delta, 0, Math.max(0, stopCount - 1 - span));
  return { ...selection, from, to: from + span };
}

/** Swap which handle keyboard movement drives. */
export function toggleActiveHandle(selection: RangeSelection): RangeSelection {
  return { ...selection, active: selection.active === "from" ? "to" : "from" };
}

/** Pick the handle a click on `index` should grab: the nearer one, ties to the active one. */
export function handleNearest(selection: RangeSelection, index: number): RangeHandle {
  const fromDistance = Math.abs(index - selection.from);
  const toDistance = Math.abs(index - selection.to);
  if (fromDistance === toDistance)
    return index < selection.from ? "from" : index > selection.to ? "to" : selection.active;
  return fromDistance < toDistance ? "from" : "to";
}

/** Column of each stop on a track `width` cells wide, spread edge to edge. */
export function rangeStopColumns(stopCount: number, width: number): number[] {
  if (stopCount <= 1) return stopCount === 1 ? [0] : [];
  return Array.from({ length: stopCount }, (_, index) =>
    Math.round((index * (width - 1)) / (stopCount - 1)),
  );
}

/** Return the stop whose column is closest to `column`. */
export function stopIndexAtColumn(column: number, stopCount: number, width: number) {
  const columns = rangeStopColumns(stopCount, width);
  let best = 0;
  for (let index = 1; index < columns.length; index += 1) {
    if (Math.abs(columns[index]! - column) < Math.abs(columns[best]! - column)) best = index;
  }
  return best;
}

export type RangeTrackRole =
  | "blank"
  | "rail"
  | "span"
  | "stop"
  | "stop-in"
  | "handle"
  | "handle-active";

export interface RangeTrackCell {
  readonly glyph: string;
  readonly role: RangeTrackRole;
}

const TRACK_GLYPHS: Record<RangeTrackRole, string> = {
  blank: " ",
  rail: "─",
  span: "━",
  stop: "○",
  "stop-in": "●",
  handle: "◆",
  "handle-active": "◆",
};

/** Lay out the track row: rail outside the range, a heavy span inside, stops and handles on top. */
export function rangeTrackCells(
  stopCount: number,
  selection: RangeSelection,
  width: number,
): RangeTrackCell[] {
  const columns = rangeStopColumns(stopCount, width);
  const fromColumn = columns[selection.from] ?? 0;
  const toColumn = columns[selection.to] ?? 0;
  const lastColumn = columns.at(-1) ?? 0;
  // No rail past the last stop: a lone stop must not suggest there is somewhere to slide.
  const cells: RangeTrackRole[] = Array.from({ length: width }, (_, column) =>
    column > lastColumn ? "blank" : column > fromColumn && column < toColumn ? "span" : "rail",
  );
  columns.forEach((column, index) => {
    if (index === selection.from || index === selection.to) {
      const isActive =
        (index === selection.from && index === selection.to) ||
        (index === selection.from ? "from" : "to") === selection.active;
      cells[column] = isActive ? "handle-active" : "handle";
    } else {
      cells[column] = index > selection.from && index < selection.to ? "stop-in" : "stop";
    }
  });
  return cells.map((role) => ({ glyph: TRACK_GLYPHS[role], role }));
}
