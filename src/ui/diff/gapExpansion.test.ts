import { describe, expect, test } from "bun:test";
import {
  clampExpansion,
  COLLAPSED,
  expandEdge,
  gapSize,
  hiddenMiddle,
  isFullyExpanded,
} from "./gapExpansion";

describe("gapSize", () => {
  test("counts inclusive 1-based ranges", () => {
    expect(gapSize([1, 1])).toBe(1);
    expect(gapSize([1, 20])).toBe(20);
    expect(gapSize([10, 12])).toBe(3);
  });

  test("never returns a negative size for an empty/invalid range", () => {
    expect(gapSize([5, 4])).toBe(0);
  });
});

describe("clampExpansion", () => {
  test("leaves a valid expansion untouched", () => {
    expect(clampExpansion({ top: 3, bottom: 4 }, 20)).toEqual({ top: 3, bottom: 4 });
  });

  test("caps the total at the gap size, top winning ties", () => {
    expect(clampExpansion({ top: 15, bottom: 15 }, 20)).toEqual({ top: 15, bottom: 5 });
  });

  test("caps top alone at the gap size", () => {
    expect(clampExpansion({ top: 99, bottom: 0 }, 20)).toEqual({ top: 20, bottom: 0 });
  });

  test("floors negative edges at zero", () => {
    expect(clampExpansion({ top: -3, bottom: -1 }, 20)).toEqual({ top: 0, bottom: 0 });
  });
});

describe("isFullyExpanded", () => {
  test("false while a hidden middle remains", () => {
    expect(isFullyExpanded({ top: 5, bottom: 5 }, 20)).toBe(false);
  });

  test("true once edges meet or cover the gap", () => {
    expect(isFullyExpanded({ top: 10, bottom: 10 }, 20)).toBe(true);
    expect(isFullyExpanded({ top: 20, bottom: 0 }, 20)).toBe(true);
  });
});

describe("expandEdge", () => {
  test("grows the top edge by the step", () => {
    expect(expandEdge(COLLAPSED, "top", 20, 100)).toEqual({ top: 20, bottom: 0 });
  });

  test("grows the bottom edge by the step", () => {
    expect(expandEdge({ top: 20, bottom: 0 }, "bottom", 20, 100)).toEqual({ top: 20, bottom: 20 });
  });

  test("a small gap fully reveals in one step (R6)", () => {
    expect(expandEdge(COLLAPSED, "top", 20, 8)).toEqual({ top: 8, bottom: 0 });
    expect(isFullyExpanded(expandEdge(COLLAPSED, "top", 20, 8), 8)).toBe(true);
  });

  test("the second edge only takes what the first left behind", () => {
    // 25-line gap, 20 revealed from top → bottom can only claim the remaining 5.
    const afterTop = expandEdge(COLLAPSED, "top", 20, 25);
    expect(afterTop).toEqual({ top: 20, bottom: 0 });
    expect(expandEdge(afterTop, "bottom", 20, 25)).toEqual({ top: 20, bottom: 5 });
  });
});

describe("hiddenMiddle", () => {
  test("returns the residual window between revealed edges", () => {
    expect(hiddenMiddle({ top: 5, bottom: 5 }, 20)).toEqual({ startOffset: 5, count: 10 });
  });

  test("returns null once the gap is fully expanded", () => {
    expect(hiddenMiddle({ top: 10, bottom: 10 }, 20)).toBeNull();
    expect(hiddenMiddle({ top: 20, bottom: 0 }, 20)).toBeNull();
  });

  test("offsets start after the revealed top", () => {
    expect(hiddenMiddle({ top: 3, bottom: 0 }, 10)).toEqual({ startOffset: 3, count: 7 });
  });
});
