/** Renders collapsed gaps and hunk headers without introducing code-row geometry policy. */
import type { UserNoteLineTarget } from "../../core/liveComments";
import type { MouseEvent as TuiMouseEvent } from "@opentui/core";
import { reviewGapId } from "../../core/review/expansion";
import { measureTextWidth } from "../lib/text";
import type { AppTheme } from "../themes";
import { CODE_ROW_ADD_NOTE_BADGE_TEXT } from "./codeRowAffordance";
import type { PlannedDiffMetaReviewRow } from "./reviewRenderPlan";
import type { GapAction } from "./gapAction";
import { fitText } from "./plannedRowText";
import { diffRailMarker, dimRailColor, neutralRailColor } from "./rowStyle";
import { markNestedRowMouseAction } from "./rowMouseActions";

export interface DiffMetaRowViewProps {
  plannedRow: PlannedDiffMetaReviewRow;
  width: number;
  theme: AppTheme;
  selected: boolean;
  showHunkHeaders: boolean;
  showAddNoteBadge?: boolean;
  onHoverRow?: (rowKey: string) => void;
  onStartUserNoteAtHunk?: (hunkIndex: number, target?: UserNoteLineTarget) => void;
  /** Present only when the file has source to expand gaps from. */
  onGapAction?: (action: GapAction) => void;
}

interface GapZone {
  key: string;
  text: string;
  fg: string;
  /** Absent for the label: a near miss on an arrow must not do anything bigger than a step. */
  action?: GapAction;
}

/** One span of a gap row; claims a click only when it carries an action. */
function GapZoneView({
  zone,
  theme,
  onGapAction,
}: {
  zone: GapZone;
  theme: AppTheme;
  onGapAction: (action: GapAction) => void;
}) {
  const { action } = zone;
  return (
    <box
      style={{ width: measureTextWidth(zone.text), height: 1 }}
      onMouseUp={
        action
          ? (event: TuiMouseEvent) => {
              markNestedRowMouseAction(event);
              onGapAction(action);
            }
          : undefined
      }
    >
      <text fg={zone.fg} bg={theme.panelAlt}>
        {zone.text}
      </text>
    </box>
  );
}

/**
 * The zones of one expandable gap row.
 *
 * ▼ grows the gap's top edge down from the hunk above, ▲ grows its bottom edge up from
 * the hunk below, so the file's first gap has only ▲ and its trailing gap only ▼. Once
 * anything is revealed the row offers ✕; a fully revealed gap keeps only that.
 */
function gapRowZones(
  row: Extract<PlannedDiffMetaReviewRow["row"], { type: "collapsed" }>,
  theme: AppTheme,
  width: number,
): GapZone[] {
  const gapId = reviewGapId(row.position, row.hunkIndex);
  const hasHidden = !row.fullyRevealed;
  const hasAbove = hasHidden && (row.position === "trailing" || row.hunkIndex > 0);
  const hasBelow = hasHidden && row.position === "before";
  const label: GapZone = {
    key: "label",
    text: `${hasAbove ? "" : " "}··· ${row.text} ···`,
    fg: theme.muted,
  };
  const zones: GapZone[] = [];
  if (hasAbove) {
    zones.push({
      key: "down",
      text: " ▼ ",
      fg: theme.text,
      action: { kind: "reveal", gapId, edge: "top" },
    });
  }
  zones.push(label);
  if (hasBelow) {
    zones.push({
      key: "up",
      text: " ▲ ",
      fg: theme.text,
      action: { kind: "reveal", gapId, edge: "bottom" },
    });
  }
  if (row.revealed) {
    zones.push({
      key: "collapse",
      text: " ✕ ",
      fg: theme.text,
      action: { kind: "collapse-gap", gapId },
    });
  }
  // The arrows and ✕ always fit; only the label gives way on a narrow pane.
  const fixedWidth = zones.reduce(
    (total, zone) => (zone === label ? total : total + measureTextWidth(zone.text)),
    1,
  );
  label.text = fitText(label.text, Math.max(0, width - fixedWidth));
  return zones;
}

/** Render one collapsed gap or hunk header with its nested row controls. */
export function DiffMetaRowView({
  plannedRow,
  width,
  theme,
  selected,
  showHunkHeaders,
  showAddNoteBadge = false,
  onHoverRow,
  onStartUserNoteAtHunk,
  onGapAction,
}: DiffMetaRowViewProps) {
  const { anchorId, row } = plannedRow;
  if (row.type === "hunk-header" && !showHunkHeaders) {
    return null;
  }
  const railFg = selected ? neutralRailColor(theme) : dimRailColor(neutralRailColor(theme), theme);

  if (row.type === "collapsed" && onGapAction) {
    return (
      <box
        id={anchorId}
        style={{ width, height: 1, flexDirection: "row", backgroundColor: theme.panelAlt }}
        onMouseMove={() => onHoverRow?.(row.key)}
        onMouseOver={() => onHoverRow?.(row.key)}
      >
        <text fg={railFg} bg={theme.panelAlt}>
          {diffRailMarker()}
        </text>
        {gapRowZones(row, theme, width).map((zone) => (
          <GapZoneView key={zone.key} zone={zone} theme={theme} onGapAction={onGapAction} />
        ))}
      </box>
    );
  }

  const badges = [
    showAddNoteBadge
      ? {
          key: "user-note",
          text: CODE_ROW_ADD_NOTE_BADGE_TEXT,
          onClick: () => onStartUserNoteAtHunk?.(row.hunkIndex),
        }
      : null,
  ].filter((badge): badge is { key: string; text: string; onClick: () => void } => Boolean(badge));
  const badgeWidth = badges.reduce((total, badge) => total + badge.text.length + 1, 0);
  const labelText = row.type === "collapsed" ? `··· ${row.text} ···` : row.text;
  const label = fitText(labelText, Math.max(0, width - 1 - badgeWidth));

  if (badges.length === 0) {
    return (
      <box
        id={anchorId}
        style={{
          width,
          height: 1,
          backgroundColor: theme.panelAlt,
        }}
        onMouseMove={() => onHoverRow?.(row.key)}
        onMouseOver={() => onHoverRow?.(row.key)}
      >
        <text>
          <span fg={railFg} bg={theme.panelAlt}>
            {diffRailMarker()}
          </span>
          <span
            fg={row.type === "collapsed" ? theme.muted : theme.badgeNeutral}
            bg={theme.panelAlt}
          >
            {label}
          </span>
        </text>
      </box>
    );
  }

  return (
    <box
      id={anchorId}
      style={{
        width,
        height: 1,
        flexDirection: "row",
        backgroundColor: theme.panelAlt,
      }}
      onMouseMove={() => onHoverRow?.(row.key)}
      onMouseOver={() => onHoverRow?.(row.key)}
    >
      <box style={{ width: Math.max(0, width - badgeWidth), height: 1 }}>
        <text>
          <span fg={railFg} bg={theme.panelAlt}>
            {diffRailMarker()}
          </span>
          <span
            fg={row.type === "collapsed" ? theme.muted : theme.badgeNeutral}
            bg={theme.panelAlt}
          >
            {label}
          </span>
        </text>
      </box>
      {badges.map((badge) => (
        <box
          key={badge.key}
          style={{ width: badge.text.length + 1, height: 1 }}
          onMouseUp={(event) => {
            markNestedRowMouseAction(event);
            badge.onClick();
          }}
        >
          <text fg={theme.noteTitleText} bg={theme.noteTitleBackground}>{` ${badge.text}`}</text>
        </box>
      ))}
    </box>
  );
}
