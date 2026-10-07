/**
 * Owns the files pane's commit-range timeline across reloads and performs re-scoping.
 *
 * A launch, or any reload that asks for a different diff (`hunk session reload`), becomes the new
 * origin and loads its commit line from the VCS provider in the background. Re-scopes this hook
 * requested keep the origin and only move `current`; they, refresh, and watch re-read the line in
 * the background so new commits and uncommitted work show up without moving `current`. Re-scoping
 * reloads through the host queue with the mounted App kept, so it serializes with every other
 * reload.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ExtensionReviewReloadResult,
  ExtensionReviewTimeline,
} from "../../extension-api/types";
import type { AppBootstrap } from "../../core/bootstrap";
import type { CliInput } from "../../core/run/commandInputs";
import { getVcsAdapter, loadVcsTimeline } from "../../core/vcs";
import type { VcsAdapter } from "../../core/vcs/types";
import {
  hasReviewTimelineRange,
  REVIEW_TIMELINE_MAX_COMMITS,
  rescopedReviewInput,
  reviewInputKey,
  reviewTimelineOrigin,
  toExtensionReviewTimeline,
} from "../lib/reviewTimeline";

type Range = ExtensionReviewTimeline["current"];

/** The slice of host reload options a re-scope sets; the host's own type lives in the session tier. */
interface RescopeReloadOptions {
  resetApp: false;
  reason: "extension";
}

/** Position of a revision on the timeline, with the working tree after the last commit. */
function timelinePosition(timeline: ExtensionReviewTimeline, revision: string | null) {
  if (revision === null) return timeline.workingTree ? timeline.commits.length + 1 : -1;
  if (revision === timeline.base.revision) return 0;
  const index = timeline.commits.findIndex((commit) => commit.revision === revision);
  return index < 0 ? -1 : index + 1;
}

/** Report whether two loads describe the same line, so a re-read can keep the current object. */
function sameTimelineLine(left: ExtensionReviewTimeline, right: ExtensionReviewTimeline) {
  return (
    left.base.revision === right.base.revision &&
    left.workingTreeChanged === right.workingTreeChanged &&
    left.commits.length === right.commits.length &&
    left.commits.every((commit, index) => commit.revision === right.commits[index]?.revision)
  );
}

/** Where the current origin's line comes from. */
interface TimelineSource {
  input: Extract<CliInput, { kind: "vcs" }>;
  origin: ReturnType<typeof reviewTimelineOrigin> & object;
  adapter: VcsAdapter;
  cwd: string;
}

/** Track one review's timeline and expose a guarded re-scope action. */
export function useReviewTimeline({
  bootstrap,
  onReloadSession,
  onError,
}: {
  bootstrap: AppBootstrap;
  onReloadSession: (nextInput: CliInput, options: RescopeReloadOptions) => Promise<unknown>;
  onError: (message: string) => void;
}) {
  const [timeline, setTimeline] = useState<ExtensionReviewTimeline | null>(null);
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const sourceRef = useRef<TimelineSource | null>(null);
  const appliedKeyRef = useRef<string | null>(null);
  const requestedRef = useRef(new Map<string, Range>());
  const loadRef = useRef<AbortController | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => () => loadRef.current?.abort(), []);

  /** Read the origin's line; on a re-read keep `current`, since the screen did not move. */
  const loadLine = useCallback((keepCurrent: boolean) => {
    const source = sourceRef.current;
    if (!source) return;
    loadRef.current?.abort();
    const controller = new AbortController();
    loadRef.current = controller;
    loadVcsTimeline(
      source.adapter,
      {
        from: source.origin.from,
        to: source.origin.to,
        maxCount: REVIEW_TIMELINE_MAX_COMMITS,
        excludeUntracked: source.input.options.excludeUntracked === true,
      },
      { cwd: source.cwd, signal: controller.signal },
    )
      .then((loaded) => {
        if (controller.signal.aborted || sourceRef.current !== source) return;
        if (!hasReviewTimelineRange(loaded, source.origin)) {
          setTimeline(null);
          return;
        }
        const next = toExtensionReviewTimeline(loaded, source.origin);
        setTimeline((current) => {
          if (!keepCurrent || !current) return next;
          return sameTimelineLine(current, next) ? current : { ...next, current: current.current };
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        onErrorRef.current(`Commit range unavailable: ${String(error)}`);
      });
  }, []);

  useEffect(() => {
    const key = reviewInputKey(bootstrap.input);
    if (key === appliedKeyRef.current) {
      loadLine(true);
      return;
    }
    appliedKeyRef.current = key;

    const requested = requestedRef.current.get(key);
    if (requested) {
      requestedRef.current.delete(key);
      setTimeline((current) => current && { ...current, current: requested });
      loadLine(true);
      return;
    }

    loadRef.current?.abort();
    loadRef.current = null;
    setTimeline(null);
    sourceRef.current = null;
    const origin = reviewTimelineOrigin(bootstrap.input, bootstrap.review);
    const catalog = bootstrap.reloadContext.vcsCatalog;
    if (!origin || !catalog || bootstrap.input.kind !== "vcs") return;
    sourceRef.current = {
      input: bootstrap.input,
      origin,
      adapter: getVcsAdapter(bootstrap.input.options.vcs ?? "git", catalog),
      cwd: bootstrap.reloadContext.cwd,
    };
    loadLine(false);
  }, [bootstrap, loadLine]);

  const rescopeReview = useCallback(
    async (from: string, to: string | null): Promise<ExtensionReviewReloadResult> => {
      const current = timelineRef.current;
      const origin = sourceRef.current?.input;
      if (!current || !origin) {
        return { ok: false, reason: "unavailable", detail: "This review has no commit range." };
      }
      const fromPosition = timelinePosition(current, from);
      const toPosition = timelinePosition(current, to);
      if (fromPosition < 0 || toPosition < 0 || fromPosition >= toPosition) {
        return { ok: false, reason: "unavailable", detail: "That range is not on this timeline." };
      }

      const lastPosition = current.workingTree
        ? current.commits.length + 1
        : current.commits.length;
      const nextInput =
        fromPosition === 0 && toPosition === lastPosition
          ? origin
          : rescopedReviewInput(origin, from, to);
      const key = reviewInputKey(nextInput);
      if (key === appliedKeyRef.current) return { ok: true };

      requestedRef.current.set(key, { from, to });
      try {
        await onReloadSession(nextInput, { resetApp: false, reason: "extension" });
        return { ok: true };
      } catch (error) {
        requestedRef.current.delete(key);
        return { ok: false, reason: "failed", detail: String(error) };
      }
    },
    [onReloadSession],
  );

  return { timeline, rescopeReview };
}
