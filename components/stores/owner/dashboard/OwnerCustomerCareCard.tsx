"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Headphones, HelpCircle, MessageCircle } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { buildOwnerSupportContext } from "@/lib/support/support-context";
import { navigateToSupportCenter } from "@/lib/support/open-support-center";
import { OwnerDashSectionHeader } from "./OwnerDashSectionHeader";
import { ownerDashCardClass, ownerDashTypography } from "./owner-dashboard-ui";

/**
 * Owner Home 「고객 응대」 — 주문 채팅 / 매장 문의 KEEP; 고객센터 → Support Modal (A2-1).
 */
export function OwnerCustomerCareCard({
  storeId,
  orderChatUnread,
  storeInquiryUnread = 0,
}: {
  storeId: string;
  orderChatUnread: number;
  storeInquiryUnread?: number;
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

  const openOwnerSupport = () => {
    navigateToSupportCenter(
      buildOwnerSupportContext({
        enabled: true,
        category: "OTHER",
        sourceSurface: "owner_care_card",
        storeId,
      })
    );
  };

  const cellClass =
    "flex min-h-[88px] w-full items-start gap-2 rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-tan-soft)] p-2.5 text-left active:bg-[var(--biz-primary-soft)]";

  return (
    <section className={ownerDashCardClass("space-y-3")} aria-labelledby="owner-care-title" data-owner-home-care-card="1">
      <OwnerDashSectionHeader
        id="owner-care-title"
        title={safeT("biz_title_customer_care", {
          fallbackKo: "고객 응대",
          fallbackEn: "Customer care",
        })}
        href={careHubHref}
      />
      <p className={`${ownerDashTypography.helper}`}>
        {safeT("support_owner_care_home_hint", {
          fallbackKo: "DIBAY 관리자 문의는 「고객센터」에서 Support로 연결됩니다.",
          fallbackEn: "Contact DIBAY admin via Customer Center → Support.",
        })}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link
          href={OwnerRoutes.orderChats(storeId)}
          prefetch={false}
          data-owner-home-care-entry="order-chat"
          className={cellClass}
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-rect bg-[var(--biz-app-bg)]">
            <MessageCircle className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`flex items-center justify-between gap-1 ${ownerDashTypography.cellTitle}`}>
              <span className="truncate">
                {safeT("biz_care_order_chat", { fallbackKo: "주문 채팅", fallbackEn: "Order chat" })}
              </span>
              {orderChatUnread > 0 ? (
                <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {orderChatUnread > 99 ? "99+" : orderChatUnread}
                </span>
              ) : null}
            </span>
            <span className={`mt-0.5 block ${ownerDashTypography.helper}`}>
              {safeT("biz_care_order_chat_desc", {
                fallbackKo: "배달·매장 주문 대화",
                fallbackEn: "Delivery and store order conversations",
              })}
            </span>
          </span>
        </Link>

        <Link
          href={OwnerRoutes.inquiries(storeId)}
          prefetch={false}
          data-owner-home-care-entry="store-inquiry"
          className={cellClass}
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-rect bg-[var(--biz-app-bg)]">
            <HelpCircle className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`flex items-center justify-between gap-1 ${ownerDashTypography.cellTitle}`}>
              <span className="truncate">
                {safeT("biz_care_store_inquiry", { fallbackKo: "매장 문의", fallbackEn: "Store inquiry" })}
              </span>
              {storeOpen > 0 ? (
                <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {storeOpen > 99 ? "99+" : storeOpen}
                </span>
              ) : null}
            </span>
            <span
              className={`mt-0.5 block ${ownerDashTypography.helper} ${storeOpen > 0 ? "font-medium text-[#DC2626]" : ""}`}
            >
              {safeT("biz_care_store_inquiry_desc", {
                fallbackKo: "이 매장으로 온 문의",
                fallbackEn: "Inquiries sent to this store",
              })}
            </span>
          </span>
        </Link>

        <button
          type="button"
          data-owner-home-care-entry="customer-center"
          className={cellClass}
          onClick={openOwnerSupport}
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-rect bg-[var(--biz-app-bg)]">
            <Headphones className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`flex items-center justify-between gap-1 ${ownerDashTypography.cellTitle}`}>
              <span className="truncate">
                {safeT("biz_care_customer_center", {
                  fallbackKo: "고객센터",
                  fallbackEn: "Customer center",
                })}
              </span>
              {adminUnread > 0 ? (
                <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {adminUnread > 99 ? "99+" : adminUnread}
                </span>
              ) : null}
            </span>
            <span className={`mt-0.5 block ${ownerDashTypography.helper}`}>
              {safeT("biz_care_customer_center_desc", {
                fallbackKo: "DIBAY 고객센터 문의",
                fallbackEn: "Contact DIBAY Support",
              })}
            </span>
          </span>
        </button>
      </div>
      <Link
        href={customerCenterHref}
        className="text-xs font-medium text-sam-muted underline"
        data-owner-care-history-link="1"
      >
        {safeT("support_history_title", {
          fallbackKo: "상담 내역 · 이전 문의 기록",
          fallbackEn: "History & archive",
        })}
      </Link>
    </section>
  );
}
