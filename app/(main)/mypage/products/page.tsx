"use client";

import { MyProductsView } from "@/components/mypage/products/MyProductsView";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageProductsPage() {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title="내상품 관리"
        subtitle="개인 거래에 등록한 글 관리"
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <MyProductsView />
      </div>
    </div>
  );
}
