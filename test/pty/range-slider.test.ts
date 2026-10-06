import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPtyHarness } from "./harness";

const harness = createPtyHarness();

/** Give PTY-backed startup, provider history reads, and reloads enough headroom. */
setDefaultTimeout(30_000);

afterEach(() => {
  harness.cleanup();
});

describe("PTY commit-range slider", () => {
  test("moving the handles re-scopes the diff and refresh keeps the range", async () => {
    const fixture = harness.createCommitTimelineRepoFixture();
    const session = await harness.launchHunk({
      args: ["diff", fixture.base, "--mode", "unified", "--sidebar"],
      cwd: fixture.dir,
      cols: 140,
      rows: 34,
    });

    try {
      const initial = await harness.waitForSnapshot(
        session,
        (text) => text.includes("4 steps") && text.includes("untracked-wip.txt"),
        15_000,
      );
      expect(initial).toContain("added-in-c1.txt");

      // `C` enters the range mode; `l` steps `from` past the commit that added the file.
      session.writeRaw("C");
      session.writeRaw("l");
      const afterFrom = await harness.waitForSnapshot(
        session,
        (text) => text.includes("3 steps") && !text.includes("added-in-c1.txt"),
        10_000,
      );
      expect(afterFrom).toContain("untracked-wip.txt");

      // `tab` + `h` pulls `to` back from the working tree onto c3, dropping the untracked file.
      session.writeRaw("\t");
      session.writeRaw("h");
      const afterTo = await harness.waitForSnapshot(
        session,
        (text) => text.includes("2 steps") && !text.includes("untracked-wip.txt"),
        10_000,
      );
      expect(afterTo).toContain("added-in-c3.txt");

      session.writeRaw("\x1b");
      await harness.waitForSnapshot(session, (text) => !text.includes("Edit range"), 5_000);
      session.writeRaw("r");
      const refreshed = await harness.waitForSnapshot(
        session,
        (text) => text.includes("2 steps") && text.includes("added-in-c3.txt"),
        10_000,
      );
      expect(refreshed).not.toContain("untracked-wip.txt");
      expect(refreshed).not.toContain("added-in-c1.txt");
    } finally {
      session.close();
    }
  });

  test("notes stay put across ranges and a note on a commit names it", async () => {
    const fixture = harness.createCommitTimelineRepoFixture();
    const sidecarPath = join(fixture.dir, ".hunk", "notes.json");
    mkdirSync(join(fixture.dir, ".hunk"), { recursive: true });
    writeFileSync(join(fixture.dir, ".hunk", ".gitignore"), "*\n");
    const seededNote = {
      source: "user",
      filePath: "added-in-c3.txt",
      hunkIndex: 0,
      side: "new",
      line: 2,
      newRange: [2, 2],
      summary: "NOTE-WIP",
      author: "user",
      editable: true,
      id: "user:wip",
      createdAt: "2026-10-06T10:00:00.000Z",
    };
    writeFileSync(sidecarPath, JSON.stringify({ seeded: [seededNote] }));
    /** Read every stored note, keyed by summary. */
    const readNotes = () =>
      new Map(
        Object.values(JSON.parse(readFileSync(sidecarPath, "utf8")) as Record<string, any[]>)
          .flat()
          .map((note) => [note.summary, note]),
      );
    const session = await harness.launchHunk({
      args: ["diff", fixture.base, "--mode", "unified", "--sidebar", "--store-notes", sidecarPath],
      cwd: fixture.dir,
      cols: 140,
      rows: 34,
    });

    try {
      await harness.waitForSnapshot(
        session,
        (text) => text.includes("4 steps") && text.includes("NOTE-WIP"),
        15_000,
      );

      // to → c3: the working-tree note's content leaves the screen.
      session.writeRaw("C");
      session.writeRaw("\t");
      session.writeRaw("h");
      await harness.waitForSnapshot(
        session,
        (text) => text.includes("3 steps") && !text.includes("NOTE-WIP"),
        10_000,
      );
      session.writeRaw("\x1b");
      await harness.waitForSnapshot(session, (text) => !text.includes("Edit range"), 5_000);

      // A note written while c3 is the new side names c3.
      session.writeRaw("c");
      await harness.waitForSnapshot(session, (text) => text.includes("Draft note"), 5_000);
      session.writeRaw("NOTE-C3");
      session.writeRaw("\x13");
      await harness.waitForSnapshot(session, (text) => text.includes("NOTE-C3"), 5_000);

      // Back to the full range: the working-tree note returns, the commit note hides.
      session.writeRaw("C");
      session.writeRaw("l");
      await harness.waitForSnapshot(
        session,
        (text) =>
          text.includes("4 steps") && text.includes("NOTE-WIP") && !text.includes("NOTE-C3"),
        10_000,
      );

      const notes = readNotes();
      const { revision: _none, ...wipOnDisk } = notes.get("NOTE-WIP") ?? {};
      expect(wipOnDisk).toEqual(seededNote);
      expect(notes.get("NOTE-WIP")?.revision).toBeUndefined();
      const c3 = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: fixture.dir }).stdout;
      expect(notes.get("NOTE-C3")?.revision).toBe(c3.toString().trim());
    } finally {
      session.close();
    }
  });
});
