import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createPtyHarness } from "./harness";

const harness = createPtyHarness();

/** Give PTY-backed startup and redraws enough headroom for slower CI machines. */
setDefaultTimeout(20_000);

afterEach(() => {
  harness.cleanup();
});

// Raw UTF-8 bytes, not `session.press` (ASCII only), so the real parser decodes the Cyrillic glyph.
describe("PTY Russian-layout shortcuts", () => {
  test("ъ (physical ]) jumps to the next hunk", async () => {
    const fixture = harness.createMultiHunkFilePair();
    const session = await harness.launchHunk({
      args: ["diff", "--files", fixture.before, fixture.after, "--mode", "split"],
      cols: 104,
      rows: 12,
    });

    try {
      const initial = await session.waitForText(/View\s+Navigate\s+Agent\s+Help/, {
        timeout: 15_000,
      });
      expect(initial).toContain("line1 = 100");
      expect(initial).not.toContain("line60 = 6000");

      session.writeRaw("ъ");
      const secondHunk = await harness.waitForSnapshot(
        session,
        (text) => text.includes("line60 = 6000") && !text.includes("line1 = 100"),
        5_000,
      );

      expect(secondHunk).toContain("line60 = 6000");
    } finally {
      session.close();
    }
  });

  test("ю (physical .) jumps to the next file", async () => {
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

  test("Cyrillic typed into the focused filter stays literal", async () => {
    const fixture = harness.createTwoFileRepoFixture();
    const session = await harness.launchHunk({
      args: ["diff", "--mode", "split"],
      cwd: fixture.dir,
      cols: 220,
      rows: 24,
    });

    try {
      await session.waitForText(/View\s+Navigate\s+Agent\s+Help/, { timeout: 15_000 });
      await harness.pressAndWaitForSnapshot(
        session,
        "tab",
        (text) => text.includes("filter: type to filter files"),
        5_000,
      );

      // й is physical q: normalized it would quit; literal it is filter text.
      session.writeRaw("йц");
      const typed = await harness.waitForSnapshot(
        session,
        (text) => text.includes("filter: йц"),
        5_000,
      );

      expect(typed).toContain("filter: йц");
    } finally {
      session.close();
    }
  });

  test("о (physical j) moving an open menu is not also typed into the focused filter", async () => {
    const fixture = harness.createTwoFileRepoFixture();
    const session = await harness.launchHunk({
      args: ["diff", "--mode", "split"],
      cwd: fixture.dir,
      cols: 220,
      rows: 24,
    });

    try {
      await session.waitForText(/View\s+Navigate\s+Agent\s+Help/, { timeout: 15_000 });
      await harness.pressAndWaitForSnapshot(
        session,
        "tab",
        (text) => text.includes("filter: type to filter files"),
        5_000,
      );
      await harness.pressAndWaitForText(session, "f10", /Reload/, { timeout: 5_000 });

      // The menu owns the key and consumes it; the raw event must not then reach the filter.
      session.writeRaw("о");
      await harness.pressAndWaitForSnapshot(
        session,
        "escape",
        (text) => !text.includes("Reload"),
        5_000,
      );
      await session.type("x");
      const filter = await harness.waitForSnapshot(
        session,
        (text) => /filter: \S*x/.test(text),
        5_000,
      );

      expect(filter).toContain("filter: x");
    } finally {
      session.close();
    }
  });

  test("с (physical c) opens an empty draft that takes Cyrillic literally", async () => {
    const fixture = harness.createLongWrapFilePair();
    const session = await harness.launchHunk({
      args: ["diff", "--files", fixture.before, fixture.after, "--mode", "split"],
      cols: 120,
      rows: 20,
    });

    try {
      await session.waitForText(/View\s+Navigate\s+Agent\s+Help/, { timeout: 15_000 });

      session.writeRaw("с");
      const freshDraft = await session.waitForText(/Draft note/, { timeout: 5_000 });
      expect(freshDraft).toContain("Write a note");

      session.writeRaw("привет");
      const typed = await session.waitForText(/привет/, { timeout: 5_000 });

      expect(typed).toContain("привет");
    } finally {
      session.close();
    }
  });
});
