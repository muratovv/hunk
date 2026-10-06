import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { toExtensionPaintTheme } from "../../../../../ui/lib/extensionPaintTheme";
import { resolveTheme } from "../../../../../ui/themes";
import { DEMO_RANGE_STOPS, moveActiveHandle } from "./model";
import { RANGE_SLIDER_HEIGHT, RangeSlider } from "./RangeSlider";
import { createRangeSliderStore } from "./store";

const theme = toExtensionPaintTheme(resolveTheme("github-dark-default", null));

/** Render the slider over the demo stops with a private store. */
async function renderTestSlider(width = 30) {
  const store = createRangeSliderStore();
  const setup = await testRender(
    <RangeSlider stops={DEMO_RANGE_STOPS} theme={theme} width={width} store={store} />,
    { width, height: RANGE_SLIDER_HEIGHT },
  );
  await act(async () => {
    await setup.renderOnce();
  });
  return { setup, store };
}

describe("RangeSlider", () => {
  test("paints the full range with both handles and their stop labels", async () => {
    const { setup } = await renderTestSlider();
    try {
      const lines = setup.captureCharFrame().split("\n");
      expect(lines[0]).toContain("Range");
      expect(lines[0]).toContain("5 steps");
      expect(lines[1]).toMatch(/^ ◆━+●━+●━+●━+●━+◆  $/);
      expect(lines[2]).toContain("▸from base");
      expect(lines[3]).toContain(" to   WIP");
    } finally {
      act(() => setup.renderer.destroy());
    }
  });

  test("repaints when the store moves a handle", async () => {
    const { setup, store } = await renderTestSlider();
    try {
      await act(async () => {
        store.updateSelection((selection, count) => moveActiveHandle(selection, 2, count));
        await setup.renderOnce();
      });
      const lines = setup.captureCharFrame().split("\n");
      expect(lines[0]).toContain("3 steps");
      expect(lines[1]).toMatch(/^ ○─+○─+◆━+●━+●━+◆  $/);
      expect(lines[2]).toContain("5d6e7f8");
    } finally {
      act(() => setup.renderer.destroy());
    }
  });
});
