import { describe, expect, test } from "bun:test";
import { resolveEditTargetNote, type EditTargetCandidate } from "./reviewNotes";

/** Build a labelled candidate so assertions can name the expected pick. */
function note(id: string, hunkIndex: number, side: "old" | "new", line: number) {
  return { id, hunkIndex, side, line } satisfies EditTargetCandidate & { id: string };
}

describe("resolveEditTargetNote", () => {
  test("returns null when the hunk has no notes", () => {
    expect(resolveEditTargetNote([], 0)).toBeNull();
    expect(resolveEditTargetNote([note("a", 1, "new", 5)], 0)).toBeNull();
  });

  test("returns the only note on the hunk, reference or not", () => {
    const only = note("a", 0, "new", 5);
    expect(resolveEditTargetNote([only], 0)?.id).toBe("a");
    expect(resolveEditTargetNote([only], 0, { side: "new", line: 999 })?.id).toBe("a");
  });

  test("ignores notes on other hunks", () => {
    const notes = [note("other", 1, "new", 5), note("target", 0, "new", 9)];
    expect(resolveEditTargetNote(notes, 0)?.id).toBe("target");
  });

  test("without a reference, picks the first candidate in sidebar order", () => {
    const notes = [note("first", 0, "new", 20), note("second", 0, "new", 3)];
    expect(resolveEditTargetNote(notes, 0)?.id).toBe("first");
  });

  test("with a reference, picks the nearest anchor line", () => {
    const notes = [note("far", 0, "new", 5), note("near", 0, "new", 20)];
    expect(resolveEditTargetNote(notes, 0, { side: "new", line: 18 })?.id).toBe("near");
  });

  test("breaks an equal-distance tie toward the same side", () => {
    const notes = [note("oldside", 0, "old", 8), note("newside", 0, "new", 12)];
    // reference line 10 is equidistant (2) from both; prefer the same side (new).
    expect(resolveEditTargetNote(notes, 0, { side: "new", line: 10 })?.id).toBe("newside");
  });

  test("keeps the earliest candidate on a full tie", () => {
    const notes = [note("first", 0, "new", 8), note("second", 0, "new", 12)];
    // Equidistant (2) and same side: earliest in order wins.
    expect(resolveEditTargetNote(notes, 0, { side: "new", line: 10 })?.id).toBe("first");
  });
});
