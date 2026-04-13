/**
 * `/home` 첫 페인트 직후 — 홈 피드·하단 탭·내 매장 목록·거래 건수 캐시를 예열.
 * 각 호출은 자체 runSingleFlight/TTL 을 쓰므로 BottomNav·OwnerLite·FAB·HomeProductList 와 겹쳐도 네트워크는 한 갈래로 합쳐짐.
 */
import { fetchMainBottomNavDeduped } from "@/lib/app/fetch-main-bottom-nav-deduped";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { fetchChatRoomsBySegment } from "@/lib/chats/fetch-chat-rooms-by-segment";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { fetchTradeHistoryCounts } from "@/lib/mypage/trade-history-client";
import { getPostsForHome, peekCachedPostsForHome } from "@/lib/posts/getPostsForHome";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";

export function warmMainShellData(): void {
  if (typeof window === "undefined") return;
  if (document.visibilityState !== "visible") return;
  if (isConstrainedNetwork()) return;

  /** 홈 목록 API 예열 — RSC 시드 + `primeHomePostsCache` 가 이미 채웠으면 네트워크 생략 */
  const postsWarmId = scheduleWhenBrowserIdle(() => {
    if (peekCachedPostsForHome({ sort: "latest", type: null })) return;
    void getPostsForHome({ sort: "latest", type: null }).catch(() => {});
  }, 280);

  const idleId = scheduleWhenBrowserIdle(() => {
    void Promise.all([fetchMainBottomNavDeduped(), fetchMeStoresListDeduped()]).catch(() => {});

    void (async () => {
      try {
        const uid = await getCurrentUserIdForDb();
        if (!uid) return;
        await Promise.all([
          fetchTradeHistoryCounts(uid),
          /** 거래 탭·FAB에서 「거래 채팅」 선택 시 첫 페인트 전에 목록이 이미 캐시·single-flight 되도록 */
          fetchChatRoomsBySegment("trade").catch(() => {}),
        ]);
      } catch {
        /* ignore */
      }
    })();
  }, 1100);

  window.addEventListener(
    "pagehide",
    () => {
      cancelScheduledWhenBrowserIdle(postsWarmId);
      cancelScheduledWhenBrowserIdle(idleId);
    },
    { once: true }
  );
}
