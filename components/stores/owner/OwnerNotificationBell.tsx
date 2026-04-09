"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchOwnerOrdersMetaRemote } from "@/lib/store-owner/owner-order-remote";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

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
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-ig-border bg-white text-foreground"
        aria-label={
          refundRequestedCount > 0 ? `알림 · 환불요청 ${refundRequestedCount}건` : "알림"
        }
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {refundRequestedCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {refundRequestedCount > 99 ? "99+" : refundRequestedCount}
          </span>
        ) : null}
      </Link>
      {refundRequestedCount > 0 ? (
        <p className="max-w-[140px] text-right text-[9px] leading-tight text-muted">
          환불 요청 {refundRequestedCount}건 ·{" "}
          <Link href={buildStoreOrdersHref({ storeId, tab: "refund" })} className="underline">
            주문 관리
          </Link>
        </p>
      ) : null}
    </div>
  );
}
