"use client";

import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MyPointsChargePage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="포인트 충전 신청"
        subtitle="충전 요청"
        backHref="/mypage/points"
        section="account"
        hideCtaStrip
      />
      <div className="mx-auto max-w-lg p-4">
        <div className="rounded-ui-rect border border-gray-200 bg-white p-6 text-center">
          <p className="text-[14px] leading-relaxed text-gray-600">
            충전 신청은 <strong className="font-medium text-gray-900">결제·포인트 백엔드</strong>가
            준비되면 이 화면에서 진행할 수 있습니다. 현재는 샘플 충전 폼을 노출하지 않습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
