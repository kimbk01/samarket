"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchOwnerOrdersMetaRemote } from "@/lib/store-owner/owner-order-remote";

export function OwnerNotificationBell({ slug, storeId }: { slug: string; storeId: string }) {
  const [refundRequestedCount, setRefundRequestedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetchOwnerOrdersMetaRemote(storeId);
      if (!cancelled && r.ok) setRefundRequestedCount(r.meta.refund_requested_count);
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Link
        href={`/stores/${encodeURIComponent(slug)}/owner/notifications`}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-800"
        aria-label={
          refundRequestedCount > 0 ? `알림 · 환불요청 ${refundRequestedCount}건` : "알림"
        }
      >
        <span className="text-[16px]">🔔</span>
        {refundRequestedCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {refundRequestedCount > 99 ? "99+" : refundRequestedCount}
          </span>
        ) : null}
      </Link>
      {refundRequestedCount > 0 ? (
        <p className="max-w-[140px] text-right text-[9px] leading-tight text-gray-500">
          환불 요청 {refundRequestedCount}건 ·{" "}
          <Link href="/my/business/store-orders" className="underline">
            주문 관리
          </Link>
        </p>
      ) : null}
    </div>
  );
}
