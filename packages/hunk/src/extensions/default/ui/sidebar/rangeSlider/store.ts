/**
 * Holds the commit-range slider state that the files pane paints and the range keyboard mode edits.
 *
 * Bundled factories run once per process, so the mode cannot reach pane props; the pane publishes
 * its stops here and both sides read one snapshot. A new stop list adopts the selection the pane
 * passes with it, while republishing the same stops keeps the user's selection.
 */
import { fullRangeSelection, type RangeSelection, type RangeStop } from "./model";

export interface RangeSliderState {
  readonly stops: readonly RangeStop[];
  readonly selection: RangeSelection;
  /** True while the range keyboard mode owns the keys. */
  readonly editing: boolean;
}

export interface RangeSliderStore {
  getSnapshot(): RangeSliderState;
  subscribe(listener: () => void): () => void;
  setStops(stops: readonly RangeStop[], selection?: RangeSelection): void;
  updateSelection(update: (selection: RangeSelection, stopCount: number) => RangeSelection): void;
  setEditing(editing: boolean): void;
}

/** Report whether two stop lists name the same stops in the same order. */
export function sameStops(left: readonly RangeStop[], right: readonly RangeStop[]) {
  return left.length === right.length && left.every((stop, index) => stop.id === right[index]?.id);
}

/** Create one observable slider state container. */
export function createRangeSliderStore(): RangeSliderStore {
  let state: RangeSliderState = { stops: [], selection: fullRangeSelection(0), editing: false };
  const listeners = new Set<() => void>();
  const commit = (next: RangeSliderState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setStops(stops, selection = fullRangeSelection(stops.length)) {
      if (sameStops(state.stops, stops)) return;
      commit({ ...state, stops, selection });
    },
    updateSelection(update) {
      const selection = update(state.selection, state.stops.length);
      if (selection === state.selection) return;
      commit({ ...state, selection });
    },
    setEditing(editing) {
      if (editing !== state.editing) commit({ ...state, editing });
    },
  };
}

export const rangeSliderStore = createRangeSliderStore();
