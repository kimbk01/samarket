"use client";

import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyStoreInquiriesView } from "@/components/mypage/MyStoreInquiriesView";

export default function MyStoreInquiriesPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="매장 문의"
        subtitle="주문·매장 문의 내역"
        backHref="/mypage"
        section="orders"
      />
      <div className="mx-auto max-w-4xl px-4 py-4">
        <MyStoreInquiriesView />
      </div>
    </div>
  );
}
