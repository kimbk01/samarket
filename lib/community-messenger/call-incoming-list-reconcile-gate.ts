/**
 * Phase A1 — 수신 목록(`/incoming`)용 reconcile 묶기.
 *
 * 근거: `docs/audit/supabase-request-surge-2026-11-18/cursor-root-cause-and-fundamental-fix-2026-11-18.md`
 * · 11-08 보완서 §6 — 쿼리 삭제는 BLOCKED. 대안은 「사용자당 N초에 정리 묶음 1회」(결과 동일 · 시점 ≤N초).
 *
 * - LIST 폴링마다 전체 reconcile(R1~R3)을 돌리지 않는다.
 * - 같은 사용자·같은 서버 인스턴스에서 성공한 정리 시각을 기억해 N초 안에는 건너뛴다.
 * - 동시 요청은 `runSingleFlight` 로 1회로 합친다.
 * - 서버리스 인스턴스마다 기억이 따로라 전역 1회는 보장하지 않는다(인스턴스당 상한). cron stale-cleanup(2분)이 안전망.
 * - Redis/신규 표 없음 — 운영 DB 마이그레이션 없음.
 */

import { runSingleFlight } from "@/lib/http/run-single-flight";

/** 울림 타임아웃(30초)과 맞춤 — 만료 정리 시점이 최대 이 간격만큼 밀릴 수 있다. */
export const INCOMING_LIST_RECONCILE_MIN_INTERVAL_MS = 30_000;

const MAX_TRACKED_USERS = 4_000;

type GateStore = {
  lastSuccessAtByUser: Map<string, number>;
};

type GlobalGate = {
  __dibayIncomingListReconcileGate?: GateStore;
};

function gateStore(): GateStore {
  const g = globalThis as GlobalGate;
  if (!g.__dibayIncomingListReconcileGate) {
    g.__dibayIncomingListReconcileGate = { lastSuccessAtByUser: new Map() };
  }
  return g.__dibayIncomingListReconcileGate;
}

function pruneIfNeeded(map: Map<string, number>): void {
  if (map.size <= MAX_TRACKED_USERS) return;
  const overflow = map.size - Math.floor(MAX_TRACKED_USERS * 0.75);
  const keys = map.keys();
  for (let i = 0; i < overflow; i += 1) {
    const k = keys.next().value;
    if (k == null) break;
    map.delete(k);
  }
}

/** 단위 테스트용 — 인스턴스 기억 초기화 */
export function resetIncomingListReconcileGateForTests(): void {
  gateStore().lastSuccessAtByUser.clear();
}

export function shouldRunIncomingListReconcile(
  userId: string,
  nowMs = Date.now(),
  force = false,
): boolean {
  if (force) return true;
  const uid = userId.trim();
  if (!uid) return false;
  const last = gateStore().lastSuccessAtByUser.get(uid) ?? 0;
  return nowMs - last >= INCOMING_LIST_RECONCILE_MIN_INTERVAL_MS;
}

export function markIncomingListReconcileSuccess(userId: string, nowMs = Date.now()): void {
  const uid = userId.trim();
  if (!uid) return;
  const map = gateStore().lastSuccessAtByUser;
  map.set(uid, nowMs);
  pruneIfNeeded(map);
}

/**
 * 수신 목록 경로에서만 사용. `force` 이면 간격과 무관하게 1회 실행(실제 ringing 행 정책 필터).
 * 성공한 뒤에만 시각을 기록 — 실패 시 다음 호출이 곧 재시도한다.
 */
export async function runIncomingListReconcileIfDue(
  userId: string,
  run: () => Promise<unknown>,
  options?: { force?: boolean },
): Promise<{ ran: boolean }> {
  const uid = userId.trim();
  if (!uid) return { ran: false };
  const force = options?.force === true;
  return runSingleFlight(`incoming-list-reconcile:${uid}`, async () => {
    if (!shouldRunIncomingListReconcile(uid, Date.now(), force)) {
      return { ran: false };
    }
    await run();
    markIncomingListReconcileSuccess(uid);
    return { ran: true };
  });
}
