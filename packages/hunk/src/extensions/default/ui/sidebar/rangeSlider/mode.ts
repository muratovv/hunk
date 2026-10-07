/**
 * Registers the keyboard side of the commit-range slider: `C` enters a mode that moves its handles.
 *
 * Inside the mode `h`/`l` (or arrows) step the active handle, `H`/`L` (or shift+arrows) slide the
 * whole range, `tab` swaps handles, and `esc`/`enter`/`C` leave. Unrelated keys pass through so the
 * review keeps scrolling. The status line shows the current range while the mode is active.
 */
import type {
  ExtensionKeyEvent,
  ExtensionKeyboardModeContext,
  ExtensionStatusSpan,
  HunkExtensionAPI,
} from "../../../../../extension-api/types";
import { moveActiveHandle, shiftRange, toggleActiveHandle, type RangeSelection } from "./model";
import { rangeSliderStore, type RangeSliderStore } from "./store";

export const RANGE_SLIDER_MODE_ID = "range";
export const RANGE_SLIDER_COMMAND_ID = "range.edit";
const RANGE_SLIDER_STATUS_ID = "range.status";

export type RangeKeyAction =
  | { kind: "edit"; update: (selection: RangeSelection, stopCount: number) => RangeSelection }
  | { kind: "exit" }
  | { kind: "pass" };

/** Report whether a key is the shifted form of a letter, e.g. `H`. */
function isShiftedLetter(key: ExtensionKeyEvent, letter: string) {
  return key.name === letter && (key.shift === true || key.sequence === letter.toUpperCase());
}

/** Decide what one key does to the slider while the range mode owns the keyboard. */
export function rangeKeyAction(key: ExtensionKeyEvent): RangeKeyAction {
  if (key.ctrl || key.meta || key.option) return { kind: "pass" };
  if (key.name === "escape" || key.name === "return" || key.name === "enter")
    return { kind: "exit" };
  if (isShiftedLetter(key, "c")) return { kind: "exit" };
  if (key.name === "tab") return { kind: "edit", update: toggleActiveHandle };
  if (isShiftedLetter(key, "h") || (key.name === "left" && key.shift)) {
    return { kind: "edit", update: (selection, count) => shiftRange(selection, -1, count) };
  }
  if (isShiftedLetter(key, "l") || (key.name === "right" && key.shift)) {
    return { kind: "edit", update: (selection, count) => shiftRange(selection, 1, count) };
  }
  if (key.name === "h" || key.name === "left") {
    return { kind: "edit", update: (selection, count) => moveActiveHandle(selection, -1, count) };
  }
  if (key.name === "l" || key.name === "right") {
    return { kind: "edit", update: (selection, count) => moveActiveHandle(selection, 1, count) };
  }
  return { kind: "pass" };
}

/** Describe the current range on the status line. */
function rangeStatusSpans(store: RangeSliderStore): ExtensionStatusSpan[] {
  const { stops, selection } = store.getSnapshot();
  const from = stops[selection.from]?.label ?? "?";
  const to = stops[selection.to]?.label ?? "?";
  return [
    { text: "range ", tone: "accent" },
    { text: `${from}..${to}` },
    { text: "  h/l move · tab handle · H/L slide · esc done", tone: "muted" },
  ];
}

/** Repaint the mode's status item. */
function publishStatus(ctx: ExtensionKeyboardModeContext, store: RangeSliderStore) {
  ctx.statusLine.set({ id: RANGE_SLIDER_STATUS_ID, spans: rangeStatusSpans(store), priority: 1 });
}

/** Register the range mode and its toggle command against one slider store. */
export function registerRangeSliderMode(
  hunk: HunkExtensionAPI,
  store: RangeSliderStore = rangeSliderStore,
) {
  hunk.registerKeyboardMode({
    id: RANGE_SLIDER_MODE_ID,
    title: "Commit range",
    onEnter(ctx) {
      store.setEditing(true);
      publishStatus(ctx, store);
    },
    onExit(ctx) {
      store.setEditing(false);
      ctx.statusLine.clear(RANGE_SLIDER_STATUS_ID);
    },
    onKey(key, ctx) {
      const action = rangeKeyAction(key);
      if (action.kind !== "edit") return action.kind;
      store.updateSelection(action.update);
      publishStatus(ctx, store);
      return "handled";
    },
  });

  hunk.registerCommand(
    { id: RANGE_SLIDER_COMMAND_ID, title: "Edit commit range", key: "C" },
    (ctx) => {
      if (ctx.keyboardModes.isActive(RANGE_SLIDER_MODE_ID)) {
        ctx.keyboardModes.exitMode();
        return;
      }
      if (store.getSnapshot().stops.length === 0) {
        ctx.notify("This review has no commit range in the files pane", "info");
        return;
      }
      ctx.keyboardModes.enterMode(RANGE_SLIDER_MODE_ID);
    },
  );
}
