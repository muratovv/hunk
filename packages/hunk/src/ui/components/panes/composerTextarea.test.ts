import { describe, expect, test } from "bun:test";
import type { Renderable } from "@opentui/core";
import { cellVisibleThroughAncestors } from "./composerTextarea";

/** A renderable stub with just the geometry the clip walk reads. */
function node(
  rect: { x: number; y: number; width: number; height: number },
  overflow: "visible" | "hidden",
  parent: Renderable | null = null,
) {
  return {
    screenX: rect.x,
    screenY: rect.y,
    width: rect.width,
    height: rect.height,
    overflow,
    parent,
  } as unknown as Renderable;
}

describe("cellVisibleThroughAncestors", () => {
  // A scroll viewport at rows 4-13 holding a composer that may have scrolled past its top.
  const viewport = node({ x: 0, y: 4, width: 80, height: 10 }, "hidden");
  const content = node({ x: 0, y: -20, width: 80, height: 200 }, "visible", viewport);
  const editor = node({ x: 6, y: 2, width: 60, height: 1 }, "visible", content);

  test("keeps a cell inside every clipping ancestor", () => {
    expect(cellVisibleThroughAncestors(editor, 10, 4)).toBe(true);
    expect(cellVisibleThroughAncestors(editor, 79, 13)).toBe(true);
  });

  test("drops a cell outside a clipping ancestor, whatever the unclipped ones say", () => {
    expect(cellVisibleThroughAncestors(editor, 10, 3)).toBe(false);
    expect(cellVisibleThroughAncestors(editor, 10, 14)).toBe(false);
    expect(cellVisibleThroughAncestors(editor, 80, 6)).toBe(false);
  });
});
