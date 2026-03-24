"use client";

import { AppBackButton } from "@/components/navigation/AppBackButton";

export default function MyPointsChargePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton backHref="/my/points" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">
          포인트 충전 신청
        </h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="p-4">
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
          <p className="text-[14px] leading-relaxed text-gray-600">
            충전 신청은 <strong className="font-medium text-gray-900">결제·포인트 백엔드</strong>가
            준비되면 이 화면에서 진행할 수 있습니다. 현재는 샘플 충전 폼을 노출하지 않습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
