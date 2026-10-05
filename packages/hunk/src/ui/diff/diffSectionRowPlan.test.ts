import { describe, expect, test } from "bun:test";
import { parsePatchFiles } from "@pierre/diffs";
import { createTwoFilesPatch } from "diff";
import type { DiffFile } from "../../core/changeset/model";
import { resolveTheme } from "../themes";
import { buildDiffSectionRowPlan } from "./diffSectionRowPlan";

/** A git-style partial patch: hunk rows only, so the file's length is unknown. */
function createPartialDiffFile() {
  const before = Array.from({ length: 40 }, (_, index) => `line ${index + 1}\n`).join("");
  const after = before.replace("line 10\n", "line 10 modified\n");
  const patch = createTwoFilesPatch("tail.txt", "tail.txt", before, after, "", "", { context: 3 });
  const metadata = parsePatchFiles(patch, "partial-tail", true)[0]?.files[0];
  if (!metadata?.isPartial) {
    throw new Error("Expected partial patch metadata");
  }
  const file: DiffFile = {
    id: "partial-tail",
    path: "tail.txt",
    patch,
    language: "text",
    stats: { additions: 1, deletions: 1 },
    metadata,
    agent: null,
  };
  return { after, file };
}

function collapsedRows(plan: ReturnType<typeof buildDiffSectionRowPlan>) {
  return plan.plannedRows.flatMap((planned) =>
    "row" in planned && planned.row.type === "collapsed" ? [planned.row] : [],
  );
}

describe("buildDiffSectionRowPlan", () => {
  test("adds a partial patch's trailing gap once the source says how long the file is", () => {
    const { after, file } = createPartialDiffFile();
    const theme = resolveTheme("github-dark-default", null);

    const unsized = buildDiffSectionRowPlan({
      file,
      layout: "unified",
      showHunkHeaders: true,
      theme,
    });
    const sized = buildDiffSectionRowPlan({
      file,
      layout: "unified",
      showHunkHeaders: true,
      theme,
      sourceStatus: { kind: "loaded", text: after },
    });

    expect(collapsedRows(unsized).map((row) => row.position)).toEqual(["before"]);
    expect(collapsedRows(sized).at(-1)).toMatchObject({
      position: "trailing",
      newRange: [14, 40],
      text: "27 unchanged lines",
    });
  });
});
