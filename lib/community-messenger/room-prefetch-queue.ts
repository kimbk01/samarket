import { prefetchCommunityMessengerRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { isConstrainedNetwork, scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";
import { isMessengerDegradeMode } from "@/lib/community-messenger/degrade-mode";

const MAX_QUEUE = 120;
const MAX_CONCURRENCY = 2;

const queued = new Set<string>();
const queue: string[] = [];
let running = 0;
let idleScheduled = false;

function drain() {
  idleScheduled = false;
  if (running >= MAX_CONCURRENCY) return;
  if (queue.length === 0) return;
  while (running < MAX_CONCURRENCY && queue.length > 0) {
    const id = queue.shift()!;
    queued.delete(id);
    running += 1;
    void prefetchCommunityMessengerRoomSnapshot(id)
      .catch(() => false)
      .finally(() => {
        running -= 1;
        if (queue.length > 0) scheduleDrain();
      });
  }
}

function scheduleDrain() {
  if (idleScheduled) return;
  idleScheduled = true;
  scheduleWhenBrowserIdle(() => drain(), 900);
}

/**
 * 리스트에서 아직 들어가지 않은 방을 백그라운드로 프리패치해서
 * 첫 진입 시 "불러오는 중" 체감을 줄인다.
 */
export function enqueueRoomPrefetch(roomId: string): void {
  if (typeof window === "undefined") return;
  if (isMessengerDegradeMode()) return;
  if (isConstrainedNetwork()) return;
  const id = String(roomId ?? "").trim();
  if (!id) return;
  if (queued.has(id)) return;
  queued.add(id);
  queue.push(id);
  // 상한 유지 (오래된 요청부터 버림)
  while (queue.length > MAX_QUEUE) {
    const drop = queue.shift();
    if (drop) queued.delete(drop);
  }
  scheduleDrain();
}

