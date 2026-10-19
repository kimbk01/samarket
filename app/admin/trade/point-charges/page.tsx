import { Suspense } from "react";
import { AdminCommunityPointChargesPage } from "@/components/admin/community/charges/AdminCommunityPointChargesPage";

/** 포인트 충전 신청 — 거래 Admin 범위 (커뮤니티와 같은 화면·같은 처리) */
export default function AdminTradePointChargesRoute() {
  return (
    <Suspense fallback={null}>
      <AdminCommunityPointChargesPage scope="trade" />
    </Suspense>
  );
}
