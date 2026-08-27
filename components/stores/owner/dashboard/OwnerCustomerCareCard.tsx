"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Headphones, HelpCircle, MessageCircle } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { OwnerDashSectionHeader } from "./OwnerDashSectionHeader";
import { ownerDashCardClass, ownerDashTypography } from "./owner-dashboard-ui";

/**
 * Owner Home 「고객 응대」 — Care Hub와 동일 3 entry (주문 채팅 / 매장 문의 / 고객센터).
 * 고객센터 = DIBAY 관리자 쪽지 + 1:1 문의 (member_admin_note).
 */
export function OwnerCustomerCareCard({
  storeId,
  orderChatUnread,
  storeInquiryUnread = 0,
}: {
  storeId: string;
  orderChatUnread: number;
  /** optional; if omitted, card fetches open store inquiries */
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

  const cells = [
    {
      id: "order-chat",
      href: OwnerRoutes.orderChats(storeId),
      icon: MessageCircle,
      label: safeT("biz_care_order_chat", {
        fallbackKo: "주문 채팅",
        fallbackEn: "Order chat",
      }),
      sub: safeT("biz_care_order_chat_desc", {
        fallbackKo: "배달·매장 주문 대화",
        fallbackEn: "Delivery and store order conversations",
      }),
      count: orderChatUnread,
      danger: orderChatUnread > 0,
    },
    {
      id: "store-inquiry",
      href: OwnerRoutes.inquiries(storeId),
      icon: HelpCircle,
      label: safeT("biz_care_store_inquiry", {
        fallbackKo: "매장 문의",
        fallbackEn: "Store inquiry",
      }),
      sub: safeT("biz_care_store_inquiry_desc", {
        fallbackKo: "이 매장으로 온 문의",
        fallbackEn: "Inquiries sent to this store",
      }),
      count: storeOpen,
      danger: storeOpen > 0,
    },
    {
      id: "customer-center",
      href: customerCenterHref,
      icon: Headphones,
      label: safeT("biz_care_customer_center", {
        fallbackKo: "고객센터",
        fallbackEn: "Customer center",
      }),
      sub: safeT("biz_care_customer_center_desc", {
        fallbackKo: "관리자 쪽지 · 1:1 문의",
        fallbackEn: "Admin messages and 1:1 support",
      }),
      count: adminUnread,
      danger: adminUnread > 0,
    },
  ];

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
        {safeT("biz_care_home_hint", {
          fallbackKo: "관리자 쪽지·1:1 문의는 「고객센터」에서 받고 답장합니다.",
          fallbackEn: "Receive and reply to admin notes in Customer Center.",
        })}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {cells.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.id}
              href={c.href}
              prefetch={false}
              data-owner-home-care-entry={c.id}
              className="flex min-h-[88px] items-start gap-2 rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-tan-soft)] p-2.5 active:bg-[var(--biz-primary-soft)]"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-rect bg-[var(--biz-app-bg)]">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`flex items-center justify-between gap-1 ${ownerDashTypography.cellTitle}`}>
                  <span className="truncate">{c.label}</span>
                  {c.count > 0 ? (
                    <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {c.count > 99 ? "99+" : c.count}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`mt-0.5 block ${ownerDashTypography.helper} ${c.danger ? "font-medium text-[#DC2626]" : ""}`}
                >
                  {c.sub}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
