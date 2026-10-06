/**
 * Models the files pane's commit-range slider: ordered stops plus a from/to handle pair.
 *
 * Stops run oldest-left to newest-right. `from < to` always holds, so the selection never
 * collapses to an empty range. Everything here is pure; the pane and the keyboard mode share it
 * through the slider store.
 */
import type { ExtensionReviewTimeline } from "../../../../../extension-api/types";

/** One position the handles can rest on: the base, a commit, or the working tree. */
export interface RangeStop {
  readonly id: string;
  /** Revision this stop names; null for the working tree. */
  readonly revision: string | null;
  /** Short identity painted beside a handle, e.g. a short sha or `WIP`. */
  readonly label: string;
  /** One-line description, e.g. the commit subject. */
  readonly detail: string;
}

export type RangeHandle = "from" | "to";

export interface RangeSelection {
  readonly from: number;
  readonly to: number;
  /** The handle that keyboard movement and drags apply to. */
  readonly active: RangeHandle;
}

/** List the timeline's positions oldest-left: base, each commit, then the working tree. */
export function rangeStopsFromTimeline(timeline: ExtensionReviewTimeline): RangeStop[] {
  const commitStop = (
    commit: ExtensionReviewTimeline["base"],
    detail = commit.title,
  ): RangeStop => ({
    id: commit.revision,
    revision: commit.revision,
    label: commit.displayRevision,
    detail,
  });
  return [
    commitStop(timeline.base, `base · ${timeline.base.title}`),
    ...timeline.commits.map((commit) => commitStop(commit)),
    ...(timeline.workingTree
      ? [{ id: "working-tree", revision: null, label: "WIP", detail: "working tree" }]
      : []),
  ];
}

/** Place the handles on the timeline's current range, falling back to the full range. */
export function rangeSelectionFromTimeline(
  timeline: ExtensionReviewTimeline,
  stops: readonly RangeStop[],
  active: RangeHandle = "from",
): RangeSelection {
  const from = stops.findIndex((stop) => stop.revision === timeline.current.from);
  const to = stops.findIndex((stop) => stop.revision === timeline.current.to);
  if (from < 0 || to <= from) return fullRangeSelection(stops.length);
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

/** Put one handle on a stop, keeping it strictly on its own side of the other handle. */
export function placeHandle(
  selection: RangeSelection,
  handle: RangeHandle,
  index: number,
  stopCount: number,
): RangeSelection {
  if (stopCount < 2) return selection;
  return handle === "from"
    ? { ...selection, from: clamp(index, 0, selection.to - 1), active: "from" }
    : { ...selection, to: clamp(index, selection.from + 1, stopCount - 1), active: "to" };
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

export type RangeTrackRole = "rail" | "span" | "stop" | "stop-in" | "handle" | "handle-active";

export interface RangeTrackCell {
  readonly glyph: string;
  readonly role: RangeTrackRole;
}

const TRACK_GLYPHS: Record<RangeTrackRole, string> = {
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
  const fromColumn = rangeStopColumns(stopCount, width)[selection.from] ?? 0;
  const toColumn = rangeStopColumns(stopCount, width)[selection.to] ?? 0;
  const cells: RangeTrackRole[] = Array.from({ length: width }, (_, column) =>
    column > fromColumn && column < toColumn ? "span" : "rail",
  );
  rangeStopColumns(stopCount, width).forEach((column, index) => {
    if (index === selection.from || index === selection.to) {
      const isActive = (index === selection.from ? "from" : "to") === selection.active;
      cells[column] = isActive ? "handle-active" : "handle";
    } else {
      cells[column] = index > selection.from && index < selection.to ? "stop-in" : "stop";
    }
  });
  return cells.map((role) => ({ glyph: TRACK_GLYPHS[role], role }));
}
