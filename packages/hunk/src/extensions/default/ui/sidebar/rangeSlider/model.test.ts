import { describe, expect, test } from "bun:test";
import { createTestReviewTimeline } from "../../../../../../../../test/helpers/review-timeline-helpers";
import {
  fullRangeSelection,
  handleNearest,
  moveActiveHandle,
  placeHandle,
  rangeSelectionFromTimeline,
  rangeStopColumns,
  rangeStopsFromTimeline,
  rangeTrackCells,
  shiftRange,
  stopIndexAtColumn,
  toggleActiveHandle,
} from "./model";

describe("range slider stops", () => {
  test("are the commits oldest first, then WIP when the tree has changes", () => {
    const stops = rangeStopsFromTimeline(createTestReviewTimeline(["one", "two"]));
    expect(stops.map((stop) => stop.label)).toEqual(["1111111", "2222222", "WIP"]);
    expect(stops.map((stop) => [stop.oldRevision[0], stop.newRevision?.[0] ?? null])).toEqual([
      ["b", "1"],
      ["1", "2"],
      ["2", null],
    ]);
  });

  test("on a clean tree the last commit reaches the working tree and there is no WIP", () => {
    const timeline = createTestReviewTimeline(["one", "two"], { workingTreeChanged: false });
    const stops = rangeStopsFromTimeline(timeline);
    expect(stops.map((stop) => stop.label)).toEqual(["1111111", "2222222"]);
    expect(stops.at(-1)?.newRevision).toBeNull();
    expect(rangeSelectionFromTimeline(timeline, stops)).toEqual({ from: 0, to: 1, active: "from" });
  });

  test("a branch with only uncommitted work is one WIP stop", () => {
    const stops = rangeStopsFromTimeline(createTestReviewTimeline([]));
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({
      label: "WIP",
      oldRevision: "b".repeat(40),
      newRevision: null,
    });
  });

  test("a commit-to-commit timeline ends on its last commit", () => {
    const timeline = { ...createTestReviewTimeline(["one"]), workingTree: false };
    expect(rangeStopsFromTimeline(timeline).map((stop) => stop.newRevision)).toEqual([
      "1".repeat(40),
    ]);
  });

  test("places the handles on the range on screen, a single commit included", () => {
    const timeline = createTestReviewTimeline(["one", "two"]);
    const stops = rangeStopsFromTimeline(timeline);
    const single = { ...timeline, current: { from: "1".repeat(40), to: "2".repeat(40) } };
    expect(rangeSelectionFromTimeline(single, stops, "to")).toEqual({
      from: 1,
      to: 1,
      active: "to",
    });
    expect(rangeSelectionFromTimeline(timeline, stops)).toEqual({ from: 0, to: 2, active: "from" });
  });
});

describe("range slider selection", () => {
  test("starts spanning every stop", () => {
    expect(fullRangeSelection(6)).toEqual({ from: 0, to: 5, active: "from" });
  });

  test("lets both handles share a stop but never cross", () => {
    const selection = { from: 1, to: 3, active: "from" as const };
    expect(placeHandle(selection, "from", 5, 6).from).toBe(3);
    expect(placeHandle(selection, "to", 0, 6).to).toBe(1);
    expect(moveActiveHandle({ ...selection, active: "to" }, 10, 6).to).toBe(5);
    expect(moveActiveHandle(selection, -10, 6).from).toBe(0);
  });

  test("slides a single-commit selection one commit at a time", () => {
    const selection = { from: 1, to: 1, active: "to" as const };
    expect(shiftRange(selection, 1, 4)).toMatchObject({ from: 2, to: 2 });
    expect(shiftRange(selection, 10, 4)).toMatchObject({ from: 3, to: 3 });
    expect(shiftRange(selection, -10, 4)).toMatchObject({ from: 0, to: 0 });
  });

  test("toggles the active handle", () => {
    expect(toggleActiveHandle(fullRangeSelection(3)).active).toBe("to");
  });

  test("a click grabs the nearer handle, outside clicks grab the handle on that side", () => {
    const selection = { from: 2, to: 4, active: "to" as const };
    expect(handleNearest(selection, 0)).toBe("from");
    expect(handleNearest(selection, 5)).toBe("to");
    expect(handleNearest(selection, 3)).toBe("to");
    expect(handleNearest({ ...selection, active: "from" }, 3)).toBe("from");
  });
});

describe("range slider track", () => {
  test("spreads stops edge to edge and maps columns back to the nearest stop", () => {
    expect(rangeStopColumns(3, 11)).toEqual([0, 5, 10]);
    expect(stopIndexAtColumn(4, 3, 11)).toBe(1);
    expect(stopIndexAtColumn(9, 3, 11)).toBe(2);
  });

  test("draws one active handle where both handles share a stop", () => {
    const track = rangeTrackCells(3, { from: 1, to: 1, active: "to" }, 11);
    expect(track.map((cell) => cell.glyph).join("")).toBe("○────◆────○");
    expect(track[5]?.role).toBe("handle-active");
  });

  test("draws the selected span heavy between the handles", () => {
    const track = rangeTrackCells(3, { from: 0, to: 1, active: "from" }, 11)
      .map((cell) => cell.glyph)
      .join("");
    expect(track).toBe("◆━━━━◆────○");
  });
});
