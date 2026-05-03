import {
  isRoomSnapshotFresh,
  prefetchCommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import { prefetchTrace } from "@/lib/community-messenger/prefetch-dev-trace";
import { isConstrainedNetwork, scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";
import { isMessengerDegradeMode } from "@/lib/community-messenger/degrade-mode";

const MAX_QUEUE = 120;
/** 리스트 진입 시 상단 N개 방을 큐에 넣어 MISS 를 줄인다 — 무제한 금지 */
export const MESSENGER_HOME_LIST_PREFETCH_SEED_COUNT = 20;
/**
 * `requestIdleCallback` 타임아웃 — 800~1000ms 대역 (과거 1600ms 급 지연 방지).
 * 네트워크 과부하 완화를 위해 idle 배치만 사용하고 동시 실행은 `MAX_CONCURRENCY` 로 제한.
 */
export const MESSENGER_ROOM_PREFETCH_IDLE_TIMEOUT_MS = 900;
/** 동시에 실행되는 `prefetchCommunityMessengerRoomSnapshot` 최대 개수 — 초과 시 큐 대기 */
export const MESSENGER_ROOM_PREFETCH_MAX_CONCURRENCY = 2;
const MAX_CONCURRENCY = MESSENGER_ROOM_PREFETCH_MAX_CONCURRENCY;

type QueuedPrefetch = { id: string; score: number };
const queue: QueuedPrefetch[] = [];
let running = 0;
let idleScheduled = false;

/** `lastMessageAt` 등으로 최근 활동 방을 앞에 두어 HIT 비율을 올린다 */
export function messengerRoomPrefetchPriorityScore(lastMessageAt: string | null | undefined): number {
  const t = lastMessageAt ? Date.parse(lastMessageAt) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function drain() {
  idleScheduled = false;
  if (running >= MAX_CONCURRENCY) return;
  if (queue.length === 0) return;
  while (running < MAX_CONCURRENCY && queue.length > 0) {
    const next = queue.shift()!;
    const id = next.id;
    running += 1;
    prefetchTrace("drain_start_job", {
      roomIdSuffix: id.slice(-8),
      priorityScore: next.score,
      runningAfterStart: running,
      queueRemaining: queue.length,
      maxConcurrency: MAX_CONCURRENCY,
    });
    if (running > MAX_CONCURRENCY) {
      // eslint-disable-next-line no-console
      console.warn("[cm_prefetch] invariant broken: running > MAX_CONCURRENCY", running);
    }
    void prefetchCommunityMessengerRoomSnapshot(id)
      .catch(() => false)
      .finally(() => {
        running -= 1;
        prefetchTrace("drain_job_done", { runningAfterDone: running, queueRemaining: queue.length });
        if (queue.length > 0) scheduleDrain();
      });
  }
}

function scheduleDrain() {
  if (idleScheduled) return;
  idleScheduled = true;
  scheduleWhenBrowserIdle(() => drain(), MESSENGER_ROOM_PREFETCH_IDLE_TIMEOUT_MS);
}

/**
 * 리스트에서 아직 들어가지 않은 방을 백그라운드로 프리패치해서
 * 첫 진입 시 "불러오는 중" 체감을 줄인다.
 */
export function enqueueRoomPrefetch(roomId: string, priorityScore = 0): void {
  if (typeof window === "undefined") return;
  if (isMessengerDegradeMode()) return;
  if (isConstrainedNetwork()) return;
  const id = String(roomId ?? "").trim();
  if (!id) return;
  if (isRoomSnapshotFresh(id)) {
    prefetchTrace("enqueue_skip_ttl_fresh", { roomIdSuffix: id.slice(-8) });
    return;
  }
  const existingIdx = queue.findIndex((x) => x.id === id);
  if (existingIdx >= 0) {
    if (priorityScore <= queue[existingIdx].score) {
      prefetchTrace("enqueue_skip_lower_priority", { roomIdSuffix: id.slice(-8), priorityScore });
      return;
    }
    queue.splice(existingIdx, 1);
  }
  queue.push({ id, score: priorityScore });
  queue.sort((a, b) => b.score - a.score);
  prefetchTrace("enqueue", { roomIdSuffix: id.slice(-8), priorityScore, queueLen: queue.length, running });
  // 상한 유지 — 우선순위 낮은 항목부터 제거
  while (queue.length > MAX_QUEUE) {
    queue.pop();
  }
  scheduleDrain();
}

