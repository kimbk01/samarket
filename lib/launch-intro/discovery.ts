/**
 * DIBAY Intro — PUBLICATION DISCOVERY → ACQUISITION → CACHE PROMOTION (contract §4, §6, §7).
 *
 * Runs only off the startup path: after the OS release (this launch, every time) and when the app returns to
 * the foreground (at most once per 30 minutes after the last successful discovery). No polling timer.
 * Native app only (requires a launch epoch).
 * The live manifest is fetched with no-store; the current launch snapshot is never changed here.
 */
import type { LaunchIntroLivePayload } from "@/lib/launch-intro/document";
import {
  acquireLaunchIntroAssets,
  collectLaunchIntroAssetGarbage,
  expireInactiveLaunchIntroIndex,
  startInactiveRetentionClock,
  promoteLaunchIntroIndex,
  readLaunchIntroIndex,
  type LaunchIntroIndex,
} from "@/lib/launch-intro/cache";
import { LAUNCH_INTRO_DOCUMENT_ID, readLaunchEpoch } from "@/lib/launch-intro/launch-epoch";
import { onLaunchOsReleased } from "@/lib/launch-intro/os-release-owner";
import { getLaunchDestination } from "@/lib/launch-intro/startup-destination";
import { syncNativeIntroPool } from "@/lib/launch-intro/native-intro-client";
import type { LaunchIntroPoolPayload } from "@/lib/launch-intro/pool";

let started = false;
let inflight = false;
/**
 * 마지막으로 Live 게시본을 **받아 확인한** 시각(ms). 다시 열기 발견은 이 뒤 30분이 지났을 때만 한다.
 * Owner 「결함 2 · 30분」(2026-11-27) — 근거 docs/audit/supabase-request-surge-2026-11-18/resume-fixed-cost-design-2026-11-27.md §3
 * (11-26 하루 다시 열기 발견 322요청 · Supabase 979). 새로 켤 때(OS release) 발견은 지금처럼 매번 한다.
 */
let lastDiscoveryOkAt: number | null = null;

/** 다시 열기 발견 최소 간격 — 인트로는 「완전히 껐다 켬」에만 보이므로 반영 지연은 그 사이 새로 켠 1번뿐 */
export const LAUNCH_INTRO_RESUME_DISCOVERY_MIN_INTERVAL_MS = 30 * 60 * 1000;

/** 순수 판정 — 다시 열기 발견을 할 때인가(한 번도 성공 못 했으면 한다 · 기기 시계가 거꾸로 갔으면 한다) */
export function launchIntroResumeDiscoveryDue(lastOkAt: number | null, now: number): boolean {
  if (lastOkAt == null) return true;
  if (now < lastOkAt) return true;
  return now - lastOkAt >= LAUNCH_INTRO_RESUME_DISCOVERY_MIN_INTERVAL_MS;
}

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
  /** 색인 반영이 끝까지 됐는가 · 소재 묶음 동기화 — 둘 다 성공해야 다시 열기 30분 대기를 시작한다 */
  let indexOk = false;
  let poolSync: Promise<boolean> | null = null;
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
    // 진입 감사 5단계 IN-3: 소재 묶음 → 네이티브 저장소(다음 「새로 켬」의 로딩 시간 안 인트로). 게시본 판과 별개로 맞춘다.
    poolSync = syncNativeIntroPool((live as { pool?: LaunchIntroPoolPayload | null }).pool ?? null);

    const current = readLaunchIntroIndex();
    // IN-P10: 게시본 손상은 revision 을 올리지 않는다(게시본 행만 손상) — 같은 revision 이어도 state 가 다르면 반영한다.
    if (current && current.revision === live.revision && current.state === live.state) {
      // 빌드 전 감사 W2: 시작 시각 없는 예전 비활성 색인 — 보관 기간을 지금부터 센다(7일 뒤 아래에서 지워짐).
      const clocked = startInactiveRetentionClock(current, new Date().toISOString());
      if (clocked) {
        indexOk = promoteLaunchIntroIndex(clocked);
        return;
      }
      // 진입 감사 IN-6: 바뀐 것이 없어도 보관 기간이 지난 비활성 게시본은 지운다.
      const expired = expireInactiveLaunchIntroIndex(current, Date.now());
      if (expired && promoteLaunchIntroIndex(expired)) {
        const keep = new Set<string>();
        for (const a of getLaunchDestination().snapshot?.publication.assets ?? []) keep.add(a.sha256);
        await collectLaunchIntroAssetGarbage(keep);
        console.info(`[dibay-launch-intro] expired_inactive revision=${current.revision}`);
        indexOk = true;
      } else {
        /** 만료할 것이 없으면 끝(바뀐 것 없음). 만료해야 하는데 저장 실패면 다음에 다시 */
        indexOk = expired == null;
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
    indexOk = true;
  } catch {
    /* network / storage failure: nothing changes, previous cache kept */
  } finally {
    try {
      const poolOk = poolSync ? await poolSync.catch(() => false) : false;
      if (indexOk && poolOk) lastDiscoveryOkAt = Date.now();
    } finally {
      inflight = false;
    }
  }
}

/**
 * Idempotent. After the OS release → discovery (매번); return to foreground → discovery **마지막 성공 뒤 30분이 지났을 때만**.
 */
export function startLaunchIntroDiscovery(): void {
  if (started || typeof window === "undefined") return;
  if (!readLaunchEpoch()) return;
  started = true;
  onLaunchOsReleased(() => {
    void runLaunchIntroDiscovery("launch");
  });
  document.addEventListener("visibilitychange", onForegroundDiscovery);
}

function onForegroundDiscovery(): void {
  if (document.visibilityState !== "visible") return;
  if (!launchIntroResumeDiscoveryDue(lastDiscoveryOkAt, Date.now())) return;
  void runLaunchIntroDiscovery("resume");
}

/** 시험 전용 — 모듈마다 붙는 다시 열기 리스너를 떼어 다른 시험에 새지 않게 한다 */
export function __stopLaunchIntroDiscoveryForTests(): void {
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onForegroundDiscovery);
  started = false;
}
