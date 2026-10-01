/**
 * DIBAY Intro — Admin lifecycle view (expansion P4). Pure: no fetching, no DB writes.
 *
 * The authority is the DB function `launch_intro_set_state` (single Live pointer). This module only
 * mirrors its transition rules so Admin enables exactly the buttons the DB will accept, and derives
 * the status board (Live state × Draft state). The contract test checks the mirror against the SQL.
 */
import type { LaunchIntroLiveState } from "@/lib/launch-intro/document";

export type LaunchIntroLifecycleAction = "pause" | "resume" | "unpublish" | "reactivate";

export type LaunchIntroLiveView = { state: LaunchIntroLiveState; publication_id: string | null };

/** Same rules as launch_intro_set_state: pause ← active · resume ← paused · unpublish ← not unpublished. */
export function launchIntroCanTransition(live: LaunchIntroLiveView, action: Exclude<LaunchIntroLifecycleAction, "reactivate">): boolean {
  if (action === "pause") return live.state === "active";
  if (action === "resume") return live.state === "paused";
  return live.state !== "unpublished";
}

/**
 * Reactivate = point Live at an existing publication and make it active. Offered for every
 * publication except the one Live already points at (that one uses Pause / Resume).
 */
export function launchIntroCanReactivate(live: LaunchIntroLiveView, publicationId: string): boolean {
  return publicationId !== live.publication_id;
}

/** Draft relative to what devices get. */
export type LaunchIntroDraftStatus =
  | "none" // no draft row
  | "unsaved" // local edits not saved yet
  | "published" // saved draft = the Live publication's source version
  | "changed" // saved, but differs from the Live publication
  | "not_live"; // saved, and devices have no Intro right now (unpublished)

export function launchIntroDraftStatus(input: {
  draft: { id: string; version: number } | null;
  dirty: boolean;
  livePublication: { source_draft_id: string | null; source_draft_version: number | null } | null;
}): LaunchIntroDraftStatus {
  if (!input.draft) return "none";
  if (input.dirty) return "unsaved";
  const p = input.livePublication;
  if (!p) return "not_live";
  if (p.source_draft_id === input.draft.id && p.source_draft_version === input.draft.version) return "published";
  return "changed";
}
