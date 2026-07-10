import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createPtyHarness } from "./harness";

const harness = createPtyHarness();

/** Give PTY-backed startup and redraws enough headroom for slower CI machines. */
setDefaultTimeout(20_000);

afterEach(() => {
  harness.cleanup();
});

/**
 * Prove non-Latin layout shortcuts work through the real terminal input path:
 * the parser decodes the raw UTF-8 Cyrillic bytes into `name`/`sequence`, and
 * the dispatch choke-point normalizes them back to their physical US-QWERTY key
 * before matching. Feeding raw bytes (not `session.press`, which only emits
 * ASCII) is what exercises the layout-normalization end to end.
 */
describe("PTY keyboard layout normalization (Russian ЙЦУКЕН)", () => {
  test("Cyrillic ъ triggers ] hunk navigation", async () => {
    const fixture = harness.createMultiHunkFilePair();
    const session = await harness.launchHunk({
      args: ["diff", fixture.before, fixture.after, "--mode", "split"],
      cols: 104,
      rows: 12,
    });

    try {
      const initial = await session.waitForText(/View\s+Navigate\s+Agent\s+Help/, {
        timeout: 15_000,
      });
      expect(initial).toContain("line1 = 100");
      expect(initial).not.toContain("line60 = 6000");

      // Physical `]` on a Russian layout delivers `ъ`.
      session.writeRaw("ъ");
      const secondHunk = await harness.waitForSnapshot(
        session,
        (text) => text.includes("line60 = 6000"),
        5_000,
      );

      expect(secondHunk).toContain("line60 = 6000");
      expect(secondHunk).not.toContain("line1 = 100");
    } finally {
      session.close();
    }
  });

  test("Cyrillic typed into the focused filter stays literal (not normalized)", async () => {
    const fixture = harness.createSidebarJumpRepoFixture();
    const session = await harness.launchHunk({
      args: ["diff", "--mode", "split"],
      cwd: fixture.dir,
      cols: 220,
      rows: 12,
    });

    try {
      await session.waitForText(/View\s+Navigate\s+Agent\s+Help/, { timeout: 15_000 });

      // Open the filter, then feed a raw Cyrillic byte. Normalization must NOT
      // reach text entry: the input has to receive literal `й`, not `q`.
      await session.press("/");
      await harness.waitForSnapshot(session, (t) => t.includes("type to filter files"), 5_000);

      session.writeRaw("й");
      const typed = await harness.waitForSnapshot(session, (t) => t.includes("й"), 5_000);

      expect(typed).toContain("й");
    } finally {
      session.close();
    }
  });

  test("Cyrillic ю triggers . file navigation", async () => {
    const fixture = harness.createAgentNavigationRepoFixture();
    const session = await harness.launchHunk({
      args: ["diff", "--mode", "split", "--agent-context", fixture.agentContext, "--agent-notes"],
      cwd: fixture.dir,
      cols: 160,
      rows: 14,
    });

    try {
      const initial = await session.waitForText(/View\s+Navigate\s+Agent\s+Help/, {
        timeout: 15_000,
      });
      expect(initial).not.toContain("line101 = 10100");

      // Physical `.` on a Russian layout delivers `ю`.
      session.writeRaw("ю");
      const laterFile = await harness.waitForSnapshot(
        session,
        (text) => text.includes("line101 = 10100"),
        5_000,
      );

      expect(laterFile).toContain("line101 = 10100");
    } finally {
      session.close();
    }
  });
});
