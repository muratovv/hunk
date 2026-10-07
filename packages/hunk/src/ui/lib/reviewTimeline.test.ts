import { describe, expect, test } from "bun:test";
import type { CliInput } from "../../core/run/commandInputs";
import {
  hasReviewTimelineRange,
  rescopedReviewInput,
  reviewInputKey,
  reviewTimelineOrigin,
  toExtensionReviewTimeline,
} from "./reviewTimeline";

const options = { vcs: "git" } as CliInput["options"];

/** Build a working-tree diff input against one revision, as wtr launches it. */
function createTestVcsInput(fields: Record<string, unknown>): CliInput {
  return { kind: "vcs", staged: false, options, ...fields } as CliInput;
}

const commit = (revisionId: string, subject: string) => ({
  revisionId,
  displayId: revisionId.slice(0, 7),
  parentRevisionIds: [],
  subject,
  authorName: "Ada",
  authoredAt: "2026-01-01T00:00:00Z",
  decorations: [],
});

describe("review timeline origin", () => {
  test("a single revision against the working tree spans base to the working tree", () => {
    expect(reviewTimelineOrigin(createTestVcsInput({ range: "abc" }), undefined)).toEqual({
      from: "abc",
      workingTree: true,
    });
  });

  test("two endpoints or a comparison descriptor span commit to commit", () => {
    expect(
      reviewTimelineOrigin(
        createTestVcsInput({ rangeEndpoints: { from: "a", to: "b" } }),
        undefined,
      ),
    ).toEqual({ from: "a", to: "b", workingTree: false });
    expect(
      reviewTimelineOrigin(createTestVcsInput({ range: "a..b" }), {
        kind: "comparison",
        provider: "Git",
        title: "2 commits",
        base: "a-sha",
        head: "b-sha",
      }),
    ).toEqual({ from: "a-sha", to: "b-sha", workingTree: false });
  });

  test("offers nothing for staged, unranged, range-expression or non-VCS reviews", () => {
    expect(
      reviewTimelineOrigin(createTestVcsInput({ range: "abc", staged: true }), undefined),
    ).toBeNull();
    expect(reviewTimelineOrigin(createTestVcsInput({}), undefined)).toBeNull();
    expect(reviewTimelineOrigin(createTestVcsInput({ range: "a..b" }), undefined)).toBeNull();
    expect(
      reviewTimelineOrigin({ kind: "patch", file: "x.patch", options } as CliInput, undefined),
    ).toBeNull();
  });
});

describe("review input key", () => {
  test("ignores view options so refresh and watch keep the same identity", () => {
    const input = createTestVcsInput({ range: "abc", pathspecs: ["src"] });
    expect(reviewInputKey({ ...input, options: { ...options, theme: "x" } } as CliInput)).toBe(
      reviewInputKey(input),
    );
    expect(reviewInputKey(createTestVcsInput({ range: "abd" }))).not.toBe(reviewInputKey(input));
  });
});

describe("re-scoped input", () => {
  const origin = createTestVcsInput({ range: "base", pathspecs: ["src"] });

  test("keeps the origin's pathspecs and options while swapping the endpoints", () => {
    expect(rescopedReviewInput(origin, "c1", null)).toMatchObject({
      range: "c1",
      pathspecs: ["src"],
      options,
    });
    const between = rescopedReviewInput(origin, "c1", "c2");
    expect(between).toMatchObject({ rangeEndpoints: { from: "c1", to: "c2" } });
    expect("range" in between && between.range).toBeFalsy();
  });
});

describe("public timeline", () => {
  test("maps provider commits and starts on the full range", () => {
    const timeline = toExtensionReviewTimeline(
      { base: commit("b".repeat(40), "base"), commits: [commit("c".repeat(40), "one")] },
      { from: "base", workingTree: true },
    );
    expect(timeline.base).toMatchObject({ revision: "b".repeat(40), displayRevision: "bbbbbbb" });
    expect(timeline.commits.map((entry) => entry.title)).toEqual(["one"]);
    expect(timeline.current).toEqual({ from: "b".repeat(40), to: null });
  });

  test("a commit-to-commit origin ends on its last commit", () => {
    const timeline = toExtensionReviewTimeline(
      { base: commit("b".repeat(40), "base"), commits: [commit("c".repeat(40), "one")] },
      { from: "base", to: "head", workingTree: false },
    );
    expect(timeline.current).toEqual({ from: "b".repeat(40), to: "c".repeat(40) });
  });
});

describe("timeline visibility", () => {
  const loaded = (commits: number) => ({
    base: commit("b".repeat(40), "base"),
    commits: Array.from({ length: commits }, (_, index) => commit(String(index).repeat(40), "c")),
  });

  test("a branch with only uncommitted work still spans base to the working tree", () => {
    expect(hasReviewTimelineRange(loaded(0), { from: "base", workingTree: true })).toBe(true);
  });

  test("needs two positions: a commit range with no commits has nothing to show", () => {
    expect(hasReviewTimelineRange(loaded(0), { from: "a", to: "a", workingTree: false })).toBe(
      false,
    );
    expect(hasReviewTimelineRange(loaded(1), { from: "a", to: "b", workingTree: false })).toBe(
      true,
    );
    expect(hasReviewTimelineRange(null, { from: "base", workingTree: true })).toBe(false);
  });
});
