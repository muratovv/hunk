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
  test("run base, each commit oldest first, then the working tree", () => {
    const stops = rangeStopsFromTimeline(createTestReviewTimeline(["one", "two"]));
    expect(stops.map((stop) => stop.label)).toEqual(["bbbbbbb", "1111111", "2222222", "WIP"]);
    expect(stops.at(-1)?.revision).toBeNull();
    expect(stops[0]?.detail).toContain("fork point");
  });

  test("a commit-to-commit timeline ends on its last commit", () => {
    const timeline = { ...createTestReviewTimeline(["one"]), workingTree: false };
    expect(rangeStopsFromTimeline(timeline).map((stop) => stop.label)).toEqual([
      "bbbbbbb",
      "1111111",
    ]);
  });

  test("places the handles on the range on screen", () => {
    const timeline = createTestReviewTimeline(["one", "two"]);
    const stops = rangeStopsFromTimeline(timeline);
    const narrowed = { ...timeline, current: { from: "1".repeat(40), to: "2".repeat(40) } };
    expect(rangeSelectionFromTimeline(narrowed, stops, "to")).toEqual({
      from: 1,
      to: 2,
      active: "to",
    });
    expect(rangeSelectionFromTimeline(timeline, stops)).toEqual({ from: 0, to: 3, active: "from" });
  });
});

describe("range slider selection", () => {
  test("starts spanning every stop", () => {
    expect(fullRangeSelection(6)).toEqual({ from: 0, to: 5, active: "from" });
  });

  test("never lets a handle reach or cross the other one", () => {
    const selection = { from: 1, to: 3, active: "from" as const };
    expect(placeHandle(selection, "from", 5, 6).from).toBe(2);
    expect(placeHandle(selection, "to", 0, 6).to).toBe(2);
    expect(moveActiveHandle({ ...selection, active: "to" }, 10, 6).to).toBe(5);
    expect(moveActiveHandle(selection, -10, 6).from).toBe(0);
  });

  test("shifts both handles together and stops at either edge", () => {
    const selection = { from: 1, to: 2, active: "to" as const };
    expect(shiftRange(selection, 1, 6)).toMatchObject({ from: 2, to: 3 });
    expect(shiftRange(selection, 10, 6)).toMatchObject({ from: 4, to: 5 });
    expect(shiftRange(selection, -10, 6)).toMatchObject({ from: 0, to: 1 });
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

  test("draws the selected span heavy between the handles", () => {
    const track = rangeTrackCells(3, { from: 0, to: 1, active: "from" }, 11)
      .map((cell) => cell.glyph)
      .join("");
    expect(track).toBe("◆━━━━◆────○");
  });
});
