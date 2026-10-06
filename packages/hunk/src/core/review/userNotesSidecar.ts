/**
 * The `--store-notes` sidecar: reviewer notes mirrored to disk in the legacy
 * `Record<runtimeFileId, SidecarUserNote[]>` shape that external readers consume.
 */
import { resolveReviewNoteAnchor } from "./anchors";
import { reviewNoteAnchorLine, reviewNoteOwnerHunkIndex, type ReviewStoredNote } from "./state";
import type { ReviewDocumentV1, ReviewFileV1, ReviewLineRange, ReviewSide } from "./types";

export interface SidecarUserNote {
  id: string;
  parentId?: string;
  source: "user";
  filePath: string;
  hunkIndex: number;
  side: ReviewSide;
  line: number;
  oldRange?: [number, number];
  newRange?: [number, number];
  summary: string;
  author: string;
  createdAt: string;
  updatedAt?: string;
  editable: true;
  /** Commit whose content the note's side shows; absent means the working tree. */
  revision?: string;
}

export type UserNotesSidecar = Record<string, SidecarUserNote[]>;

export interface SeededUserNotes {
  notes: ReviewStoredNote[];
  /** Entries no current file claims, kept verbatim so a later write never drops them. */
  unmatched: UserNotesSidecar;
  /** Commit revision of each seeded note that names one, by note id. */
  revisions: Map<string, string>;
}

function isLineRange(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((line) => Number.isInteger(line) && line > 0)
  );
}

/** Whether one parsed entry carries every fact needed to anchor it as a note. */
function isSeedableSidecarNote(entry: unknown): entry is SidecarUserNote {
  if (typeof entry !== "object" || entry === null) {
    return false;
  }
  const note = entry as Record<string, unknown>;
  return (
    typeof note.id === "string" &&
    typeof note.summary === "string" &&
    typeof note.filePath === "string" &&
    (note.side === "old" || note.side === "new") &&
    Number.isInteger(note.line) &&
    (note.line as number) > 0 &&
    Number.isInteger(note.hunkIndex) &&
    (note.oldRange === undefined || isLineRange(note.oldRange)) &&
    (note.newRange === undefined || isLineRange(note.newRange)) &&
    (note.parentId === undefined || typeof note.parentId === "string") &&
    (note.revision === undefined || typeof note.revision === "string")
  );
}

function findSidecarFile(
  document: ReviewDocumentV1,
  runtimeId: string,
  note: SidecarUserNote,
): ReviewFileV1 | undefined {
  return (
    document.files.find((file) => file.runtimeId === runtimeId) ??
    document.files.find((file) => file.path === note.filePath)
  );
}

function toStoredNote(file: ReviewFileV1, entry: SidecarUserNote): ReviewStoredNote {
  const single = [entry.line, entry.line] as ReviewLineRange;
  const hasRange = entry.oldRange !== undefined || entry.newRange !== undefined;
  const oldRange = hasRange ? entry.oldRange : entry.side === "old" ? single : undefined;
  const newRange = hasRange ? entry.newRange : entry.side === "new" ? single : undefined;
  return {
    note: {
      id: entry.id,
      ...(entry.parentId ? { parentId: entry.parentId } : {}),
      source: "user",
      originalSource: "user",
      fileKey: file.key,
      anchor: resolveReviewNoteAnchor(file.hunks, {
        ...(oldRange ? { oldRange } : {}),
        ...(newRange ? { newRange } : {}),
        preferred: { side: entry.side, line: entry.line },
        fallbackOwnerHunkIndex: entry.hunkIndex,
      }),
      summary: entry.summary,
      author: typeof entry.author === "string" ? entry.author : "user",
      ...(typeof entry.createdAt === "string" ? { createdAt: entry.createdAt } : {}),
      ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
      editable: true,
    },
    resolution: "active",
  };
}

/** Turn a sidecar into stored user notes for this document, preserving what does not fit. */
export function seedUserNotesFromSidecar(
  document: ReviewDocumentV1,
  sidecar: UserNotesSidecar,
): SeededUserNotes {
  const notes: ReviewStoredNote[] = [];
  const unmatched: UserNotesSidecar = {};
  const revisions = new Map<string, string>();
  const seededIds = new Set<string>();
  for (const [runtimeId, entries] of Object.entries(sidecar)) {
    for (const entry of entries) {
      const file = isSeedableSidecarNote(entry)
        ? findSidecarFile(document, runtimeId, entry)
        : undefined;
      if (file && !seededIds.has(entry.id)) {
        seededIds.add(entry.id);
        notes.push(toStoredNote(file, entry));
        if (entry.revision) revisions.set(entry.id, entry.revision);
      } else {
        (unmatched[runtimeId] ??= []).push(entry);
      }
    }
  }
  return { notes, unmatched, revisions };
}

export type SidecarFileAddress = Pick<ReviewFileV1, "key" | "runtimeId" | "path">;

/**
 * Render stored user notes back into the sidecar shape, keyed by runtime file id.
 *
 * `files` must cover every file a note was ever anchored to, not just the current
 * document, so a note whose file left the diff on reload still has an address.
 */
export function serializeUserNotesSidecar(
  files: readonly SidecarFileAddress[],
  notes: readonly ReviewStoredNote[],
  unmatched: UserNotesSidecar,
  revisionOf: (note: ReviewStoredNote["note"]) => string | undefined = () => undefined,
): UserNotesSidecar {
  const byKey = new Map(files.map((file) => [file.key, file]));
  const sidecar: UserNotesSidecar = {};
  for (const { note } of notes) {
    const file = byKey.get(note.fileKey);
    if (!file) {
      throw new Error(`No file address is known for review note ${note.id}.`);
    }
    const { side, line } = reviewNoteAnchorLine(note);
    const revision = revisionOf(note);
    // Key order mirrors the fork-main writer so both builds emit identical JSON.
    (sidecar[file.runtimeId] ??= []).push({
      source: "user",
      filePath: file.path,
      hunkIndex: reviewNoteOwnerHunkIndex(note),
      side,
      line,
      ...(note.anchor.oldRange ? { oldRange: [...note.anchor.oldRange] } : {}),
      ...(note.anchor.newRange ? { newRange: [...note.anchor.newRange] } : {}),
      summary: note.summary,
      author: note.author ?? "user",
      editable: true,
      id: note.id,
      ...(note.parentId ? { parentId: note.parentId } : {}),
      createdAt: note.createdAt ?? "",
      ...(note.updatedAt ? { updatedAt: note.updatedAt } : {}),
      ...(revision ? { revision } : {}),
    } as SidecarUserNote);
  }
  for (const [runtimeId, entries] of Object.entries(unmatched)) {
    (sidecar[runtimeId] ??= []).push(...entries);
  }
  return sidecar;
}
