"use client";

import { MyProductsView } from "@/components/mypage/products/MyProductsView";
import { MypageSubpageShell } from "@/components/mypage/i18n/MypageSubpageShell";

export default function MypageProductsPage() {
  return (
    <MypageSubpageShell titleKey="route_products_title" subtitleKey="route_products_subtitle">
      <MyProductsView />
    </MypageSubpageShell>
  );
}
