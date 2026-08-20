/**
 * `/market` 첫 페인트 직후 — 하단 탭·내 매장 목록·거래 건수·거래 채팅 목록 캐시를 예열.
 * 홈 피드 첫 페이지는 RSC + `HomeProductList` 의 `primeHomePostsCache` 가 담당 — 여기서 `/api/philife/posts` 를
 * 다시 예열하면 idle 타이밍에 중복 네트워크가 나기 쉬워 제외함.
 *
 * me-stores CONTRACT:
 * - Network/cache authority = `fetchMeStoresListDeduped` (full `StoreRow[]` TTL)
 * - Warm purpose includes priming that full TTL for later hub/guard/shell consumers — not shell-only
 * - Therefore do NOT skip me-stores network solely because OwnerLite projection is fresh
 * - On TTL peek hit or after fetch: project OwnerLite from the same rows (no second freshness authority)
 */
import { fetchMainBottomNavDeduped } from "@/lib/app/fetch-main-bottom-nav-deduped";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { warmTradeChatRoomsClient } from "@/lib/chats/warm-trade-chat-rooms-client";
import {
  fetchMeStoresListDeduped,
  parseStoreRowsFromMeStoresJson,
  peekMeStoresListClientCache,
} from "@/lib/me/fetch-me-stores-deduped";
import { fetchTradeHistoryCounts } from "@/lib/mypage/trade-history-client";
import { seedOwnerLiteStoreFromStores } from "@/lib/stores/owner-lite-external-store";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";
import { shouldRunHomeMainShellWarm } from "@/lib/runtime/next-js-dev-client";

function warmMeStoresListAndProjectOwnerLite(): void {
  const peek = peekMeStoresListClientCache();
  if (peek) {
    const stores = parseStoreRowsFromMeStoresJson(peek.json);
    if (stores != null) {
      seedOwnerLiteStoreFromStores(stores);
    }
    return;
  }
  void fetchMeStoresListDeduped()
    .then((result) => {
      const stores = parseStoreRowsFromMeStoresJson(result.json);
      if (stores != null) {
        seedOwnerLiteStoreFromStores(stores);
      }
    })
    .catch(() => {});
}

/**
 * idle 예열 작업을 취소한다. 라우트 이탈 시 effect cleanup 에서 호출해
 * `pagehide` 만 의존하지 않게 한다(SPA 전환에서는 pagehide 가 안 올 수 있음).
 */
export function warmMainShellData(): () => void {
  if (typeof window === "undefined") return () => {};
  if (!shouldRunHomeMainShellWarm()) return () => {};
  if (document.visibilityState !== "visible") return () => {};
  if (isConstrainedNetwork()) return () => {};

  const idleId = scheduleWhenBrowserIdle(() => {
    warmMeStoresListAndProjectOwnerLite();
    void fetchMainBottomNavDeduped().catch(() => {});

    void (async () => {
      try {
        const uid = await getCurrentUserIdForDb();
        if (!uid) return;
        await Promise.all([
          fetchTradeHistoryCounts(uid),
          /** 거래 탭·FAB에서 「거래 채팅」 선택 시 첫 페인트 전에 목록이 이미 캐시·single-flight 되도록 */
          warmTradeChatRoomsClient(),
        ]);
      } catch {
        /* ignore */
      }
    })();
  }, 1100);

  const cancelIdle = () => {
    cancelScheduledWhenBrowserIdle(idleId);
  };
  window.addEventListener("pagehide", cancelIdle, { once: true });
  return () => {
    cancelIdle();
    window.removeEventListener("pagehide", cancelIdle);
  };
}
