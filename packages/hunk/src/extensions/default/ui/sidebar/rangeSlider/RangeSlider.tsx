import { MouseButton, type BoxRenderable, type MouseEvent as TuiMouseEvent } from "@opentui/core";
import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import type {
  ExtensionPaneActions,
  ExtensionPaneTheme,
  ExtensionReviewTimeline,
} from "../../../../../extension-api/types";
import { fitText, padText } from "../../../../../ui/lib/text";
import {
  handleNearest,
  placeHandle,
  rangeSelectionFromTimeline,
  rangeStopsFromTimeline,
  rangeTrackCells,
  stopIndexAtColumn,
  type RangeHandle,
  type RangeSelection,
  type RangeStop,
  type RangeTrackRole,
} from "./model";
import { rangeSliderStore, sameStops, type RangeSliderStore } from "./store";

/** Rows the slider occupies at the bottom of the files pane. */
export const RANGE_SLIDER_HEIGHT = 4;

/** Columns left free at the track's right end: the pane divider's grab zone overlaps them. */
const TRACK_RIGHT_GUTTER = 2;

/** Quiet time after the last handle move before the diff re-scopes. */
export const RANGE_RESCOPE_DEBOUNCE_MS = 250;

export interface RangeSliderProps {
  timeline: ExtensionReviewTimeline;
  rescopeReview: ExtensionPaneActions["rescopeReview"];
  notify: ExtensionPaneActions["notify"];
  theme: ExtensionPaneTheme;
  width: number;
  store?: RangeSliderStore;
  debounceMs?: number;
}

/** Map a track role to its paint color. */
function trackColor(role: RangeTrackRole, theme: ExtensionPaneTheme, editing: boolean) {
  switch (role) {
    case "blank":
    case "rail":
    case "stop":
      return theme.muted;
    case "span":
    case "stop-in":
      return editing ? theme.accent : theme.accentMuted;
    case "handle":
      return theme.text;
    case "handle-active":
      return editing ? theme.accent : theme.text;
  }
}

/** Summarize what the selection covers, e.g. `2 commits + WIP`. */
function rangeSelectionLabel(stops: readonly RangeStop[], selection: RangeSelection) {
  const covered = stops.slice(selection.from, selection.to + 1);
  const commits = covered.filter((stop) => stop.id !== "working-tree").length;
  const commitText = commits > 0 ? `${commits} commit${commits === 1 ? "" : "s"}` : "";
  const wip = covered.length > commits ? "WIP" : "";
  return [commitText, wip].filter(Boolean).join(" + ");
}

/** Merge adjacent cells of one role so the track paints as a few text runs. */
function trackRuns(cells: ReturnType<typeof rangeTrackCells>) {
  const runs: Array<{ role: RangeTrackRole; text: string }> = [];
  for (const cell of cells) {
    const last = runs.at(-1);
    if (last?.role === cell.role) last.text += cell.glyph;
    else runs.push({ role: cell.role, text: cell.glyph });
  }
  return runs;
}

/**
 * Render the commit-range slider docked under the file list.
 *
 * Clicking the track grabs the nearer handle and drags it; clicking a from/to row makes that
 * handle active for the keyboard mode. Once the handles rest for the debounce interval, the review
 * re-scopes to their range; a refused or failed re-scope snaps them back to the range on screen.
 */
export function RangeSlider({
  timeline,
  rescopeReview,
  notify,
  theme,
  width,
  store = rangeSliderStore,
  debounceMs = RANGE_RESCOPE_DEBOUNCE_MS,
}: RangeSliderProps): ReactNode {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const trackRef = useRef<BoxRenderable | null>(null);
  const draggingRef = useRef<RangeHandle | null>(null);
  // Stops depend on the line only, so a re-scope that moves `current` keeps the user's selection.
  const stops = useMemo(
    () => rangeStopsFromTimeline(timeline),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the line, not `current`, defines stops
    [timeline.base, timeline.commits, timeline.workingTree, timeline.workingTreeChanged],
  );
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  useEffect(() => {
    store.setStops(stops, rangeSelectionFromTimeline(timelineRef.current, stops));
    return () => store.setStops([]);
  }, [store, stops]);

  const adopted = sameStops(state.stops, stops);
  const target = adopted ? state.selection : undefined;
  const targetFrom = target ? stops[target.from]?.oldRevision : undefined;
  const targetTo = target ? stops[target.to]?.newRevision : undefined;
  useEffect(() => {
    if (targetFrom === undefined || targetFrom === null || targetTo === undefined) return;
    const { current } = timelineRef.current;
    if (current.from === targetFrom && current.to === targetTo) return;
    const timer = setTimeout(() => {
      void rescopeReview(targetFrom, targetTo).then((result) => {
        if (result.ok) return;
        notify(`Commit range not applied: ${result.detail}`, "warning");
        store.updateSelection((selection) =>
          rangeSelectionFromTimeline(timelineRef.current, stops, selection.active),
        );
      });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [debounceMs, notify, rescopeReview, stops, store, targetFrom, targetTo]);

  // Until the store adopts this pane's stops, paint the range on screen.
  const selection = target ?? rangeSelectionFromTimeline(timeline, stops);
  const innerWidth = Math.max(4, width - 1 - TRACK_RIGHT_GUTTER);
  const cells = useMemo(
    () => rangeTrackCells(stops.length, selection, innerWidth),
    [stops.length, selection, innerWidth],
  );

  /** Translate a pointer event on the track into the nearest stop index. */
  const stopAt = (event: TuiMouseEvent) => {
    const left = trackRef.current?.screenX ?? 0;
    return stopIndexAtColumn(Math.floor(event.x - left), stops.length, innerWidth);
  };

  const grab = (event: TuiMouseEvent) => {
    if (event.button !== MouseButton.LEFT) return;
    const index = stopAt(event);
    const handle = handleNearest(store.getSnapshot().selection, index);
    draggingRef.current = handle;
    store.updateSelection((current, count) => placeHandle(current, handle, index, count));
  };

  const drag = (event: TuiMouseEvent) => {
    const handle = draggingRef.current;
    if (!handle) return;
    const index = stopAt(event);
    store.updateSelection((current, count) => placeHandle(current, handle, index, count));
  };

  const activate = (handle: RangeHandle) => () =>
    store.updateSelection((current) =>
      current.active === handle ? current : { ...current, active: handle },
    );

  const title = state.editing ? "Edit range" : "Range";
  const count = rangeSelectionLabel(stops, selection);
  const headerWidth = Math.max(1, width - 2 - count.length - 1);

  /** Render one handle's label row with its active marker. */
  const handleRow = (handle: RangeHandle) => {
    const stop = stops[handle === "from" ? selection.from : selection.to];
    const active = selection.active === handle;
    const markerColor = active ? (state.editing ? theme.accent : theme.text) : theme.panel;
    const name = handle === "from" ? "from " : "to   ";
    const labelWidth = Math.min(8, stop?.label.length ?? 0);
    const detailWidth = Math.max(0, width - 1 - 1 - name.length - labelWidth - 1);
    return (
      <box
        style={{ width: "100%", height: 1, flexDirection: "row", backgroundColor: theme.panel }}
        onMouseUp={activate(handle)}
      >
        <text fg={markerColor}>{active ? "▸" : " "}</text>
        <text fg={theme.muted}>{name}</text>
        <text fg={active ? theme.text : theme.muted}>
          {fitText(stop?.label ?? "", labelWidth)}{" "}
        </text>
        <text fg={theme.muted}>
          {padText(fitText(stop?.detail ?? "", detailWidth, "…"), detailWidth)}
        </text>
      </box>
    );
  };

  return (
    <box
      style={{
        width: "100%",
        height: RANGE_SLIDER_HEIGHT,
        flexDirection: "column",
        flexShrink: 0,
        backgroundColor: theme.panel,
      }}
    >
      <box
        style={{
          width: "100%",
          height: 1,
          flexDirection: "row",
          paddingLeft: 1,
          backgroundColor: theme.panelAlt,
        }}
      >
        <text fg={state.editing ? theme.accent : theme.muted} bg={theme.panelAlt}>
          {padText(title.length <= headerWidth ? title : "", headerWidth)}
        </text>
        <text fg={theme.muted} bg={theme.panelAlt}>
          {` ${count}`}
        </text>
      </box>
      <box
        ref={trackRef}
        style={{ width: innerWidth, height: 1, marginLeft: 1, flexDirection: "row" }}
        onMouseDown={grab}
        onMouseDrag={drag}
        onMouseDragEnd={() => {
          draggingRef.current = null;
        }}
        onMouseUp={() => {
          draggingRef.current = null;
        }}
      >
        {trackRuns(cells).map((run, index) => (
          <text key={index} fg={trackColor(run.role, theme, state.editing)}>
            {run.text}
          </text>
        ))}
      </box>
      {handleRow("from")}
      {handleRow("to")}
    </box>
  );
}
