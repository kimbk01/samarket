/**
 * DIBAY Intro — PUBLICATION DISCOVERY → ACQUISITION → CACHE PROMOTION (contract §4, §6, §7).
 *
 * Runs only off the startup path: after the OS release (this launch) and when the app returns to
 * the foreground. No polling timer. Native app only (requires a launch epoch).
 * The live manifest is fetched with no-store; the current launch snapshot is never changed here.
 */
import type { LaunchIntroLivePayload } from "@/lib/launch-intro/document";
import {
  acquireLaunchIntroAssets,
  collectLaunchIntroAssetGarbage,
  promoteLaunchIntroIndex,
  readLaunchIntroIndex,
  type LaunchIntroIndex,
} from "@/lib/launch-intro/cache";
import { LAUNCH_INTRO_DOCUMENT_ID, readLaunchEpoch } from "@/lib/launch-intro/launch-epoch";
import { onLaunchOsReleased } from "@/lib/launch-intro/os-release-owner";
import { getLaunchDestination } from "@/lib/launch-intro/startup-destination";

let started = false;
let inflight = false;

function platformTag(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return "other";
}

function isPayload(v: unknown): v is LaunchIntroLivePayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.ok === true &&
    typeof o.revision === "number" &&
    (o.state === "active" || o.state === "paused" || o.state === "unpublished")
  );
}

export async function runLaunchIntroDiscovery(reason: "launch" | "resume"): Promise<void> {
  const epoch = readLaunchEpoch();
  if (!epoch || inflight) return;
  inflight = true;
  try {
    const res = await fetch("/api/launch-intro/live", {
      cache: "no-store",
      headers: {
        "x-dibay-launch-epoch": epoch,
        "x-dibay-launch-doc": LAUNCH_INTRO_DOCUMENT_ID,
        "x-dibay-discovery-reason": reason,
        "x-dibay-platform": platformTag(),
      },
    });
    if (!res.ok) return;
    const live = (await res.json()) as unknown;
    if (!isPayload(live)) return;

    const current = readLaunchIntroIndex();
    if (current && current.revision === live.revision) return;

    let next: LaunchIntroIndex;
    if (!live.publication) {
      // UNPUBLISHED: state-only promotion, publication kept (contract §7).
      next = {
        schema: 1,
        revision: live.revision,
        state: live.state,
        publication: current?.publication ?? null,
        promotedAt: new Date().toISOString(),
      };
    } else if (current?.publication?.id === live.publication.id) {
      // Same publication (pause / resume / reactivate of the cached one): state-only, no download.
      next = { ...current, schema: 1, revision: live.revision, state: live.state, promotedAt: new Date().toISOString() };
    } else {
      // New publication: acquire + verify everything before the atomic promotion.
      const ok = await acquireLaunchIntroAssets(live.publication.assets);
      if (!ok) return;
      next = {
        schema: 1,
        revision: live.revision,
        state: live.state,
        publication: {
          id: live.publication.id,
          document: live.publication.document,
          assets: live.publication.assets.map(({ sha256, mime, bytes, path }) => ({ sha256, mime, bytes, path })),
          eligibility: live.publication.eligibility,
        },
        promotedAt: new Date().toISOString(),
      };
    }
    if (!promoteLaunchIntroIndex(next)) return;
    console.info(
      `[dibay-launch-intro] promoted revision=${next.revision} state=${next.state} publication=${next.publication?.id ?? "none"}`
    );

    const keep = new Set<string>((next.publication?.assets ?? []).map((a) => a.sha256));
    for (const a of getLaunchDestination().snapshot?.publication.assets ?? []) keep.add(a.sha256);
    await collectLaunchIntroAssetGarbage(keep);
  } catch {
    /* network / storage failure: nothing changes, previous cache kept */
  } finally {
    inflight = false;
  }
}

/** Idempotent. After the OS release → discovery; on every return to foreground → discovery. */
export function startLaunchIntroDiscovery(): void {
  if (started || typeof window === "undefined") return;
  if (!readLaunchEpoch()) return;
  started = true;
  onLaunchOsReleased(() => {
    void runLaunchIntroDiscovery("launch");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void runLaunchIntroDiscovery("resume");
  });
}
