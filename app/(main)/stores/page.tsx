import type { Metadata } from "next";
import { StoresHub } from "@/components/stores/StoresHub";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

export const metadata: Metadata = {
  title: "매장",
  description: "동네 매장을 지역·검색·업종별로 찾고, 메뉴·상품을 주문해 보세요.",
};

export default function StoresPage() {
  return (
    <div className={`${APP_MAIN_GUTTER_X_CLASS} bg-[#F0F2F5] py-3 dark:bg-[#18191A]`}>
      <StoresHub />
    </div>
  );
}
