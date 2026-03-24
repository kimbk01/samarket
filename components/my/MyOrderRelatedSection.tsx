"use client";

import Link from "next/link";

const ROW_CLASS =
  "flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-gray-100";

export function MyOrderRelatedSection() {
  return (
    <section className="rounded-xl bg-gray-50/80 p-1 ring-1 ring-gray-100">
      <h2 className="mb-2 px-3 pt-2 text-[13px] font-semibold text-gray-600">주문 관련 항목</h2>
      <div className="space-y-2 px-1 pb-2">
        <Link href="/mypage/store-orders" className={ROW_CLASS}>
          <div className="min-w-0 flex-1 pr-2">
            <p className="text-[15px] font-medium text-gray-900">매장 주문 내역</p>
            <p className="mt-0.5 text-[12px] text-gray-500">포장 픽업·배달 주문 목록과 상세</p>
          </div>
          <Chevron />
        </Link>
        <Link
          href="/my/order-related/sim-notifications"
          className={`${ROW_CLASS} ring-violet-100`}
        >
          <span className="text-[15px] font-medium text-gray-900">
            매장 주문 알림
            <span className="ml-2 text-[12px] font-normal text-violet-600">시뮬</span>
          </span>
          <Chevron />
        </Link>
        <Link href="/my/order-related/status-history" className={ROW_CLASS}>
          <div className="min-w-0 flex-1 pr-2">
            <p className="text-[15px] font-medium text-gray-900">주문 상태 이력</p>
            <p className="mt-0.5 text-[12px] text-gray-500">
              접수·조리·배달 등 단계 변경 기록을 한곳에서 확인
            </p>
          </div>
          <Chevron />
        </Link>
      </div>
    </section>
  );
}

function Chevron() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="shrink-0 text-gray-400"
      aria-hidden
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
