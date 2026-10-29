import { Suspense } from "react";
import { AdminDeliveryMenusPage } from "@/components/admin/stores/delivery-menus/AdminDeliveryMenusPage";

/** 배달·매장 › 메뉴 관리 — 고객 배달 화면 상단 탭·아이콘·매장 지정 (배민 미러링). 조회 가드 = API GET(isRouteAdmin) */
export default function AdminDeliveryMenusRoutePage() {
  return (
    <Suspense fallback={null}>
      <AdminDeliveryMenusPage />
    </Suspense>
  );
}
