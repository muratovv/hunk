import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { UserNotesSidecar } from "../review/userNotesSidecar";
import {
  readUserNotesSidecar,
  userNotesSidecarWriteWarning,
  writeUserNotesSidecar,
} from "./userNotesSidecarFile";

const SIDECAR: UserNotesSidecar = {
  "/wt:0:alpha.ts": [
    {
      id: "user:1",
      source: "user",
      filePath: "alpha.ts",
      hunkIndex: 0,
      side: "new",
      line: 2,
      newRange: [2, 2],
      summary: "rename this",
      author: "user",
      createdAt: "2026-09-30T12:31:16.440Z",
      editable: true,
    },
  ],
};

describe("user notes sidecar file", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hunk-sidecar-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("writes into missing directories and reads the same map back", () => {
    const path = join(dir, "nested", ".hunk", "notes.json");

    expect(writeUserNotesSidecar(path, SIDECAR)).toBeUndefined();

    expect(readUserNotesSidecar(path)).toEqual(SIDECAR);
    expect(readdirSync(dirname(path))).toEqual(["notes.json"]);
  });

  test("reads a missing or empty sidecar as no notes", () => {
    const path = join(dir, "notes.json");
    expect(readUserNotesSidecar(path)).toEqual({});

    writeFileSync(path, "  \n");
    expect(readUserNotesSidecar(path)).toEqual({});
  });

  test("moves an unparsable sidecar aside before the first write replaces it", () => {
    const path = join(dir, "notes.json");
    writeFileSync(path, "{ not json");

    expect(readUserNotesSidecar(path)).toEqual({});
    expect(readFileSync(path, "utf8")).toBe("{ not json");

    expect(writeUserNotesSidecar(path, SIDECAR)).toBeUndefined();
    expect(readFileSync(`${path}.corrupt`, "utf8")).toBe("{ not json");
    expect(readUserNotesSidecar(path)).toEqual(SIDECAR);
  });

  test("reports an unwritable location instead of throwing", () => {
    const locked = join(dir, "locked");
    mkdirSync(locked, { mode: 0o500 });
    const path = join(locked, ".hunk", "notes.json");

    expect(userNotesSidecarWriteWarning(path)).toContain(path);
    expect(writeUserNotesSidecar(path, SIDECAR)).toContain(path);
    expect(userNotesSidecarWriteWarning(join(dir, ".hunk", "notes.json"))).toBeUndefined();
  });
});
