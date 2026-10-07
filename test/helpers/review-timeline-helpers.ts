import type { ExtensionReviewTimeline } from "../../packages/hunk/src/extension-api/types";

/**
 * Build a working-tree timeline: base `b…`, then one commit per subject (`1…`, `2…`), full range
 * current. The tree has uncommitted work unless `workingTreeChanged` says otherwise.
 */
export function createTestReviewTimeline(
  subjects: readonly string[] = ["first", "second", "third"],
  { workingTreeChanged = true }: { workingTreeChanged?: boolean } = {},
): ExtensionReviewTimeline {
  const commit = (letter: string, title: string) => ({
    title,
    revision: letter.repeat(40),
    displayRevision: letter.repeat(7),
  });
  const base = commit("b", "fork point");
  return {
    base,
    commits: subjects.map((subject, index) => commit(String(index + 1), subject)),
    workingTree: true,
    workingTreeChanged,
    current: { from: base.revision, to: null },
  };
}
