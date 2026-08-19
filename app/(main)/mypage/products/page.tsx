import { Suspense } from "react";
import { MyProductsView } from "@/components/mypage/products/MyProductsView";
import { MypageSubpageShell } from "@/components/mypage/i18n/MypageSubpageShell";

export default function MypageProductsPage() {
  return (
    <MypageSubpageShell
      titleKey="marketplace_seller_products_title"
      subtitleKey="marketplace_seller_products_subtitle"
      backHref="/market/sell"
      section="trade"
    >
      <Suspense fallback={null}>
        <MyProductsView />
      </Suspense>
    </MypageSubpageShell>
  );
}
