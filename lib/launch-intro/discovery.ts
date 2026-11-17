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
  expireInactiveLaunchIntroIndex,
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
    // 5xx·네트워크 실패 = 일시 장애: 아무것도 바꾸지 않는다(이전 캐시 유지). 손상 게시본은 서버가 200
    // `unpublished` 로 돌려준다(광고 ② IN-P10) — 아래에서 state-only 로 반영돼 인트로가 꺼진다.
    if (!res.ok) return;
    const live = (await res.json()) as unknown;
    if (!isPayload(live)) return;

    const current = readLaunchIntroIndex();
    // IN-P10: 게시본 손상은 revision 을 올리지 않는다(게시본 행만 손상) — 같은 revision 이어도 state 가 다르면 반영한다.
    if (current && current.revision === live.revision && current.state === live.state) {
      // 진입 감사 IN-6: 바뀐 것이 없어도 보관 기간이 지난 비활성 게시본은 지운다.
      const expired = expireInactiveLaunchIntroIndex(current, Date.now());
      if (expired && promoteLaunchIntroIndex(expired)) {
        const keep = new Set<string>();
        for (const a of getLaunchDestination().snapshot?.publication.assets ?? []) keep.add(a.sha256);
        await collectLaunchIntroAssetGarbage(keep);
        console.info(`[dibay-launch-intro] expired_inactive revision=${current.revision}`);
      }
      return;
    }
    const nowIso = new Date().toISOString();
    // 진입 감사 IN-6: active 가 아니게 된 시각(처음 한 번만 기록) — 보관 기간 계산 기준
    const inactiveSince = live.state === "active" ? undefined : (current?.state !== "active" && current?.inactiveSince) || nowIso;

    let next: LaunchIntroIndex;
    if (!live.publication) {
      // UNPUBLISHED: state-only promotion, publication kept (contract §7).
      next = {
        schema: 1,
        revision: live.revision,
        state: live.state,
        publication: current?.publication ?? null,
        promotedAt: nowIso,
        inactiveSince,
      };
    } else if (current?.publication?.id === live.publication.id) {
      // Same publication (pause / resume / reactivate of the cached one): state-only, no download.
      next = { ...current, schema: 1, revision: live.revision, state: live.state, promotedAt: nowIso, inactiveSince };
    } else {
      // New publication: acquire + verify everything before the atomic promotion.
      const ok = await acquireLaunchIntroAssets(live.publication.assets);
      if (!ok) {
        // 진입 감사 IN-6: 받다 만 파일은 남기지 않는다 — 지금 색인·이번 실행이 쓰는 것만 남기고 정리
        const keep = new Set<string>((current?.publication?.assets ?? []).map((a) => a.sha256));
        for (const a of getLaunchDestination().snapshot?.publication.assets ?? []) keep.add(a.sha256);
        await collectLaunchIntroAssetGarbage(keep);
        return;
      }
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
        promotedAt: nowIso,
        inactiveSince,
      };
    }
    // 진입 감사 IN-6: 비활성으로 보관 기간이 이미 지났으면 바로 비운다
    next = expireInactiveLaunchIntroIndex(next, Date.now()) ?? next;
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
