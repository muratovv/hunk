import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { createTestReviewTimeline } from "../../../../../../../../test/helpers/review-timeline-helpers";
import type { ExtensionReviewReloadResult } from "../../../../../extension-api/types";
import { toExtensionPaintTheme } from "../../../../../ui/lib/extensionPaintTheme";
import { resolveTheme } from "../../../../../ui/themes";
import { moveActiveHandle } from "./model";
import { RANGE_SLIDER_HEIGHT, RangeSlider } from "./RangeSlider";
import { createRangeSliderStore } from "./store";

const theme = toExtensionPaintTheme(resolveTheme("github-dark-default", null));

/** Render the slider over a three-commit working-tree timeline with a private store. */
async function renderTestSlider(result: ExtensionReviewReloadResult = { ok: true }) {
  const store = createRangeSliderStore();
  const rescopes: Array<[string, string | null]> = [];
  const notices: string[] = [];
  const setup = await testRender(
    <RangeSlider
      timeline={createTestReviewTimeline()}
      rescopeReview={async (from, to) => {
        rescopes.push([from, to]);
        return result;
      }}
      notify={(message) => notices.push(message)}
      theme={theme}
      width={30}
      store={store}
      debounceMs={5}
    />,
    { width: 30, height: RANGE_SLIDER_HEIGHT },
  );
  await act(async () => {
    await setup.renderOnce();
  });
  return { setup, store, rescopes, notices };
}

/** Let the debounce timer and the re-scope promise settle, then repaint. */
async function settleTestSlider(setup: Awaited<ReturnType<typeof testRender>>) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    await setup.renderOnce();
  });
}

describe("RangeSlider", () => {
  test("paints the timeline's full range with both handles and their stops", async () => {
    const { setup, rescopes } = await renderTestSlider();
    try {
      const lines = setup.captureCharFrame().split("\n");
      expect(lines[0]).toContain("4 steps");
      expect(lines[1]).toMatch(/^ ◆━+●━+●━+●━+◆  $/);
      expect(lines[2]).toContain("▸from bbbbbbb base · fork");
      expect(lines[3]).toContain(" to   WIP working tree");
      await settleTestSlider(setup);
      expect(rescopes).toEqual([]);
    } finally {
      act(() => setup.renderer.destroy());
    }
  });

  test("re-scopes once the handles rest", async () => {
    const { setup, store, rescopes } = await renderTestSlider();
    try {
      await act(async () => {
        store.updateSelection((selection, count) => moveActiveHandle(selection, 1, count));
        store.updateSelection((selection, count) => moveActiveHandle(selection, 1, count));
      });
      await settleTestSlider(setup);
      expect(rescopes).toEqual([["2".repeat(40), null]]);
      expect(setup.captureCharFrame().split("\n")[2]).toContain("2222222 second");
    } finally {
      act(() => setup.renderer.destroy());
    }
  });

  test("snaps back and warns when the re-scope is refused", async () => {
    const { setup, store, notices } = await renderTestSlider({
      ok: false,
      reason: "failed",
      detail: "git exploded",
    });
    try {
      await act(async () => {
        store.updateSelection((selection, count) => moveActiveHandle(selection, 1, count));
      });
      await settleTestSlider(setup);
      expect(notices).toEqual(["Commit range not applied: git exploded"]);
      expect(store.getSnapshot().selection).toMatchObject({ from: 0, to: 4 });
    } finally {
      act(() => setup.renderer.destroy());
    }
  });
});
