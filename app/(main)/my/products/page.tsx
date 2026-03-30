"use client";

import { MyProductsView } from "@/components/mypage/products/MyProductsView";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MyProductsPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="내상품 관리"
        subtitle="거래·판매 글"
        backHref="/mypage"
        section="trade"
      />
      <div className="pt-4">
        <MyProductsView />
      </div>
    </div>
  );
}
