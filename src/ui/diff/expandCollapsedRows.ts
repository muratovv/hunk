import { sanitizeTerminalLine, sanitizeTerminalSpans } from "../../lib/terminalText";
import { expandDiffTabs } from "./codeColumns";
import { clampExpansion, gapSize, hiddenMiddle, type GapExpansion } from "./gapExpansion";
import type {
  CollapsedGapPosition,
  DiffRow,
  RenderSpan,
  SplitLineCell,
  StackLineCell,
} from "./pierre";

export type ExpansionLayout = "split" | "stack";

/** Per-file load status for the source text used to fill expanded gaps. */
export type FileSourceStatus =
  | { kind: "loading" }
  | { kind: "loaded"; text: string }
  | { kind: "error"; reason?: "too-large" };

export interface ExpandCollapsedRowsOptions {
  layout: ExpansionLayout;
  /**
   * Per-gap directional expansion, keyed by {@link gapKey}. A gap absent from
   * the map (or mapped to a zero expansion) renders as a plain collapsed row.
   */
  expansionByKey: ReadonlyMap<string, GapExpansion>;
  sourceStatus: FileSourceStatus | undefined;
  /** Optional syntax-aware span resolver for a zero-based source line. */
  sourceLineSpans?: (line: string | undefined, sourceLineNumber: number) => RenderSpan[];
  // Whose side's line indices in the source text. Defaults to "new".
  // For deleted files (no new side) callers should pass "old" instead.
  side?: "old" | "new";
}

/** Stable identifier for one collapsed gap inside a single file. */
export function gapKey(position: CollapsedGapPosition, hunkIndex: number) {
  return `${position}:${hunkIndex}`;
}

/**
 * Pick the gap key that the keyboard shortcut should toggle for the selected
 * hunk. Looks at the leading gap of the current hunk first, then the leading
 * gaps of subsequent hunks, and finally the trailing gap of the file. Returns
 * `null` when no reachable gap exists.
 */
export function selectGapForKeyboardToggle(
  hunks: ReadonlyArray<{ collapsedBefore: number }>,
  selectedHunkIndex: number,
  hasTrailingGap: boolean,
): string | null {
  if (hunks.length === 0) {
    return null;
  }

  const startIndex = Math.max(0, Math.min(selectedHunkIndex, hunks.length - 1));
  for (let index = startIndex; index < hunks.length; index += 1) {
    if ((hunks[index]?.collapsedBefore ?? 0) > 0) {
      return gapKey("before", index);
    }
  }

  if (hasTrailingGap) {
    return gapKey("trailing", hunks.length - 1);
  }

  return null;
}

/** Label for the residual separator: how many unchanged lines are still hidden. */
function hiddenLinesText(lineCount: number) {
  return `${lineCount} unchanged ${lineCount === 1 ? "line" : "lines"}`;
}

function loadingRowText(lineCount: number) {
  return `Loading ${lineCount} unchanged ${lineCount === 1 ? "line" : "lines"}…`;
}

function errorRowText(lineCount: number, reason?: "too-large") {
  if (reason === "too-large") {
    return `Source too large to expand ${lineCount} unchanged ${lineCount === 1 ? "line" : "lines"}`;
  }

  return `Could not load ${lineCount} unchanged ${lineCount === 1 ? "line" : "lines"}`;
}

function sliceLines(sourceText: string) {
  // Normalize CRLF so Windows-authored sources don't leak `\r` into rendered spans.
  const normalized = sourceText.replaceAll("\r\n", "\n");
  const trimmed = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return trimmed.length === 0 ? [] : trimmed.split("\n");
}

function spansFor(line: string | undefined): RenderSpan[] {
  const text = expandDiffTabs(sanitizeTerminalLine(line ?? ""));
  return text.length > 0 ? [{ text }] : [];
}

function buildSplitContextRow(
  fileId: string,
  hunkIndex: number,
  position: CollapsedGapPosition,
  index: number,
  oldLineNumber: number,
  newLineNumber: number,
  spans: RenderSpan[],
): Extract<DiffRow, { type: "split-line" }> {
  const cell = (lineNumber: number): SplitLineCell => ({
    kind: "context",
    sign: " ",
    lineNumber,
    spans,
  });

  return {
    type: "split-line",
    key: `${fileId}:expanded:${position}:${hunkIndex}:${index}`,
    fileId,
    hunkIndex,
    left: cell(oldLineNumber),
    right: cell(newLineNumber),
    isExpansionRow: true,
  };
}

function buildStackContextRow(
  fileId: string,
  hunkIndex: number,
  position: CollapsedGapPosition,
  index: number,
  oldLineNumber: number,
  newLineNumber: number,
  spans: RenderSpan[],
): Extract<DiffRow, { type: "stack-line" }> {
  const cell: StackLineCell = {
    kind: "context",
    sign: " ",
    oldLineNumber,
    newLineNumber,
    spans,
  };

  return {
    type: "stack-line",
    key: `${fileId}:expanded:${position}:${hunkIndex}:${index}`,
    fileId,
    hunkIndex,
    cell,
    isExpansionRow: true,
  };
}

/**
 * Replace each directionally expanded collapsed gap with the unchanged source
 * lines it now reveals. A partially expanded gap emits its revealed top lines,
 * then a residual collapsed separator for the still-hidden middle, then its
 * revealed bottom lines. A fully expanded gap emits only source lines and no
 * separator (GitHub-style). While source is loading or failed, the single
 * collapsed row stays in place carrying a status label instead.
 */
export function expandCollapsedRows(
  rows: DiffRow[],
  options: ExpandCollapsedRowsOptions,
): DiffRow[] {
  const { layout, expansionByKey, sourceLineSpans, sourceStatus, side = "new" } = options;

  if (expansionByKey.size === 0) {
    return rows;
  }

  const sourceLines = sourceStatus?.kind === "loaded" ? sliceLines(sourceStatus.text) : [];
  const result: DiffRow[] = [];

  for (const row of rows) {
    if (row.type !== "collapsed") {
      result.push(row);
      continue;
    }

    const key = gapKey(row.position, row.hunkIndex);
    const range = side === "old" ? row.oldRange : row.newRange;
    const total = gapSize(range);
    const requested = expansionByKey.get(key);
    const expansion = requested ? clampExpansion(requested, total) : null;

    if (!expansion || (expansion.top === 0 && expansion.bottom === 0)) {
      result.push(row);
      continue;
    }

    if (sourceStatus?.kind === "loading") {
      result.push({ ...row, text: loadingRowText(total) });
      continue;
    }

    if (sourceStatus?.kind === "error") {
      result.push({ ...row, text: errorRowText(total, sourceStatus.reason) });
      continue;
    }

    if (sourceStatus === undefined) {
      // The controller can commit an expansion a tick before the load status;
      // keep the original label until the fetch status arrives.
      result.push(row);
      continue;
    }

    const sourceStartIndex = range[0] - 1;
    const sourceEndIndex = range[1] - 1;
    if (
      total > 0 &&
      (sourceStartIndex < 0 ||
        sourceEndIndex < sourceStartIndex ||
        sourceEndIndex >= sourceLines.length)
    ) {
      result.push({ ...row, text: errorRowText(total) });
      continue;
    }

    // Materialize one synthesized context row for a 0-based offset into the gap.
    const pushContextRow = (offset: number) => {
      const oldLineNumber = row.oldRange[0] + offset;
      const newLineNumber = row.newRange[0] + offset;
      const sourceLineNumber = (side === "old" ? oldLineNumber : newLineNumber) - 1;
      if (sourceLineNumber < 0 || sourceLineNumber >= sourceLines.length) {
        return;
      }

      const text = sourceLines[sourceLineNumber];
      const spans = sourceLineSpans
        ? sanitizeTerminalSpans(sourceLineSpans(text, sourceLineNumber))
        : spansFor(text);

      result.push(
        layout === "split"
          ? buildSplitContextRow(
              row.fileId,
              row.hunkIndex,
              row.position,
              offset,
              oldLineNumber,
              newLineNumber,
              spans,
            )
          : buildStackContextRow(
              row.fileId,
              row.hunkIndex,
              row.position,
              offset,
              oldLineNumber,
              newLineNumber,
              spans,
            ),
      );
    };

    // Top revealed lines — adjacent to the content preceding the gap.
    for (let offset = 0; offset < expansion.top; offset += 1) {
      pushContextRow(offset);
    }

    // Residual separator for the still-hidden middle; omitted once fully open.
    const middle = hiddenMiddle(expansion, total);
    if (middle) {
      const oldStart = row.oldRange[0] + middle.startOffset;
      const newStart = row.newRange[0] + middle.startOffset;
      result.push({
        ...row,
        text: hiddenLinesText(middle.count),
        oldRange: [oldStart, oldStart + middle.count - 1],
        newRange: [newStart, newStart + middle.count - 1],
        expansion,
      });
    }

    // Bottom revealed lines — adjacent to the content following the gap.
    for (let offset = total - expansion.bottom; offset < total; offset += 1) {
      pushContextRow(offset);
    }
  }

  return result;
}
