import { Suspense } from "react";
import { AdPricingGuidePageClient } from "@/components/mypage/cs/AdPricingGuidePageClient";

/** 내정보 › 고객센터 › 공지사항 › 「광고 요금 안내」 고정 게시물 (광고 감사 E) */
export default function AdPricingGuidePage() {
  return (
    <Suspense fallback={null}>
      <AdPricingGuidePageClient />
    </Suspense>
  );
}
