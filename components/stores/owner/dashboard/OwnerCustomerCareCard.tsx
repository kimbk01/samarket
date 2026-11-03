"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { OwnerDashSectionHeader } from "./OwnerDashSectionHeader";
import { ownerDashCardClass, ownerDashTypography } from "./owner-dashboard-ui";

/**
 * Owner Home 「고객 응대」 — 주문 채팅 / 매장 문의 / 리뷰 답글 / 고객센터(→ Support Modal, A2-1) 목록 줄.
 */
export function OwnerCustomerCareCard({
  storeId,
  orderChatUnread,
  storeInquiryUnread = 0,
  reviewsNeedReply = 0,
}: {
  storeId: string;
  orderChatUnread: number;
  storeInquiryUnread?: number;
  /** 답글 안 단 리뷰 수 — 홈 스냅샷 `reviews_need_reply_count` */
  reviewsNeedReply?: number;
}) {
  const { safeT } = useI18n();
  const careHubHref = OwnerRoutes.customerCare(storeId);
  const [storeOpen, setStoreOpen] = useState(storeInquiryUnread);
  const [adminUnread, setAdminUnread] = useState(0);

  const load = useCallback(async () => {
    const noteSum = async (kind: "inbox" | "inquiry") => {
      const res = await fetch(`/api/me/admin-notes?kind=${kind}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        threads?: { member_unread_count?: number }[];
      };
      if (!res.ok || !j.ok || !Array.isArray(j.threads)) return 0;
      return j.threads.reduce((n, th) => n + Math.max(0, Number(th.member_unread_count) || 0), 0);
    };

    let openStore = storeInquiryUnread;
    if (storeId) {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/inquiries`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        inquiries?: { status?: string }[];
      };
      if (res.ok && j.ok && Array.isArray(j.inquiries)) {
        openStore = j.inquiries.filter((r) => String(r.status ?? "") === "open").length;
      }
    }
    const [inbox, inquiry] = await Promise.all([noteSum("inbox"), noteSum("inquiry")]);
    setStoreOpen(openStore);
    setAdminUnread(inbox + inquiry);
  }, [storeId, storeInquiryUnread]);

  useEffect(() => {
    void load();
  }, [load]);

  const customerCenterHref = (() => {
    const base = OwnerRoutes.customerCareCenter(storeId);
    return `${base}${base.includes("?") ? "&" : "?"}from=owner-care`;
  })();

  /**
   * 빈 큰 상자 대신 목록 줄 — 줄마다 처리할 수(빨간 배지), 없으면 「없음」 (Owner 2026-11-03 §4-6).
   * 리뷰 답글 줄 추가(스냅샷 `reviews_need_reply_count`). 플랫폼 고객센터 줄은 기존 진입(A2-1) 유지.
   */
  const rows: Array<{ id: string; href: string; label: string; count: number }> = [
    {
      id: "order-chat",
      href: OwnerRoutes.orderChats(storeId),
      label: safeT("biz_care_order_chat", { fallbackKo: "주문 채팅", fallbackEn: "Order chat" }),
      count: orderChatUnread,
    },
    {
      id: "store-inquiry",
      href: OwnerRoutes.inquiries(storeId),
      label: safeT("biz_care_store_inquiry", { fallbackKo: "매장 문의", fallbackEn: "Store inquiry" }),
      count: storeOpen,
    },
    {
      id: "reviews",
      href: OwnerRoutes.reviews(storeId),
      label: safeT("store_owner_dash_care_reviews", { fallbackKo: "리뷰 답글", fallbackEn: "Review replies" }),
      count: reviewsNeedReply,
    },
    {
      id: "customer-center",
      href: customerCenterHref,
      label: safeT("biz_care_customer_center", { fallbackKo: "문의·상담", fallbackEn: "Help & chat" }),
      count: adminUnread,
    },
  ];

  return (
    <section className={ownerDashCardClass()} aria-labelledby="owner-care-title" data-owner-home-care-card="1">
      <OwnerDashSectionHeader
        id="owner-care-title"
        title={safeT("biz_title_customer_care", {
          fallbackKo: "고객 응대",
          fallbackEn: "Customer care",
        })}
        href={careHubHref}
      />
      <ul className="divide-y divide-[var(--biz-card-border)]">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={r.href}
              prefetch={false}
              data-owner-home-care-entry={r.id}
              className="flex min-h-11 items-center justify-between gap-2 px-0.5 py-2 text-[14px] text-[var(--biz-text)] active:bg-[var(--biz-tan-soft)]"
            >
              <span className="min-w-0 truncate">{r.label}</span>
              {r.count > 0 ? (
                <span className="inline-flex min-w-[1.5rem] shrink-0 justify-center rounded-full bg-sam-danger px-1.5 py-0.5 text-[11px] font-bold text-sam-on-primary">
                  {r.count > 99 ? "99+" : r.count}
                </span>
              ) : (
                <span className={`shrink-0 ${ownerDashTypography.helper}`}>
                  {safeT("store_owner_dash_care_none", { fallbackKo: "없음", fallbackEn: "None" })}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
