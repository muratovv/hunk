import { describe, expect, test } from "bun:test";
import type { ExtensionKeyEvent } from "../../../../../extension-api/types";
import { rangeKeyAction } from "./mode";

const selection = { from: 1, to: 3, active: "from" as const };

/** Apply one key to the test selection over six stops, or report the non-edit outcome. */
function applyTestKey(key: ExtensionKeyEvent) {
  const action = rangeKeyAction(key);
  return action.kind === "edit" ? action.update(selection, 6) : action.kind;
}

describe("range mode keys", () => {
  test("h / l step the active handle", () => {
    expect(applyTestKey({ name: "h", sequence: "h" })).toMatchObject({ from: 0, to: 3 });
    expect(applyTestKey({ name: "right", sequence: "" })).toMatchObject({ from: 2, to: 3 });
  });

  test("H / L slide both handles", () => {
    expect(applyTestKey({ name: "l", sequence: "L", shift: true })).toMatchObject({
      from: 2,
      to: 4,
    });
    expect(applyTestKey({ name: "left", shift: true })).toMatchObject({ from: 0, to: 2 });
  });

  test("tab swaps the active handle", () => {
    expect(applyTestKey({ name: "tab" })).toMatchObject({ active: "to" });
  });

  test("esc, enter and C leave the mode; anything else passes through", () => {
    expect(applyTestKey({ name: "escape" })).toBe("exit");
    expect(applyTestKey({ name: "return" })).toBe("exit");
    expect(applyTestKey({ name: "c", sequence: "C", shift: true })).toBe("exit");
    expect(applyTestKey({ name: "c", sequence: "c" })).toBe("pass");
    expect(applyTestKey({ name: "j", sequence: "j" })).toBe("pass");
    expect(applyTestKey({ name: "l", ctrl: true })).toBe("pass");
  });
});
