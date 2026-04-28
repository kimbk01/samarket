import { TradeListPageMountProbe } from "@/components/home/TradeListPageMountProbe";
import { HomeContent } from "../home/HomeContent";

/**
 * 거래 전체 리스트 — RSC `await` 제거 (네이티브급 탭 전환 체감).
 *
 * 이전 구조: page-level `await resolveHomePostsGetData(...)` 가 매 진입마다
 * Supabase·favorites·profiles 조회를 직렬 실행 → dev `Link prefetch` 는
 * loading 경계만 덮어 매 탭 탭에서 200~500ms 서버 왕복이 다시 발생했다.
 *
 * 새 구조: 서버는 즉시 셸만 반환하고, 클라 `HomeProductList` 가
 * `peekCachedPostsForHome` 캐시 히트 시 **즉시** 그린다. 미스이면 같은 틱에
 * 단일 `getPostsForHome` 으로 채우면서 라우트 `loading.tsx` 가 깜박인다.
 * 인접 탭·하단 nav `pointerdown` 에서 클라 캐시를 미리 데워 첫 방문도 짧다.
 */
export default function MarketPage() {
  return (
    <div className="min-h-screen bg-sam-app">
      <div className="min-w-0 max-w-full overflow-x-hidden pt-0 pb-4">
        <TradeListPageMountProbe />
        <HomeContent />
      </div>
    </div>
  );
}
