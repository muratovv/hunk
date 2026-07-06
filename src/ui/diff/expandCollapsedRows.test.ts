import { describe, expect, test } from "bun:test";
import { expandCollapsedRows, gapKey, selectGapForKeyboardToggle } from "./expandCollapsedRows";
import type { GapExpansion } from "./gapExpansion";
import type { DiffRow } from "./pierre";

function makeCollapsedRow(
  position: "before" | "trailing",
  hunkIndex: number,
  oldRange: [number, number],
  newRange: [number, number],
): Extract<DiffRow, { type: "collapsed" }> {
  return {
    type: "collapsed",
    key: `f:collapsed:${position}:${hunkIndex}`,
    fileId: "f",
    hunkIndex,
    text: `${oldRange[1] - oldRange[0] + 1} unchanged lines`,
    position,
    oldRange,
    newRange,
  };
}

function makeHunkHeader(hunkIndex: number): Extract<DiffRow, { type: "hunk-header" }> {
  return {
    type: "hunk-header",
    key: `f:header:${hunkIndex}`,
    fileId: "f",
    hunkIndex,
    text: `@@ hunk ${hunkIndex} @@`,
  };
}

/** Build an `expansionByKey` map from `[gapKey, {top, bottom}]` entries. */
function expansions(...entries: Array<[string, GapExpansion]>): Map<string, GapExpansion> {
  return new Map(entries);
}

const SOURCE = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"].join("\n") + "\n";
const OSC52_CLIPBOARD = "\x1b]52;c;SGVsbG8=\x07";
const CSI_CLEAR_SCREEN = "\x1b[2J";
const DCS_PAYLOAD = "\x1bPqpayload\x1b\\";

function expectNoUnsafeTerminalControls(text: string) {
  expect(text).not.toContain(OSC52_CLIPBOARD);
  expect(text).not.toContain(CSI_CLEAR_SCREEN);
  expect(text).not.toContain(DCS_PAYLOAD);
  expect(text).not.toContain("\x07");
  expect(text).not.toContain("\r");
  expect(text).not.toContain("\b");
  expect(text).not.toContain("\x1b");
}

function collapsedAt(rows: DiffRow[], index: number): Extract<DiffRow, { type: "collapsed" }> {
  const row = rows[index];
  if (!row || row.type !== "collapsed") {
    throw new Error(`expected collapsed row at ${index}`);
  }
  return row;
}

describe("expandCollapsedRows", () => {
  test("returns rows unchanged when no gaps are expanded", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 2], [1, 2]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expansionByKey: new Map(),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    expect(result).toBe(rows);
  });

  test("returns rows unchanged when a gap maps to a zero expansion", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 2], [1, 2]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expansionByKey: expansions([gapKey("before", 0), { top: 0, bottom: 0 }]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    expect(result.map((row) => row.type)).toEqual(["collapsed", "hunk-header"]);
  });

  test("leaves the row unchanged when expansion is requested before status arrives", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 2], [1, 2]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expansionByKey: expansions([gapKey("before", 0), { top: 2, bottom: 0 }]),
      sourceStatus: undefined,
      side: "new",
    });

    expect(result.map((row) => row.type)).toEqual(["collapsed", "hunk-header"]);
    const collapsed = collapsedAt(result, 0);
    expect(collapsed.text.toLowerCase()).not.toContain("loading");
  });

  test("rewrites the label to 'Loading…' while source is being fetched", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 3], [1, 3]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expansionByKey: expansions([gapKey("before", 0), { top: 2, bottom: 0 }]),
      sourceStatus: { kind: "loading" },
      side: "new",
    });

    expect(result.map((row) => row.type)).toEqual(["collapsed", "hunk-header"]);
    expect(collapsedAt(result, 0).text.toLowerCase()).toContain("loading");
  });

  test("rewrites the label when source could not be loaded", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 3], [1, 3]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expansionByKey: expansions([gapKey("before", 0), { top: 2, bottom: 0 }]),
      sourceStatus: { kind: "error" },
      side: "new",
    });

    expect(result.map((row) => row.type)).toEqual(["collapsed", "hunk-header"]);
    expect(collapsedAt(result, 0).text.toLowerCase()).toContain("could not load");
  });

  test("rewrites the label when source is too large to expand", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 3], [1, 3]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expansionByKey: expansions([gapKey("before", 0), { top: 3, bottom: 0 }]),
      sourceStatus: { kind: "error", reason: "too-large" },
      side: "new",
    });

    expect(collapsedAt(result, 0).text.toLowerCase()).toContain("source too large");
  });

  test("expanding the top edge reveals lines above the residual separator", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 6], [1, 6]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expansionByKey: expansions([gapKey("before", 0), { top: 2, bottom: 0 }]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    // [alpha][beta][residual 4 hidden][hunk-header]
    expect(result.map((row) => row.type)).toEqual([
      "split-line",
      "split-line",
      "collapsed",
      "hunk-header",
    ]);

    const first = result[0];
    if (!first || first.type !== "split-line") {
      throw new Error("expected split-line");
    }
    expect(first.left.lineNumber).toBe(1);
    expect(first.left.spans[0]?.text).toBe("alpha");

    const residual = collapsedAt(result, 2);
    expect(residual.text).toBe("4 unchanged lines");
    expect(residual.oldRange).toEqual([3, 6]);
    expect(residual.expansion).toEqual({ top: 2, bottom: 0 });
  });

  test("expanding the bottom edge reveals lines below the residual separator", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 6], [1, 6]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expansionByKey: expansions([gapKey("before", 0), { top: 0, bottom: 2 }]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    // [residual 4 hidden][epsilon][zeta][hunk-header]
    expect(result.map((row) => row.type)).toEqual([
      "collapsed",
      "stack-line",
      "stack-line",
      "hunk-header",
    ]);

    const residual = collapsedAt(result, 0);
    expect(residual.text).toBe("4 unchanged lines");
    expect(residual.newRange).toEqual([1, 4]);

    const last = result[2];
    if (!last || last.type !== "stack-line") {
      throw new Error("expected stack-line");
    }
    expect(last.cell.newLineNumber).toBe(6);
    expect(last.cell.spans[0]?.text).toBe("zeta");
  });

  test("expanding both edges sandwiches the residual separator", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 6], [1, 6]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expansionByKey: expansions([gapKey("before", 0), { top: 1, bottom: 1 }]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    expect(result.map((row) => row.type)).toEqual([
      "split-line",
      "collapsed",
      "split-line",
      "hunk-header",
    ]);
    const residual = collapsedAt(result, 1);
    expect(residual.text).toBe("4 unchanged lines");
    expect(residual.newRange).toEqual([2, 5]);
  });

  test("a fully expanded gap emits only source lines with no separator", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 6], [1, 6]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expansionByKey: expansions([gapKey("before", 0), { top: 3, bottom: 3 }]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    expect(result.filter((row) => row.type === "collapsed")).toHaveLength(0);
    expect(result.filter((row) => row.type === "split-line")).toHaveLength(6);
    const texts = result
      .filter((row): row is Extract<DiffRow, { type: "split-line" }> => row.type === "split-line")
      .map((row) => row.left.spans[0]?.text);
    expect(texts).toEqual(["alpha", "beta", "gamma", "delta", "epsilon", "zeta"]);
  });

  test("over-requested expansion clamps to the gap and fully reveals it", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 6], [1, 6]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expansionByKey: expansions([gapKey("before", 0), { top: 99, bottom: 99 }]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    expect(result.filter((row) => row.type === "collapsed")).toHaveLength(0);
    expect(result.filter((row) => row.type === "split-line")).toHaveLength(6);
  });

  test("expands trailing gaps from the requested (bottom) side", () => {
    const rows: DiffRow[] = [makeHunkHeader(0), makeCollapsedRow("trailing", 0, [4, 6], [4, 6])];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expansionByKey: expansions([gapKey("trailing", 0), { top: 0, bottom: 2 }]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "new",
    });

    // [hunk-header][residual 1 hidden][epsilon][zeta]
    expect(result.map((row) => row.type)).toEqual([
      "hunk-header",
      "collapsed",
      "stack-line",
      "stack-line",
    ]);
    expect(collapsedAt(result, 1).text).toBe("1 unchanged line");
    const last = result[3];
    if (!last || last.type !== "stack-line") {
      throw new Error("expected stack-line");
    }
    expect(last.cell.newLineNumber).toBe(6);
    expect(last.cell.spans[0]?.text).toBe("zeta");
  });

  test("uses the old-side range when side is `old`", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [2, 3], [10, 11]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expansionByKey: expansions([gapKey("before", 0), { top: 1, bottom: 0 }]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      side: "old",
    });

    const first = result[0];
    if (!first || first.type !== "split-line") {
      throw new Error("expected split-line context row");
    }
    expect(first.left.lineNumber).toBe(2);
    expect(first.right.lineNumber).toBe(10);
    expect(first.left.spans[0]?.text).toBe("beta");
    // Residual carries the shrunk old-side range.
    expect(collapsedAt(result, 1).oldRange).toEqual([3, 3]);
  });

  test("normalizes CRLF so expanded rows do not carry a stray carriage return", () => {
    const sourceWithCrlf = "alpha\r\nbeta\r\ngamma\r\n";
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 2], [1, 2]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expansionByKey: expansions([gapKey("before", 0), { top: 2, bottom: 0 }]),
      sourceStatus: { kind: "loaded", text: sourceWithCrlf },
      side: "new",
    });

    const inserted = result[0];
    if (!inserted || inserted.type !== "stack-line") {
      throw new Error("expected stack-line context row");
    }
    expect(inserted.cell.spans[0]?.text).toBe("alpha");
  });

  test("does not pass terminal controls through expanded source rows", () => {
    const sourceWithControls = `safe${OSC52_CLIPBOARD}${CSI_CLEAR_SCREEN}${DCS_PAYLOAD}\x07\rspoof\bhidden\x1b\nfollow\n`;
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 1], [1, 1]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expansionByKey: expansions([gapKey("before", 0), { top: 1, bottom: 0 }]),
      sourceStatus: { kind: "loaded", text: sourceWithControls },
      side: "new",
    });

    const inserted = result[0];
    if (!inserted || inserted.type !== "stack-line") {
      throw new Error("expected one stack-line row");
    }

    const text = inserted.cell.spans.map((span) => span.text).join("");
    expect(text).toContain("safe");
    expect(text).toContain("spoof");
    expect(text).toContain("hidden");
    expectNoUnsafeTerminalControls(text);
  });

  test("expands tabs in source lines so terminal cells stay aligned", () => {
    const sourceWithTab = "a\tb\nfollow\n";
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 1], [1, 1]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expansionByKey: expansions([gapKey("before", 0), { top: 1, bottom: 0 }]),
      sourceStatus: { kind: "loaded", text: sourceWithTab },
      side: "new",
    });

    const inserted = result[0];
    if (!inserted || inserted.type !== "stack-line") {
      throw new Error("expected one stack-line row");
    }
    expect(inserted.cell.spans[0]?.text.includes("\t")).toBe(false);
  });

  test("uses caller-provided spans for expanded source lines", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [2, 3], [2, 3]), makeHunkHeader(0)];
    const calls: Array<{ line: string | undefined; sourceLineNumber: number }> = [];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expansionByKey: expansions([gapKey("before", 0), { top: 2, bottom: 0 }]),
      sourceStatus: { kind: "loaded", text: SOURCE },
      sourceLineSpans: (line, sourceLineNumber) => {
        calls.push({ line, sourceLineNumber });
        return [{ text: `highlighted:${line ?? ""}`, fg: "#abcdef" }];
      },
      side: "new",
    });

    expect(calls).toEqual([
      { line: "beta", sourceLineNumber: 1 },
      { line: "gamma", sourceLineNumber: 2 },
    ]);

    const inserted = result[0];
    if (!inserted || inserted.type !== "stack-line") {
      throw new Error("expected stack-line context row");
    }
    expect(inserted.cell.spans).toEqual([{ text: "highlighted:beta", fg: "#abcdef" }]);
  });

  test("shows an error row when loaded source is shorter than the collapsed range", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [1, 3], [1, 3]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "stack",
      expansionByKey: expansions([gapKey("before", 0), { top: 3, bottom: 0 }]),
      sourceStatus: { kind: "loaded", text: "alpha\n" },
      side: "new",
    });

    expect(result.map((row) => row.type)).toEqual(["collapsed", "hunk-header"]);
    const collapsed = collapsedAt(result, 0);
    expect(collapsed.text.toLowerCase()).toContain("could not load");
  });

  test("shows an error row when old-side split expansion is out of bounds", () => {
    const rows: DiffRow[] = [makeCollapsedRow("before", 0, [2, 3], [10, 11]), makeHunkHeader(0)];

    const result = expandCollapsedRows(rows, {
      layout: "split",
      expansionByKey: expansions([gapKey("before", 0), { top: 2, bottom: 0 }]),
      sourceStatus: { kind: "loaded", text: "alpha\n" },
      side: "old",
    });

    expect(result.map((row) => row.type)).toEqual(["collapsed", "hunk-header"]);
    expect(collapsedAt(result, 0).text.toLowerCase()).toContain("could not load");
  });
});

describe("selectGapForKeyboardToggle", () => {
  test("returns the leading gap of the selected hunk when one exists", () => {
    const hunks = [{ collapsedBefore: 3 }, { collapsedBefore: 0 }];
    expect(selectGapForKeyboardToggle(hunks, 0, false)).toBe(gapKey("before", 0));
  });

  test("falls forward to the next hunk's leading gap when the selected hunk has none", () => {
    const hunks = [{ collapsedBefore: 0 }, { collapsedBefore: 5 }, { collapsedBefore: 0 }];
    expect(selectGapForKeyboardToggle(hunks, 0, false)).toBe(gapKey("before", 1));
  });

  test("falls back to the trailing gap when no later leading gap exists", () => {
    const hunks = [{ collapsedBefore: 0 }, { collapsedBefore: 0 }];
    expect(selectGapForKeyboardToggle(hunks, 0, true)).toBe(gapKey("trailing", 1));
  });

  test("returns null when no leading or trailing gap is reachable", () => {
    const hunks = [{ collapsedBefore: 0 }, { collapsedBefore: 0 }];
    expect(selectGapForKeyboardToggle(hunks, 0, false)).toBeNull();
  });

  test("returns null for an empty hunk list", () => {
    expect(selectGapForKeyboardToggle([], 0, false)).toBeNull();
  });

  test("clamps a stale selectedHunkIndex into the valid range", () => {
    const hunks = [{ collapsedBefore: 4 }, { collapsedBefore: 0 }];
    expect(selectGapForKeyboardToggle(hunks, 99, true)).toBe(gapKey("trailing", 1));
  });
});
