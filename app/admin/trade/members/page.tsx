import { Suspense } from "react";
import { TradeMembersPage } from "@/components/admin/trade/members/TradeMembersPage";

/** 판매자·구매자 (설계 v2 §C-6) */
export default function AdminTradeMembersRoute() {
  return (
    <Suspense fallback={null}>
      <TradeMembersPage />
    </Suspense>
  );
}
