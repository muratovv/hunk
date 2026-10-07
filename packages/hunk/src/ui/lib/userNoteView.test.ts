import { describe, expect, test } from "bun:test";
import {
  createTestReviewDocument,
  createTestStoredNote,
} from "../../../../../test/helpers/review-store-helpers";
import { userNoteResolutionsForView, viewRevisionOfSide } from "./userNoteView";

const view = { from: "base", to: null };
const document = createTestReviewDocument([{ key: "alpha", path: "alpha.ts", hunkCount: 2 }]);
const hunk0Line = document.files[0]!.hunks[0]!.additionStart;
const hunk1Line = document.files[0]!.hunks[1]!.additionStart;

/** A saved user note on alpha.ts's new side. */
function createTestUserNote(id: string, hunkIndex: number, line: number) {
  return createTestStoredNote({ id, fileKey: "alpha", source: "user", hunkIndex, line });
}

describe("user note view", () => {
  test("maps each side to the revision it shows; the working tree is null", () => {
    expect(viewRevisionOfSide(view, "old")).toBe("base");
    expect(viewRevisionOfSide(view, "new")).toBeNull();
  });

  test("keeps a note whose content and owner hunk are on screen", () => {
    const notes = [createTestUserNote("wip", 1, hunk1Line)];
    const resolutions = userNoteResolutionsForView(notes, () => null, view, document);
    expect(resolutions.get("wip")).toBe("active");
  });

  test("hides a note written on other content, even at a line the view shows", () => {
    const notes = [createTestUserNote("on-commit", 0, hunk0Line)];
    const resolutions = userNoteResolutionsForView(notes, () => "c1", view, document);
    expect(resolutions.get("on-commit")).toBe("orphaned");
  });

  test("hides a note whose owner hunk no longer covers its line", () => {
    const notes = [createTestUserNote("shifted", 0, hunk1Line)];
    const resolutions = userNoteResolutionsForView(notes, () => null, view, document);
    expect(resolutions.get("shifted")).toBe("orphaned");
  });

  test("leaves notes of unknown basis or of files off screen alone", () => {
    const notes = [
      createTestUserNote("legacy", 0, hunk0Line),
      createTestStoredNote({ id: "elsewhere", fileKey: "gone", source: "user" }),
    ];
    const resolutions = userNoteResolutionsForView(
      notes,
      (note) => (note.id === "legacy" ? undefined : "c1"),
      view,
      document,
    );
    expect(resolutions.get("legacy")).toBe("active");
    expect(resolutions.has("elsewhere")).toBe(false);
  });
});
