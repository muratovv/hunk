import {
  clampReviewGapReveal,
  reviewGapId,
  type ReviewGapReveal,
} from "../../core/review/expansion";
import { normalizedReviewSourceLines } from "../../core/review/geometry";
import { DEFAULT_TAB_WIDTH } from "../../core/run/tabWidth";
import { sanitizeTerminalLine, sanitizeTerminalSpans } from "../../lib/terminalText";
import { expandDiffTabs } from "./codeColumns";
import type {
  CollapsedGapPosition,
  DiffRow,
  RenderSpan,
  SplitLineCell,
  UnifiedLineCell,
} from "./diffRows";

export type ExpansionLayout = "split" | "unified";

/** Per-file load status for the source text used to fill expanded gaps. */
export type FileSourceStatus =
  | { kind: "loading" }
  | { kind: "loaded"; text: string }
  | { kind: "error"; reason?: "too-large" };

export interface ExpandCollapsedRowsOptions {
  layout: ExpansionLayout;
  /** Lines revealed from each edge, by gap id; a gap absent here stays collapsed. */
  reveals: ReadonlyMap<string, ReviewGapReveal>;
  sourceStatus: FileSourceStatus | undefined;
  tabWidth?: number;
  /** Optional syntax-aware span resolver for a zero-based source line. */
  sourceLineSpans?: (line: string | undefined, sourceLineNumber: number) => RenderSpan[];
  // Whose side's line indices in the source text. Defaults to "new".
  // For deleted files (no new side) callers should pass "old" instead.
  side?: "old" | "new";
}

const LINE_COUNT_BY_LOADED_STATUS = new WeakMap<FileSourceStatus, number>();

/** Line total of loaded source, counted once per status object (render paths ask often). */
export function loadedSourceLineCount(status: FileSourceStatus | undefined) {
  if (status?.kind !== "loaded") {
    return undefined;
  }
  let count = LINE_COUNT_BY_LOADED_STATUS.get(status);
  if (count === undefined) {
    count = normalizedReviewSourceLines(status.text).length;
    LINE_COUNT_BY_LOADED_STATUS.set(status, count);
  }
  return count;
}

function hiddenRowText(lineCount: number) {
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

function spansFor(line: string | undefined, tabWidth: number): RenderSpan[] {
  const text = expandDiffTabs(sanitizeTerminalLine(line ?? ""), tabWidth);
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
    expandedGapKey: reviewGapId(position, hunkIndex),
  };
}

function buildUnifiedContextRow(
  fileId: string,
  hunkIndex: number,
  position: CollapsedGapPosition,
  index: number,
  oldLineNumber: number,
  newLineNumber: number,
  spans: RenderSpan[],
): Extract<DiffRow, { type: "unified-line" }> {
  const cell: UnifiedLineCell = {
    kind: "context",
    sign: " ",
    oldLineNumber,
    newLineNumber,
    spans,
  };

  return {
    type: "unified-line",
    key: `${fileId}:expanded:${position}:${hunkIndex}:${index}`,
    fileId,
    hunkIndex,
    cell,
    isExpansionRow: true,
    expandedGapKey: reviewGapId(position, hunkIndex),
  };
}

/**
 * Replace each revealed collapsed row with the unchanged file lines it now shows.
 *
 * A gap emits its top-edge lines, then a separator for the still-hidden middle, then its
 * bottom-edge lines; once nothing is hidden the separator goes and the hunks join. While
 * source is loading or failed, the collapsed row stays whole and its label reports that.
 */
export function expandCollapsedRows(
  rows: DiffRow[],
  options: ExpandCollapsedRowsOptions,
): DiffRow[] {
  const {
    layout,
    reveals,
    sourceLineSpans,
    sourceStatus,
    tabWidth = DEFAULT_TAB_WIDTH,
    side = "new",
  } = options;

  if (reveals.size === 0) {
    return rows;
  }

  const sourceLines =
    sourceStatus?.kind === "loaded" ? normalizedReviewSourceLines(sourceStatus.text) : [];
  const result: DiffRow[] = [];

  for (const row of rows) {
    if (row.type !== "collapsed") {
      result.push(row);
      continue;
    }

    const range = side === "old" ? row.oldRange : row.newRange;
    const lineCount = Math.max(0, range[1] - range[0] + 1);
    const requested = reveals.get(reviewGapId(row.position, row.hunkIndex));
    const reveal = requested ? clampReviewGapReveal(requested, lineCount) : undefined;
    if (!reveal || reveal.top + reveal.bottom === 0) {
      result.push(row);
      continue;
    }

    if (sourceStatus?.kind === "loading") {
      result.push({ ...row, text: loadingRowText(lineCount) });
      continue;
    }

    if (sourceStatus?.kind === "error") {
      result.push({ ...row, text: errorRowText(lineCount, sourceStatus.reason) });
      continue;
    }

    if (sourceStatus === undefined) {
      // A reveal can be recorded a tick before the controller commits its load status;
      // keep the original label until status arrives.
      result.push(row);
      continue;
    }

    const sourceStartIndex = range[0] - 1;
    const sourceEndIndex = range[1] - 1;
    if (
      lineCount > 0 &&
      (sourceStartIndex < 0 ||
        sourceEndIndex < sourceStartIndex ||
        sourceEndIndex >= sourceLines.length)
    ) {
      result.push({ ...row, text: errorRowText(lineCount) });
      continue;
    }

    const pushContextRow = (offset: number) => {
      const oldLineNumber = row.oldRange[0] + offset;
      const newLineNumber = row.newRange[0] + offset;
      const sourceLineNumber = (side === "old" ? oldLineNumber : newLineNumber) - 1;
      const text = sourceLines[sourceLineNumber];
      const spans = sourceLineSpans
        ? sanitizeTerminalSpans(sourceLineSpans(text, sourceLineNumber))
        : spansFor(text, tabWidth);
      const build = layout === "split" ? buildSplitContextRow : buildUnifiedContextRow;
      result.push(
        build(row.fileId, row.hunkIndex, row.position, offset, oldLineNumber, newLineNumber, spans),
      );
    };

    for (let offset = 0; offset < reveal.top; offset += 1) {
      pushContextRow(offset);
    }

    const hidden = lineCount - reveal.top - reveal.bottom;
    if (hidden > 0) {
      const oldStart = row.oldRange[0] + reveal.top;
      const newStart = row.newRange[0] + reveal.top;
      result.push({
        ...row,
        text: hiddenRowText(hidden),
        oldRange: [oldStart, oldStart + hidden - 1],
        newRange: [newStart, newStart + hidden - 1],
        revealed: true,
      });
    }

    for (let offset = lineCount - reveal.bottom; offset < lineCount; offset += 1) {
      pushContextRow(offset);
    }
  }

  return result;
}
