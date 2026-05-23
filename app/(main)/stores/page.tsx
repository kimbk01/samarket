import type { Metadata } from "next";
import { Suspense } from "react";
import { StoresHub } from "@/components/stores/StoresHub";
import { DeliveryTheme } from "@/lib/design/delivery-theme";

export const metadata: Metadata = {
  title: "매장",
  description: "동네 매장을 지역·검색·업종별로 찾고, 메뉴·상품을 주문해 보세요.",
};

export default function StoresPage() {
  return (
    <div className={`delivery-ui ${DeliveryTheme.page} min-h-0`}>
      <Suspense fallback={null}>
        <StoresHub />
      </Suspense>
    </div>
  );
}
