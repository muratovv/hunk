import { describe, expect, test } from "bun:test";
import {
  DEMO_RANGE_STOPS,
  fullRangeSelection,
  handleNearest,
  moveActiveHandle,
  placeHandle,
  rangeStopColumns,
  rangeStopsFromReview,
  rangeTrackCells,
  shiftRange,
  stopIndexAtColumn,
  toggleActiveHandle,
} from "./model";

describe("range slider stops", () => {
  test("fall back to demo stops when the review carries no commit list", () => {
    expect(rangeStopsFromReview(null)).toEqual([...DEMO_RANGE_STOPS]);
  });

  test("order a comparison's newest-first commits oldest-left after the base", () => {
    const stops = rangeStopsFromReview({
      kind: "comparison",
      provider: "Git",
      title: "2 commits",
      base: "0123456789abcdef0123456789abcdef01234567",
      head: "feature",
      commits: [
        { title: "second", revision: "bbbb", displayRevision: "bbb" },
        { title: "first", revision: "aaaa", displayRevision: "aaa" },
      ],
    });
    expect(stops.map((stop) => stop.label)).toEqual(["0123456", "aaa", "bbb"]);
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
