import { Suspense } from "react";
import { TradeMemberDetailPage } from "@/components/admin/trade/members/TradeMemberDetailPage";

/** 판매자·구매자 상세 (설계 v2 §C-6) */
export default async function AdminTradeMemberDetailRoute({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return (
    <Suspense fallback={null}>
      <TradeMemberDetailPage userId={userId} />
    </Suspense>
  );
}
