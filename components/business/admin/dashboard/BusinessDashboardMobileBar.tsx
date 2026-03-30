"use client";

import Link from "next/link";

export function BusinessDashboardMobileBar({
  storeOrdersHref,
  inquiriesHref,
  orderBadge,
  inquiryOpenCount,
}: {
  storeOrdersHref: string;
  inquiriesHref: string;
  orderBadge: number;
  inquiryOpenCount: number;
}) {
  const show = orderBadge > 0 || inquiryOpenCount > 0;
  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-3 py-2 backdrop-blur-sm lg:hidden pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
      <div className="mx-auto flex max-w-lg gap-2">
        <Link
          href={storeOrdersHref}
          className="relative flex flex-1 items-center justify-center rounded-xl bg-signature py-3 text-[14px] font-semibold text-white"
        >
          주문 보기
          {orderBadge > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
              {orderBadge > 99 ? "99+" : orderBadge}
            </span>
          ) : null}
        </Link>
        <Link
          href={inquiriesHref}
          className="relative flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white py-3 text-[14px] font-semibold text-gray-900"
        >
          문의
          {inquiryOpenCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-bold text-white">
              {inquiryOpenCount > 99 ? "99+" : inquiryOpenCount}
            </span>
          ) : null}
        </Link>
      </div>
    </div>
  );
}
