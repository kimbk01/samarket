import { Suspense } from "react";
import { AdminCommunitySupportPage } from "@/components/admin/community/support/AdminCommunitySupportPage";

/** 문의 — 거래 Admin 범위 (커뮤니티와 같은 화면·같은 처리) */
export default function AdminTradeSupportRoute() {
  return (
    <Suspense fallback={null}>
      <AdminCommunitySupportPage scope="trade" />
    </Suspense>
  );
}
