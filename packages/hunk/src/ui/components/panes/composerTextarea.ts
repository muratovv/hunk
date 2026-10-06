/** The note composer's editor: a textarea whose terminal cursor never shows outside its clip. */
import {
  TextareaRenderable,
  type OptimizedBuffer,
  type Renderable,
  type RenderContext,
  type TextareaOptions,
} from "@opentui/core";
import { extend } from "@opentui/react";

/** Whether one screen cell survives every ancestor that clips its children. */
export function cellVisibleThroughAncestors(node: Renderable, x: number, y: number) {
  for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.overflow === "visible") continue;
    const { screenX, screenY, width, height } = ancestor;
    if (x < screenX || x >= screenX + width || y < screenY || y >= screenY + height) {
      return false;
    }
  }
  return true;
}

/**
 * A textarea that hides the terminal cursor while its caret is clipped out of view.
 *
 * OpenTUI places a focused editor's caret even when a scroll box clips it, and the terminal
 * pins an off-screen position to its edge, so a scrolled-away composer blinked a cursor on
 * the header rows at every scroll step. Focus stays: typing still reaches the draft.
 */
export class ComposerTextareaRenderable extends TextareaRenderable {
  // `focused` is applied by the React reconciler, not the constructor; it is named here only
  // so the JSX element derived from these options accepts it like the built-in textarea.
  constructor(ctx: RenderContext, options: TextareaOptions & { focused?: boolean }) {
    super(ctx, options);
  }

  protected override renderCursor(buffer: OptimizedBuffer) {
    super.renderCursor(buffer);
    if (!this.focused || !this.showCursor) return;

    const caret = this.editorView.getVisualCursor();
    const x = this.screenX + caret.visualCol;
    const y = this.screenY + caret.visualRow;
    if (!cellVisibleThroughAncestors(this, x, y)) {
      this._ctx.setCursorPosition(0, 0, false);
    }
  }
}

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "composer-textarea": typeof ComposerTextareaRenderable;
  }
}

extend({ "composer-textarea": ComposerTextareaRenderable });
