import type { Metadata } from "next";
import { Suspense } from "react";
import { StoresHub } from "@/components/stores/StoresHub";
import { PHILIFE_FEED_INSET_X_CLASS } from "@/lib/philife/philife-flat-ui-classes";

export const metadata: Metadata = {
  title: "매장",
  description: "동네 매장을 지역·검색·업종별로 찾고, 메뉴·상품을 주문해 보세요.",
};

export default function StoresPage() {
  return (
    <div className={`${PHILIFE_FEED_INSET_X_CLASS} bg-sam-app py-3 dark:bg-[#18191A]`}>
      <Suspense fallback={null}>
        <StoresHub />
      </Suspense>
    </div>
  );
}
