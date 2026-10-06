import { describe, expect, test } from "bun:test";
import { createTestReviewDocument } from "../../../../../test/helpers/review-store-helpers";
import {
  seedUserNotesFromSidecar,
  serializeUserNotesSidecar,
  type SidecarUserNote,
} from "./userNotesSidecar";

/** A note exactly as the fork-main build wrote it to `.hunk/notes.json`. */
function legacyNote(overrides: Partial<SidecarUserNote> = {}): SidecarUserNote {
  return {
    source: "user",
    filePath: "alpha.ts",
    hunkIndex: 1,
    side: "new",
    line: 12,
    newRange: [12, 12],
    summary: "rename this",
    author: "user",
    editable: true,
    id: "user:1790771476440:0",
    createdAt: "2026-09-30T12:31:16.440Z",
    ...overrides,
  };
}

describe("seedUserNotesFromSidecar", () => {
  test("anchors a legacy note to the file whose runtime id keys it", () => {
    const document = createTestReviewDocument([
      { key: "alpha", path: "alpha.ts" },
      { key: "beta", path: "beta.ts" },
    ]);

    const { notes, unmatched } = seedUserNotesFromSidecar(document, { alpha: [legacyNote()] });

    expect(unmatched).toEqual({});
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      resolution: "active",
      note: {
        id: "user:1790771476440:0",
        source: "user",
        fileKey: "alpha",
        summary: "rename this",
        author: "user",
        createdAt: "2026-09-30T12:31:16.440Z",
        editable: true,
        anchor: {
          newRange: [12, 12],
          preferred: { side: "new", line: 12 },
          ownerHunkIndex: 1,
        },
      },
    });
  });

  test("falls back to the note's file path when its runtime id no longer exists", () => {
    const document = createTestReviewDocument([{ key: "beta", path: "alpha.ts" }]);

    const { notes, unmatched } = seedUserNotesFromSidecar(document, {
      "/wt:3:alpha.ts": [legacyNote()],
    });

    expect(unmatched).toEqual({});
    expect(notes.map(({ note }) => note.fileKey)).toEqual(["beta"]);
  });

  test("keeps notes it cannot seed verbatim instead of dropping them", () => {
    const document = createTestReviewDocument([{ key: "alpha", path: "alpha.ts" }]);
    const gone = legacyNote({ id: "gone", filePath: "deleted.ts" });
    const malformed = { id: "bad", summary: "no anchor" } as unknown as SidecarUserNote;
    const duplicate = legacyNote({ summary: "same id twice" });

    const { notes, unmatched } = seedUserNotesFromSidecar(document, {
      "/wt:0:deleted.ts": [gone],
      alpha: [legacyNote(), malformed, duplicate],
    });

    expect(notes.map(({ note }) => note.id)).toEqual(["user:1790771476440:0"]);
    expect(unmatched).toEqual({ "/wt:0:deleted.ts": [gone], alpha: [malformed, duplicate] });
  });
});

describe("serializeUserNotesSidecar", () => {
  test("round-trips a legacy sidecar unchanged, unmatched entries included", () => {
    const document = createTestReviewDocument([
      { key: "alpha", path: "alpha.ts" },
      { key: "beta", path: "beta.ts" },
    ]);
    const sidecar = {
      alpha: [legacyNote()],
      beta: [
        legacyNote({
          id: "user:2",
          filePath: "beta.ts",
          hunkIndex: 0,
          side: "old",
          line: 2,
          newRange: undefined,
          oldRange: [1, 3],
          updatedAt: "2026-10-01T08:00:00.000Z",
        }),
      ],
      "/wt:7:gone.ts": [legacyNote({ id: "user:3", filePath: "gone.ts" })],
    };
    const cleaned = JSON.parse(JSON.stringify(sidecar));

    const { notes, unmatched } = seedUserNotesFromSidecar(document, cleaned);

    expect(serializeUserNotesSidecar(document.files, notes, unmatched)).toEqual(cleaned);
  });

  test("writes fields in the legacy build's order so the JSON is byte-identical", () => {
    const document = createTestReviewDocument([{ key: "alpha", path: "alpha.ts" }]);
    const edited = legacyNote({ id: "user:2:1", updatedAt: "2026-10-01T08:00:00.000Z" });
    const { notes } = seedUserNotesFromSidecar(document, { alpha: [legacyNote(), edited] });

    const [plain, withEdit] = serializeUserNotesSidecar(document.files, notes, {}).alpha ?? [];

    const legacyOrder = [
      "source",
      "filePath",
      "hunkIndex",
      "side",
      "line",
      "newRange",
      "summary",
      "author",
      "editable",
      "id",
      "createdAt",
    ];
    expect(Object.keys(plain ?? {})).toEqual(legacyOrder);
    expect(Object.keys(withEdit ?? {})).toEqual([...legacyOrder, "updatedAt"]);
  });

  test("round-trips a note's commit revision as its last field", () => {
    const document = createTestReviewDocument([{ key: "alpha", path: "alpha.ts" }]);
    const onCommit = legacyNote({ id: "user:c", side: "old", revision: "c".repeat(40) });
    const sidecar = JSON.parse(JSON.stringify({ alpha: [legacyNote(), onCommit] }));

    const { notes, unmatched, revisions } = seedUserNotesFromSidecar(document, sidecar);
    expect([...revisions]).toEqual([["user:c", "c".repeat(40)]]);

    const written = serializeUserNotesSidecar(document.files, notes, unmatched, (note) =>
      revisions.get(note.id),
    );
    expect(JSON.stringify(written)).toBe(JSON.stringify(sidecar));
    expect(Object.keys(written.alpha?.[1] ?? {}).at(-1)).toBe("revision");
  });
});
