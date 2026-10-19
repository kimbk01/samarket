import { Suspense } from "react";
import { AdminCommunityPromotionsPage } from "@/components/admin/community/promotions/AdminCommunityPromotionsPage";

/**
 * 게시글 홍보 — 커뮤니티 범위 화면 (설계 v2 §B-3 · §C-12). 이전에는 `/admin/advertising/boosts` 로 이동했다.
 * 거래 포함 전체 상위노출은 화면 상단 링크 「전체 상위노출(거래 포함) 보기」(/admin/advertising/boosts)로 연결한다.
 */
export default function AdminCommunityPromotionsRoute() {
  return (
    <Suspense fallback={null}>
      <AdminCommunityPromotionsPage />
    </Suspense>
  );
}
