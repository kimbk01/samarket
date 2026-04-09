"use client";

import { MyProductsView } from "@/components/mypage/products/MyProductsView";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MypageProductsPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="내상품 관리"
        subtitle="개인 거래에 등록한 글 관리"
        backHref="/mypage"
        hideCtaStrip
      />
      <div className="pt-4">
        <MyProductsView />
      </div>
    </div>
  );
}
