import { Suspense } from "react";
import { MyStoreOrdersView } from "@/components/mypage/MyStoreOrdersView";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

/** 소비자용 매장 주문 목록의 기준 경로. */
export default function MyStoreOrdersPage() {
  return (
    <Suspense
      fallback={<p className={`pt-4 text-sm text-gray-500 ${APP_MAIN_GUTTER_X_CLASS}`}>불러오는 중…</p>}
    >
      <MyStoreOrdersView />
    </Suspense>
  );
}
