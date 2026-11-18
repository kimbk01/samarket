import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";
import { SAMARKET_PRESENCE_ONLINE_GRACE_MS } from "@/lib/community-messenger/presence/presence-policy";

/**
 * Realtime presence 가 unhealthy 일 때의 HTTP 스냅샷 폴백 — 모듈 단일 스케줄러.
 *
 * - 화면에 마운트된 `useCommunityMessengerPeerPresence` 인스턴스들이 id 를 `subscribe` 하면
 *   짧은 coalesce 창 안의 id 를 모아 **한 번의 배치**(24개/요청)로 조회한다.
 * - 각 id 는 `intervalMs`(online 창보다 짧게) 마다 다시 조회 — 마지막 관측이 online 창을 넘기기 전에 갱신.
 * - Realtime 이 healthy 면 조회하지 않음(가벼운 health probe 만), 구독자 0 이면 타이머 정지,
 *   문서 hidden 이면 정지 후 `notifyVisible()` 에서 재개.
 * - 한 번의 실행당 `maxIdsPerTick` 개, 실행 간 최소 `minRunGapMs` — 요청량 상한.
 */

/**
 * D1 2단계 — 온라인 판정 창(150s)보다 10초 짧게: **온라인으로 보이는 상대만** 창 만료 전에 1회 재확인한다.
 * 오프라인 상대는 다시 조회하지 않는다(방 밖 = 마지막 접속 표시. 1:1 머리글은 사용자별 토픽으로 실시간 전환).
 */
export const CM_PRESENCE_SNAPSHOT_POLL_INTERVAL_MS = SAMARKET_PRESENCE_ONLINE_GRACE_MS - 10_000;
/** 4 요청 × 24 ids */
export const CM_PRESENCE_SNAPSHOT_POLL_MAX_IDS_PER_TICK = 96;
export const CM_PRESENCE_SNAPSHOT_POLL_COALESCE_MS = 50;
export const CM_PRESENCE_SNAPSHOT_POLL_MIN_RUN_GAP_MS = 2_000;
export const CM_PRESENCE_SNAPSHOT_POLL_DEFER_MS = 1_500;
/** 타이머 드리프트 허용 — 이 안에 만기되는 id 는 같은 배치에 합류 */
const DUE_TOLERANCE_MS = 1_000;

export type PresenceSnapshotPollSchedulerDeps = {
  fetchBatch: (ids: string[]) => Promise<Map<string, CommunityMessengerPeerPresenceSnapshot>>;
  /**
   * `initial` = 실시간 정상 중 처음 보는 id 의 첫 값 조회 — 적용측은 저장소에 없는 id 만 채운다(실시간 값 덮지 않음).
   * false = 실시간 비정상 폴링 — 지금처럼 덮는다.
   */
  apply: (
    snapshots: Map<string, CommunityMessengerPeerPresenceSnapshot>,
    info: { observedAtMs: number; elapsedMs: number; initial: boolean }
  ) => void;
  isRealtimeHealthy: () => boolean;
  /**
   * D1 2단계 — 이미 한 번 받은 id 를 다시 조회할지(기본 true = 기존 동작). 표시 훅은 「지금 온라인으로 보이는가」를 넘긴다.
   * false 인 id 는 타이머 예약·배치 대상에서 빠진다.
   */
  shouldRepoll?: (userId: string) => boolean;
  /** 방 진입 우선 모드 등 — true 면 잠시 뒤로 미룸 */
  isDeferred: () => boolean;
  isDocumentVisible: () => boolean;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  intervalMs?: number;
  maxIdsPerTick?: number;
  coalesceMs?: number;
  minRunGapMs?: number;
  deferMs?: number;
};

export type PresenceSnapshotPollScheduler = {
  subscribe: (userId: string) => () => void;
  notifyVisible: () => void;
  /** 테스트·진단용 */
  getSubscribedIds: () => string[];
  isTimerActive: () => boolean;
};

export function createPresenceSnapshotPollScheduler(deps: PresenceSnapshotPollSchedulerDeps): PresenceSnapshotPollScheduler {
  const intervalMs = deps.intervalMs ?? CM_PRESENCE_SNAPSHOT_POLL_INTERVAL_MS;
  const maxIdsPerTick = Math.max(1, deps.maxIdsPerTick ?? CM_PRESENCE_SNAPSHOT_POLL_MAX_IDS_PER_TICK);
  const coalesceMs = deps.coalesceMs ?? CM_PRESENCE_SNAPSHOT_POLL_COALESCE_MS;
  const minRunGapMs = deps.minRunGapMs ?? CM_PRESENCE_SNAPSHOT_POLL_MIN_RUN_GAP_MS;
  const deferMs = deps.deferMs ?? CM_PRESENCE_SNAPSHOT_POLL_DEFER_MS;
  const shouldRepoll = (id: string) => (deps.shouldRepoll ? deps.shouldRepoll(id) : true);

  const refs = new Map<string, number>();
  const lastFetchedAt = new Map<string, number>();
  let timer: unknown = null;
  let timerDueAt = 0;
  let inFlight = false;
  let lastRunAt = Number.NEGATIVE_INFINITY;

  const clear = () => {
    if (timer != null) deps.clearTimer(timer);
    timer = null;
  };

  /** 더 이른 예약만 덮어쓴다 */
  const schedule = (delayMs: number) => {
    if (refs.size === 0) {
      clear();
      return;
    }
    if (!Number.isFinite(delayMs)) {
      clear();
      return;
    }
    const delay = Math.max(0, delayMs);
    const due = deps.now() + delay;
    if (timer != null && timerDueAt <= due) return;
    clear();
    timerDueAt = due;
    timer = deps.setTimer(() => {
      timer = null;
      void run();
    }, delay);
  };

  const nextDueDelay = (): number => {
    const now = deps.now();
    let earliest = Number.POSITIVE_INFINITY;
    for (const id of refs.keys()) {
      const last = lastFetchedAt.get(id);
      if (last != null && !shouldRepoll(id)) continue;
      const due = last == null ? now : last + intervalMs;
      if (due < earliest) earliest = due;
    }
    /** 다시 볼 id 가 없으면 예약하지 않는다(Infinity → schedule 이 타이머를 걸지 않음) */
    if (!Number.isFinite(earliest)) return Number.POSITIVE_INFINITY;
    const gapFloor = lastRunAt + minRunGapMs - now;
    return Math.max(earliest - now, gapFloor, 0);
  };

  const pickDueIds = (): string[] => {
    const now = deps.now();
    const due: { id: string; last: number }[] = [];
    for (const id of refs.keys()) {
      const last = lastFetchedAt.get(id);
      if (last == null || (shouldRepoll(id) && last + intervalMs <= now + DUE_TOLERANCE_MS)) {
        due.push({ id, last: last ?? Number.NEGATIVE_INFINITY });
      }
    }
    due.sort((a, b) => a.last - b.last);
    return due.slice(0, maxIdsPerTick).map((d) => d.id);
  };

  /** 한 번도 조회하지 않은 id — 실시간 접속 채널은 지금 접속 중인 사람만 알려 주므로 첫 값은 서버에서 1회 받는다 */
  const pickNeverFetchedIds = (): string[] =>
    [...refs.keys()].filter((id) => !lastFetchedAt.has(id)).slice(0, maxIdsPerTick);

  const run = async () => {
    if (refs.size === 0) return;
    if (!deps.isDocumentVisible()) return; // notifyVisible 에서 재개
    const healthy = deps.isRealtimeHealthy();
    /**
     * Realtime 이 정상 — 반복 조회는 하지 않는다. 다만 처음 보는 id 는 1회 조회한다(2026-11-16 감사 R1:
     * 접속하지 않은 상대는 실시간으로 값이 오지 않아 1:1 머리글이 방 설명 문구로 남았다).
     */
    if (healthy && pickNeverFetchedIds().length === 0) {
      schedule(intervalMs);
      return;
    }
    if (deps.isDeferred()) {
      schedule(deferMs);
      return;
    }
    if (inFlight) return; // 완료 시 재예약
    const now = deps.now();
    if (now - lastRunAt < minRunGapMs) {
      schedule(lastRunAt + minRunGapMs - now);
      return;
    }
    const ids = healthy ? pickNeverFetchedIds() : pickDueIds();
    if (ids.length === 0) {
      schedule(healthy ? intervalMs : nextDueDelay());
      return;
    }
    inFlight = true;
    lastRunAt = now;
    for (const id of ids) lastFetchedAt.set(id, now);
    try {
      const result = await deps.fetchBatch(ids);
      if (refs.size > 0) {
        const observedAtMs = deps.now();
        const visible = new Map<string, CommunityMessengerPeerPresenceSnapshot>();
        for (const [id, snap] of result) if (refs.has(id)) visible.set(id, snap);
        if (visible.size > 0) {
          deps.apply(visible, { observedAtMs, elapsedMs: Math.max(0, observedAtMs - now), initial: healthy });
        }
      }
    } catch {
      /* 다음 주기에 재시도 */
    } finally {
      inFlight = false;
    }
    schedule(nextDueDelay());
  };

  return {
    subscribe(userId: string) {
      const id = String(userId ?? "").trim();
      if (!id) return () => {};
      refs.set(id, (refs.get(id) ?? 0) + 1);
      const last = lastFetchedAt.get(id);
      schedule(last == null ? coalesceMs : nextDueDelay());
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const n = (refs.get(id) ?? 1) - 1;
        if (n > 0) {
          refs.set(id, n);
          return;
        }
        refs.delete(id);
        lastFetchedAt.delete(id);
        if (refs.size === 0) clear();
      };
    },
    notifyVisible() {
      if (refs.size === 0) return;
      schedule(Math.max(coalesceMs, nextDueDelay()));
    },
    getSubscribedIds: () => [...refs.keys()],
    isTimerActive: () => timer != null,
  };
}
