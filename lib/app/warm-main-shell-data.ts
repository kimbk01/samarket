/**
 * `/home` 첫 페인트 직후 — 하단 탭·내 매장 목록·거래 건수 캐시를 한꺼번에 예열.
 * 각 호출은 자체 runSingleFlight/TTL 을 쓰므로 BottomNav·OwnerLite·FAB 와 겹쳐도 네트워크는 한 갈래로 합쳐짐.
 */
import { fetchMainBottomNavDeduped } from "@/lib/app/fetch-main-bottom-nav-deduped";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { fetchTradeHistoryCounts } from "@/lib/mypage/trade-history-client";

export function warmMainShellData(): void {
  if (typeof window === "undefined") return;

  void Promise.all([fetchMainBottomNavDeduped(), fetchMeStoresListDeduped()]).catch(() => {});

  void (async () => {
    try {
      const uid = await getCurrentUserIdForDb();
      if (uid) await fetchTradeHistoryCounts(uid);
    } catch {
      /* ignore */
    }
  })();
}
