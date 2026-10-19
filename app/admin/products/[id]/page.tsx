import { Suspense } from "react";
import { TradePostDetailPage } from "@/components/admin/trade/posts/TradePostDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** 거래 게시물 상세 (설계 v2 §C-3) — 조회·조치는 화면이 `/api/admin/trade/posts/[id]` 로 한다 */
export default async function AdminProductDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <TradePostDetailPage postId={id} />
    </Suspense>
  );
}
