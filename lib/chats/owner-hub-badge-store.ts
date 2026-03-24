/**
 * 매장 오너 허브 배지 — 전역 단일 폴링·fetch.
 * (BottomNav + StoresHub 등) 여러 컴포넌트가 구독해도 /api/me/store-owner-hub-badge 는 한 갈래만 나감.
 */
import {
  OWNER_HUB_BADGE_EMPTY,
  parseOwnerHubBadgeJson,
  sameOwnerHubBadge,
  type OwnerHubBadgeBreakdown,
} from "@/lib/chats/owner-hub-badge-types";
import {
  KASAMA_OWNER_HUB_BADGE_REFRESH,
  KASAMA_TRADE_CHAT_UNREAD_UPDATED,
} from "@/lib/chats/chat-channel-events";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const PATH_FETCH_PREFIXES = [
  "/chats",
  "/my/business/store-orders",
  "/my/business/store-order-chat",
  "/my/business/inquiries",
] as const;

let snapshot: OwnerHubBadgeBreakdown = OWNER_HUB_BADGE_EMPTY;
const listeners = new Set<() => void>();

let pollInterval: ReturnType<typeof setInterval> | null = null;
let bootTimeout: ReturnType<typeof setTimeout> | null = null;
let hubStarted = false;
let globalEventsAttached = false;

function emit() {
  for (const l of listeners) l();
}

function applyFromNetwork(data: unknown) {
  const next = parseOwnerHubBadgeJson(data);
  if (sameOwnerHubBadge(snapshot, next)) return;
  snapshot = next;
  emit();
}

export function fetchOwnerHubBadgeNow(): Promise<void> {
  return runSingleFlight("me:store-owner-hub-badge", async () => {
    try {
      const res = await fetch("/api/me/store-owner-hub-badge", {
        credentials: "include",
        cache: "no-store",
      });
      const data = res.ok ? await res.json() : null;
      applyFromNetwork(data);
    } catch {
      applyFromNetwork(null);
    }
  });
}

function onGlobalRefresh() {
  void fetchOwnerHubBadgeNow();
}

function onVisibility() {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "visible") {
    void fetchOwnerHubBadgeNow();
    if (hubStarted && pollInterval == null) {
      pollInterval = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          void fetchOwnerHubBadgeNow();
        }
      }, 20_000);
    }
  } else if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function attachGlobalEventsOnce() {
  if (globalEventsAttached) return;
  globalEventsAttached = true;
  window.addEventListener("focus", onGlobalRefresh);
  window.addEventListener(KASAMA_TRADE_CHAT_UNREAD_UPDATED, onGlobalRefresh);
  window.addEventListener(KASAMA_OWNER_HUB_BADGE_REFRESH, onGlobalRefresh);
  document.addEventListener("visibilitychange", onVisibility);
}

function detachGlobalEvents() {
  if (!globalEventsAttached) return;
  globalEventsAttached = false;
  window.removeEventListener("focus", onGlobalRefresh);
  window.removeEventListener(KASAMA_TRADE_CHAT_UNREAD_UPDATED, onGlobalRefresh);
  window.removeEventListener(KASAMA_OWNER_HUB_BADGE_REFRESH, onGlobalRefresh);
  document.removeEventListener("visibilitychange", onVisibility);
}

function stopHub() {
  hubStarted = false;
  if (pollInterval != null) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (bootTimeout) {
    clearTimeout(bootTimeout);
    bootTimeout = null;
  }
  detachGlobalEvents();
}

function startHub() {
  if (hubStarted) return;
  hubStarted = true;
  attachGlobalEventsOnce();
  void fetchOwnerHubBadgeNow();
  bootTimeout = setTimeout(() => {
    void fetchOwnerHubBadgeNow();
    bootTimeout = null;
  }, 800);
  if (typeof document === "undefined" || document.visibilityState === "visible") {
    pollInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void fetchOwnerHubBadgeNow();
      }
    }, 20_000);
  }
}

export function subscribeOwnerHubBadge(listener: () => void) {
  listeners.add(listener);
  startHub();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopHub();
  };
}

export function getOwnerHubBadgeSnapshot() {
  return snapshot;
}

export function getOwnerHubBadgeServerSnapshot() {
  return OWNER_HUB_BADGE_EMPTY;
}

/** 채팅·주문·문의 화면 진입 시 한 번 더 갱신 (경로당 inFlight 로 합쳐짐) */
export function refreshOwnerHubBadgeIfHubPath(pathname: string | null) {
  if (!pathname) return;
  if (PATH_FETCH_PREFIXES.some((p) => pathname.startsWith(p))) {
    void fetchOwnerHubBadgeNow();
  }
}
