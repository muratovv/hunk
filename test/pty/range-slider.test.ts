import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
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
});
