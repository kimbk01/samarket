/**
 * `/home` 첫 페인트 직후 — 하단 탭·내 매장 목록·거래 건수·거래 채팅 목록 캐시를 예열.
 * 홈 피드 첫 페이지는 RSC + `HomeProductList` 의 `primeHomePostsCache` 가 담당 — 여기서 `/api/home/posts` 를
 * 다시 예열하면 idle 타이밍에 중복 네트워크가 나기 쉬워 제외함.
 * 각 호출은 자체 runSingleFlight/TTL 을 쓰므로 BottomNav·OwnerLite·FAB 과 겹쳐도 네트워크는 한 갈래로 합쳐짐.
 */
import { fetchMainBottomNavDeduped } from "@/lib/app/fetch-main-bottom-nav-deduped";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { fetchChatRoomsBySegment } from "@/lib/chats/fetch-chat-rooms-by-segment";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { fetchTradeHistoryCounts } from "@/lib/mypage/trade-history-client";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";
import { shouldRunHomeMainShellWarm } from "@/lib/runtime/next-js-dev-client";

export function warmMainShellData(): void {
  if (typeof window === "undefined") return;
  if (!shouldRunHomeMainShellWarm()) return;
  if (document.visibilityState !== "visible") return;
  if (isConstrainedNetwork()) return;

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
      cancelScheduledWhenBrowserIdle(idleId);
    },
    { once: true }
  );
}
