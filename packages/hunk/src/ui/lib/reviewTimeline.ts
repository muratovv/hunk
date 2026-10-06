/**
 * Derives the commit-range timeline facts the files pane slides along.
 *
 * The origin is the launch input's own range: one revision against the working tree (wtr's
 * `diff <merge-base>`) or two commits. Re-scoping rebuilds the input from the origin, never from the
 * current sub-range, so pathspecs and view options survive and returning to the full range restores
 * the origin input exactly.
 */
import type {
  ExtensionComparisonCommitDescriptor,
  ExtensionReviewDescriptor,
  ExtensionReviewTimeline,
  ExtensionVcsHistoryCommit,
  ExtensionVcsTimeline,
} from "../../extension-api/types";
import type { CliInput } from "../../core/run/commandInputs";

/** Where a review's timeline starts and ends; `to` is omitted for the working copy's commit. */
export interface ReviewTimelineOrigin {
  from: string;
  to?: string;
  workingTree: boolean;
}

/** Most commits a slider offers; longer lines hide it rather than crowd one terminal row. */
export const REVIEW_TIMELINE_MAX_COMMITS = 500;

/** Resolve the timeline origin of one launch input, or null when there is nothing to slide. */
export function reviewTimelineOrigin(
  input: CliInput,
  review: ExtensionReviewDescriptor | undefined,
): ReviewTimelineOrigin | null {
  if (input.kind !== "vcs" || input.staged) return null;
  if (review?.kind === "comparison") {
    return { from: review.base, to: review.head, workingTree: false };
  }
  if (input.rangeEndpoints) {
    return { from: input.rangeEndpoints.from, to: input.rangeEndpoints.to, workingTree: false };
  }
  // A range expression without a provider-resolved comparison has no endpoints the host may parse.
  if (!input.range || input.range.includes("..")) return null;
  return { from: input.range, workingTree: true };
}

/** Identify which diff an input asks for, ignoring view options that refresh and watch rewrite. */
export function reviewInputKey(input: CliInput): string {
  if (input.kind !== "vcs") return JSON.stringify({ kind: input.kind });
  return JSON.stringify({
    kind: input.kind,
    vcs: input.options.vcs ?? null,
    range: input.range ?? null,
    rangeEndpoints: input.rangeEndpoints ?? null,
    staged: input.staged,
    pathspecs: input.pathspecs ?? [],
  });
}

/** Build the input that shows `from..to` (`to: null` = working tree) from the origin input. */
export function rescopedReviewInput(origin: CliInput, from: string, to: string | null): CliInput {
  if (origin.kind !== "vcs") return origin;
  const { range: _range, rangeEndpoints: _endpoints, ...rest } = origin;
  return to === null
    ? ({ ...rest, range: from } as CliInput)
    : ({ ...rest, rangeEndpoints: { from, to } } as CliInput);
}

/** Map one provider commit to the public compact commit shape. */
function toTimelineCommit(commit: ExtensionVcsHistoryCommit): ExtensionComparisonCommitDescriptor {
  return {
    title: commit.subject,
    author: commit.authorName,
    authoredAt: commit.authoredAt,
    revision: commit.revisionId,
    displayRevision: commit.displayId,
  };
}

/** Build the public timeline, positioned on the origin's full range. */
export function toExtensionReviewTimeline(
  loaded: ExtensionVcsTimeline,
  origin: ReviewTimelineOrigin,
): ExtensionReviewTimeline {
  const base = toTimelineCommit(loaded.base);
  const commits = loaded.commits.map(toTimelineCommit);
  return {
    base,
    commits,
    workingTree: origin.workingTree,
    current: {
      from: base.revision,
      to: origin.workingTree ? null : (commits.at(-1)?.revision ?? base.revision),
    },
  };
}
