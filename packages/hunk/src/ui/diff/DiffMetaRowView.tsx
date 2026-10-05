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
  /** This header's hunk has revealed context of its own, so it offers ✕ to fold it back. */
  hunkHasRevealedContext?: boolean;
}

interface GapZone {
  key: string;
  text: string;
  fg: string;
  action: GapAction;
}

/** One clickable span of a meta row; claims the event so the row does not also act on it. */
function GapZoneView({
  zone,
  theme,
  onGapAction,
}: {
  zone: GapZone;
  theme: AppTheme;
  onGapAction: (action: GapAction) => void;
}) {
  return (
    <box
      style={{ width: measureTextWidth(zone.text), height: 1 }}
      onMouseUp={(event: TuiMouseEvent) => {
        markNestedRowMouseAction(event);
        onGapAction(zone.action);
      }}
    >
      <text fg={zone.fg} bg={theme.panelAlt}>
        {zone.text}
      </text>
    </box>
  );
}

/**
 * The clickable zones of one expandable gap separator.
 *
 * ▼ grows the gap's top edge down from the hunk above, ▲ grows its bottom edge up from
 * the hunk below, so the file's first gap has only ▲ and its trailing gap only ▼. The
 * label reveals everything still hidden; ✕ appears once part of the gap is open.
 */
function gapSeparatorZones(
  row: Extract<PlannedDiffMetaReviewRow["row"], { type: "collapsed" }>,
  theme: AppTheme,
): GapZone[] {
  const gapId = reviewGapId(row.position, row.hunkIndex);
  const hidden = row.newRange[1] - row.newRange[0] + 1;
  const hasAbove = row.position === "trailing" || row.hunkIndex > 0;
  const hasBelow = row.position === "before";
  const zones: GapZone[] = [];
  if (hasAbove) {
    zones.push({
      key: "down",
      text: " ▼",
      fg: theme.text,
      action: { kind: "reveal", gapId, edge: "top" },
    });
  }
  zones.push({
    key: "label",
    text: ` ··· ${row.text} ···`,
    fg: theme.muted,
    action: { kind: "reveal", gapId, edge: "top", lines: hidden },
  });
  if (hasBelow) {
    zones.push({
      key: "up",
      text: " ▲",
      fg: theme.text,
      action: { kind: "reveal", gapId, edge: "bottom" },
    });
  }
  if (row.revealed) {
    zones.push({
      key: "collapse",
      text: "  ✕",
      fg: theme.text,
      action: { kind: "collapse-gap", gapId },
    });
  }
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
  hunkHasRevealedContext = false,
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
        {gapSeparatorZones(row, theme).map((zone) => (
          <GapZoneView key={zone.key} zone={zone} theme={theme} onGapAction={onGapAction} />
        ))}
      </box>
    );
  }

  const badges = [
    row.type === "hunk-header" && hunkHasRevealedContext && onGapAction
      ? {
          key: "collapse-hunk",
          text: "✕ ",
          fg: theme.text,
          bg: theme.panelAlt,
          onClick: () => onGapAction({ kind: "collapse-hunk", hunkIndex: row.hunkIndex }),
        }
      : null,
    showAddNoteBadge
      ? {
          key: "user-note",
          text: CODE_ROW_ADD_NOTE_BADGE_TEXT,
          fg: theme.noteTitleText,
          bg: theme.noteTitleBackground,
          onClick: () => onStartUserNoteAtHunk?.(row.hunkIndex),
        }
      : null,
  ].filter(
    (badge): badge is { key: string; text: string; fg: string; bg: string; onClick: () => void } =>
      Boolean(badge),
  );
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
          <text fg={badge.fg} bg={badge.bg}>{` ${badge.text}`}</text>
        </box>
      ))}
    </box>
  );
}
