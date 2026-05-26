"use client";

/**
 * 거래 채팅 → 메신저 room 라우트 RSC 선로딩(계측·중복 방지).
 * UI·API shape·read/unread 변경 없음 — `router.prefetch` 타이밍만 정리.
 */
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import {
  noteR2M11DRoomPrefetchStart,
  noteR2M11DRoomRscFlightDone,
  noteR2M11DRouterPrefetchCalled,
  observeR2M11DRoomRscFlightResource,
} from "@/lib/community-messenger/room/cm-room-r2-m11d-prefetch-flight";
import type { ChatRoomSource } from "@/lib/types/chat";
import { readTradeChatEntryMark } from "@/lib/chats/trade-chat-entry-client";
import {
  isTradeC2CPerfEnabled,
  recordTradeC2CMetricMs,
} from "@/lib/trade/trade-c2c-perf-metrics";
import {
  noteTradeChatEntryJourneyMilestone,
} from "@/lib/trade/trade-chat-entry-journey-perf";

const PREFETCH_HREF_TTL_MS = 60_000;
const RSC_FLIGHT_WAIT_CAP_MS = 12_000;
const PENDING_PREFETCH_KEY = "samarket:trade.pendingRoomRoutePrefetch" as const;

const prefetchedHrefUntil = new Map<string, number>();

export type TradeChatRoomRoutePrefetchRouter = {
  prefetch: (href: string) => void | Promise<void>;
};

export type TradeHubRoomPrefetchInput = {
  roomId: string;
  messengerRoomId?: string | null;
  roomSource?: ChatRoomSource | null;
};

export function tradeHubRoomHrefFromPrefetchInput(input: TradeHubRoomPrefetchInput): string {
  const navRoomId = input.messengerRoomId?.trim() || input.roomId.trim();
  return tradeHubChatRoomHref(navRoomId, input.roomSource ?? null);
}

/** resolve 가 compose 마운트보다 먼저 끝날 때 — compose 가 router 로 prefetch 시작 */
export function scheduleTradeHubRoomRoutePrefetch(input: TradeHubRoomPrefetchInput): void {
  if (typeof window === "undefined") return;
  const dest = tradeHubRoomHrefFromPrefetchInput(input);
  const roomId = input.messengerRoomId?.trim() || input.roomId.trim();
  if (!dest || !roomId) return;
  try {
    sessionStorage.setItem(
      PENDING_PREFETCH_KEY,
      JSON.stringify({ dest, roomId, scheduledAt: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

export function consumeScheduledTradeHubRoomRoutePrefetch(): {
  dest: string;
  roomId: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_PREFETCH_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_PREFETCH_KEY);
    const parsed = JSON.parse(raw) as { dest?: string; roomId?: string };
    const dest = String(parsed.dest ?? "").trim();
    const roomId = String(parsed.roomId ?? "").trim();
    if (!dest || !roomId) return null;
    return { dest, roomId };
  } catch {
    return null;
  }
}

function roomIdFromHref(href: string): string | null {
  const m = href.match(/\/community-messenger\/rooms\/([^/?#]+)/);
  const id = m?.[1] ? decodeURIComponent(m[1].trim()) : "";
  return id || null;
}

function isHrefPrefetchedRecently(href: string): boolean {
  const until = prefetchedHrefUntil.get(href.trim());
  return typeof until === "number" && until > Date.now();
}

function markHrefPrefetched(href: string): void {
  prefetchedHrefUntil.set(href.trim(), Date.now() + PREFETCH_HREF_TTL_MS);
  while (prefetchedHrefUntil.size > 80) {
    const first = prefetchedHrefUntil.keys().next().value;
    if (first === undefined) break;
    prefetchedHrefUntil.delete(first);
  }
}

function findRoomRscResponseEndMs(roomId: string, afterMs: number): number | null {
  if (typeof performance === "undefined") return null;
  const needle = `/community-messenger/rooms/${encodeURIComponent(roomId.trim())}`;
  let best: number | null = null;
  for (const entry of performance.getEntriesByType("resource")) {
    if (!(entry instanceof PerformanceResourceTiming)) continue;
    if (!entry.name.includes("_rsc=") || !entry.name.includes(needle)) continue;
    if (entry.startTime < afterMs - 50) continue;
    const end = entry.responseEnd > 0 ? entry.responseEnd : entry.startTime + entry.duration;
    if (end <= 0) continue;
    if (best == null || end > best) best = end;
  }
  return best;
}

function waitForRoomRscFlightAfterPrefetch(roomId: string, prefetchStartPerf: number): Promise<boolean> {
  const existing = findRoomRscResponseEndMs(roomId, prefetchStartPerf);
  if (existing != null && existing > prefetchStartPerf) {
    noteR2M11DRoomRscFlightDone(roomId, existing);
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const cap = window.setTimeout(() => resolve(false), RSC_FLIGHT_WAIT_CAP_MS);
    const finish = (ok: boolean) => {
      window.clearTimeout(cap);
      resolve(ok);
    };

    if (typeof PerformanceObserver === "undefined") {
      finish(false);
      return;
    }

    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry instanceof PerformanceResourceTiming)) continue;
        observeR2M11DRoomRscFlightResource(entry);
        const end = findRoomRscResponseEndMs(roomId, prefetchStartPerf);
        if (end != null && end > prefetchStartPerf) {
          obs.disconnect();
          finish(true);
          return;
        }
      }
    });
    try {
      obs.observe({ type: "resource", buffered: true });
    } catch {
      finish(false);
      return;
    }
    window.setTimeout(() => {
      const end = findRoomRscResponseEndMs(roomId, prefetchStartPerf);
      obs.disconnect();
      finish(end != null && end > prefetchStartPerf);
    }, 50);
  });
}

/**
 * `router.replace` 전 room RSC prefetch — 이미 warm 된 href 는 스킵.
 * @returns wallMs — 이번 호출에서 prefetch+RSC 대기에 쓴 ms (hit 이면 0)
 */
export async function prefetchTradeHubRoomRouteBeforeNavigate(
  router: TradeChatRoomRoutePrefetchRouter,
  dest: string,
  roomIdInput?: string
): Promise<{ hit: boolean; wallMs: number }> {
  const href = dest.trim();
  const roomId = (roomIdInput?.trim() || roomIdFromHref(href) || "").trim();
  if (!href || !roomId) return { hit: false, wallMs: 0 };

  if (isHrefPrefetchedRecently(href)) {
    if (readTradeChatEntryMark()) {
      recordTradeC2CMetricMs("room_prefetch_hit", 1);
    }
    return { hit: true, wallMs: 0 };
  }

  const track = Boolean(readTradeChatEntryMark());
  const prefetchStartPerf = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (track) {
    noteTradeChatEntryJourneyMilestone("room_prefetch_start");
    recordTradeC2CMetricMs("room_prefetch_hit", 0);
  }
  noteR2M11DRoomPrefetchStart(roomId, href, "post_push");

  const wallT0 = Date.now();
  noteR2M11DRouterPrefetchCalled(roomId, href);
  try {
    await router.prefetch(href);
  } catch {
    /* prefetch 실패해도 replace 는 진행 */
  }

  await waitForRoomRscFlightAfterPrefetch(roomId, prefetchStartPerf);

  const wallMs = Math.max(0, Date.now() - wallT0);
  if (track) {
    noteTradeChatEntryJourneyMilestone("room_prefetch_done");
    recordTradeC2CMetricMs("room_prefetch_wall_ms", wallMs);
  }
  markHrefPrefetched(href);
  return { hit: false, wallMs };
}

/** compose 마운트 직후 — `scheduleTradeHubRoomRoutePrefetch` 만 된 경우 */
export function tryConsumeScheduledTradeHubRoomRoutePrefetch(
  router: TradeChatRoomRoutePrefetchRouter
): void {
  const pending = consumeScheduledTradeHubRoomRoutePrefetch();
  if (!pending) return;
  void prefetchTradeHubRoomRouteBeforeNavigate(router, pending.dest, pending.roomId);
}
