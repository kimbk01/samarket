"use client";

import { MyProductsView } from "@/components/mypage/products/MyProductsView";
import { MypageSubpageShell } from "@/components/mypage/i18n/MypageSubpageShell";
import { SellerHubNav } from "@/components/mypage/seller/SellerHubNav";

export default function MypageProductsPage() {
  return (
    <MypageSubpageShell
      titleKey="marketplace_seller_products_title"
      subtitleKey="marketplace_seller_products_subtitle"
      backHref="/market/sell"
      stickyBelow={<SellerHubNav active="products" />}
      section="trade"
    >
      <MyProductsView />
    </MypageSubpageShell>
  );
}
