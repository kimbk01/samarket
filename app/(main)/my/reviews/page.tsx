"use client";

import { MyReviewsView } from "@/components/reviews/MyReviewsView";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MyReviewsPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="받은 후기"
        subtitle="거래 신뢰·평가"
        backHref="/mypage"
        section="trade"
      />
      <div className="pt-4">
        <MyReviewsView />
      </div>
    </div>
  );
}
