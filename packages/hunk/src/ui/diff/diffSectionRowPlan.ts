import { reviewExpansionSide, type ReviewGapReveal } from "../../core/review/expansion";
import { DEFAULT_TAB_WIDTH } from "../../core/run/tabWidth";
import { DEFAULT_HUNK_GAP } from "../../core/run/reviewGap";
import type { DiffFile } from "../../core/changeset/model";
import type { LayoutMode } from "../../core/run/commandInputs";
import type { VisibleAgentNote } from "../lib/agentAnnotations";
import type { AppTheme } from "../themes";
import { findMaxLineNumber, findMaxLineNumberInRows } from "./codeColumns";
import {
  expandCollapsedRows,
  loadedSourceLineCount,
  type FileSourceStatus,
} from "./expandCollapsedRows";
import {
  buildSplitRows,
  buildUnifiedRows,
  type HighlightedDiffCode,
  type RenderSpan,
} from "./diffRows";
import { buildReviewRenderPlan, type PlannedReviewRow } from "./reviewRenderPlan";

const NO_REVEALS: ReadonlyMap<string, ReviewGapReveal> = new Map();
const EMPTY_VISIBLE_AGENT_NOTES: VisibleAgentNote[] = [];

export interface DiffSectionRowPlan {
  lineNumberDigits: number;
  plannedRows: PlannedReviewRow[];
}

export interface BuildDiffSectionRowPlanOptions {
  reveals?: ReadonlyMap<string, ReviewGapReveal>;
  file: DiffFile | undefined;
  highlightedDiff?: HighlightedDiffCode | null;
  layout: Exclude<LayoutMode, "auto">;
  showHunkHeaders: boolean;
  sourceLineSpans?: (line: string | undefined, sourceLineNumber: number) => RenderSpan[];
  sourceStatus?: FileSourceStatus | undefined;
  tabWidth?: number;
  hunkGap?: number;
  theme: AppTheme;
  visibleAgentNotes?: VisibleAgentNote[];
}

/** Build Pierre rows for one file using the selected terminal diff layout. */
function buildBaseRows(
  file: DiffFile,
  layout: Exclude<LayoutMode, "auto">,
  highlightedDiff: HighlightedDiffCode | null | undefined,
  theme: AppTheme,
  tabWidth: number,
  sourceStatus: FileSourceStatus | undefined,
) {
  // Loaded source is what sizes a partial patch's trailing gap.
  const lineCount = loadedSourceLineCount(sourceStatus);
  const trailingSourceLines =
    lineCount === undefined
      ? undefined
      : { side: reviewExpansionSide(file.metadata.type), count: lineCount };
  return layout === "split"
    ? buildSplitRows(file, highlightedDiff ?? null, theme, tabWidth, trailingSourceLines)
    : buildUnifiedRows(file, highlightedDiff ?? null, theme, tabWidth, trailingSourceLines);
}

/** Build the shared file-level diff plan consumed by rendering and geometry measurement. */
export function buildDiffSectionRowPlan({
  reveals = NO_REVEALS,
  file,
  highlightedDiff = null,
  layout,
  showHunkHeaders,
  sourceLineSpans,
  sourceStatus,
  tabWidth = DEFAULT_TAB_WIDTH,
  hunkGap = DEFAULT_HUNK_GAP,
  theme,
  visibleAgentNotes = EMPTY_VISIBLE_AGENT_NOTES,
}: BuildDiffSectionRowPlanOptions): DiffSectionRowPlan {
  if (!file) {
    return {
      lineNumberDigits: 1,
      plannedRows: [],
    };
  }

  const baseRows = buildBaseRows(file, layout, highlightedDiff, theme, tabWidth, sourceStatus);
  const rows = expandCollapsedRows(baseRows, {
    layout,
    reveals,
    sourceLineSpans,
    sourceStatus,
    tabWidth,
    side: reviewExpansionSide(file.metadata.type),
  });

  return {
    lineNumberDigits: String(findMaxLineNumberInRows(rows, findMaxLineNumber(file))).length,
    plannedRows: buildReviewRenderPlan({
      fileId: file.id,
      rows,
      showHunkHeaders,
      visibleAgentNotes,
      hunkGap,
    }),
  };
}
