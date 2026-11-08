"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle, HelpCircle, Headphones, Star, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { OWNER_ADMIN_LIST_CARD_CLASS } from "@/lib/business/owner-admin-list-ui";
import { OwnerCta } from "@/lib/business/owner-cta-classes";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { useOwnerFabOrderChatBadgeCount } from "@/lib/chats/use-owner-hub-badge-total";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { resolveOwnerActiveStoreIdFromOwnedList } from "@/lib/delivery/owner/resolve-owner-active-store";
import { listOwnerCustomerHubEntries } from "@/lib/business/owner-nav-registry";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";
import { parseOwnerStoreOpsSnapshotFromJson } from "@/lib/stores/owner-store-ops-snapshot";
import { useSupportRequesterUnread } from "@/lib/support/use-support-requester-unread";

type UnreadState = {
  storeInquiry: number;
  reviewsNeedReply: number;
};

const ICON_BY_ENTRY = {
  "order-chat": MessageCircle,
  "store-inquiry": HelpCircle,
  reviews: Star,
  "customer-center": Headphones,
} as const;

/**
 * Owner Customers hub — STORE↔CUSTOMER entries separate from OWNER↔DIBAY Support.
 */
export function OwnerCustomerCareHubView() {
  const { t, safeT } = useI18n();
  const sp = useSearchParams();
  const storeIdParam = sp.get("storeId");
  const orderChatUnread = useOwnerFabOrderChatBadgeCount();
  const [unread, setUnread] = useState<UnreadState>({
    storeInquiry: 0,
    reviewsNeedReply: 0,
  });
  const [resolvedStoreId, setResolvedStoreId] = useState<string | null>(storeIdParam);

  const loadBadges = useCallback(async () => {
    let sid = (storeIdParam ?? "").trim();
    if (!sid) {
      const { status, json } = await fetchMeStoresListDeduped();
      const stores = (json as { stores?: { id?: string }[] } | null)?.stores;
      if (status === 200 && Array.isArray(stores)) {
        const owned = stores
          .map((s) => ({ id: String(s.id ?? "").trim() }))
          .filter((s) => s.id);
        sid = resolveOwnerActiveStoreIdFromOwnedList(owned, null) ?? "";
      }
    }
    setResolvedStoreId(sid || null);

    let storeInquiry = 0;
    if (sid) {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/inquiries`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        inquiries?: { status?: string }[];
      };
      if (res.ok && j.ok && Array.isArray(j.inquiries)) {
        storeInquiry = j.inquiries.filter((r) => String(r.status ?? "") === "open").length;
      }
    }

    let reviewsNeedReply = 0;
    if (sid) {
      const counts = await fetchStoreOrderCountsDeduped(sid, { force: false });
      if (counts.status === 200) {
        const snap = parseOwnerStoreOpsSnapshotFromJson(counts.json);
        reviewsNeedReply = Math.max(0, Number(snap?.reviews_need_reply_count) || 0);
      }
    }

    setUnread({ storeInquiry, reviewsNeedReply });
  }, [storeIdParam]);

  useEffect(() => {
    void loadBadges();
  }, [loadBadges]);

  const storeId = resolvedStoreId ?? storeIdParam;
  // B6 — 「DIBAY 고객센터」 badge = this store's OWNER support cases unread (was legacy notes).
  const customerCenterUnread = useSupportRequesterUnread({
    audience: "OWNER",
    storeId: storeIdParam?.trim() || storeId,
  });
  const hubEntries = listOwnerCustomerHubEntries(storeIdParam?.trim() || storeId);

  const storeCustomerEntries = hubEntries.filter((e) => e.audience === "store_customer");
  const dibayEntries = hubEntries.filter((e) => e.audience === "dibay_support");

  const badgeFor = (id: string): number => {
    if (id === "order-chat") return orderChatUnread;
    if (id === "store-inquiry") return unread.storeInquiry;
    if (id === "reviews") return unread.reviewsNeedReply;
    if (id === "customer-center") return customerCenterUnread;
    return 0;
  };

  const renderEntry = (e: (typeof hubEntries)[number]) => {
    const Icon = ICON_BY_ENTRY[e.id];
    const badge = badgeFor(e.id);
    return (
      <li key={e.id}>
        <Link
          href={e.href}
          className={`${OWNER_ADMIN_LIST_CARD_CLASS} flex items-center gap-3`}
          data-owner-care-entry={e.id}
          data-owner-care-audience={e.audience}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-ui-rect bg-sam-app text-sam-fg">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {safeT(e.titleKey, {
                fallbackKo:
                  e.id === "order-chat"
                    ? "주문 채팅"
                    : e.id === "store-inquiry"
                      ? "매장 문의"
                      : e.id === "reviews"
                        ? "리뷰"
                        : "DIBAY 고객센터",
                fallbackEn:
                  e.id === "order-chat"
                    ? "Order chat"
                    : e.id === "store-inquiry"
                      ? "Store inquiry"
                      : e.id === "reviews"
                        ? "Reviews"
                        : "DIBAY Support",
              })}
            </span>
            <span className="mt-0.5 block text-xs text-sam-muted">
              {safeT(e.descKey, {
                fallbackKo:
                  e.id === "order-chat"
                    ? "배달·매장 주문 대화"
                    : e.id === "store-inquiry"
                      ? "이 매장으로 온 문의"
                      : e.id === "reviews"
                        ? "고객 리뷰 · 답글"
                        : "DIBAY 고객센터 · 상담 내역",
                fallbackEn:
                  e.id === "order-chat"
                    ? "Delivery and store order conversations"
                    : e.id === "store-inquiry"
                      ? "Inquiries sent to this store"
                      : e.id === "reviews"
                        ? "Customer reviews and replies"
                        : "DIBAY Support and history",
              })}
            </span>
            {badge > 0 ? (
              <span className="mt-1 block text-xs font-semibold text-sam-danger" data-owner-care-pending={e.id}>
                {e.id === "order-chat"
                  ? t("owner_copy_care_badge_order_chat", { count: String(badge) })
                  : e.id === "store-inquiry"
                    ? t("owner_copy_care_badge_store_inquiry", { count: String(badge) })
                    : e.id === "reviews"
                      ? t("owner_copy_care_badge_reviews", { count: String(badge) })
                      : t("owner_copy_care_badge_support", { count: String(badge) })}
              </span>
            ) : null}
          </span>
          {badge > 0 ? (
            <span
              className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-sam-danger px-1.5 py-0.5 text-[10px] font-bold text-sam-on-primary"
              data-owner-care-badge={e.id}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          ) : (
            <span className={`${OwnerCta.tertiary} min-h-9 shrink-0 px-2.5 text-xs`}>
              {t("owner_copy_care_open")}
              <ChevronRight className="h-4 w-4 opacity-70" aria-hidden />
            </span>
          )}
          {badge > 0 ? (
            <span className={`${OwnerCta.secondary} min-h-9 shrink-0 whitespace-nowrap px-2.5 text-xs`}>
              {t("owner_copy_care_handle_now")}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </span>
          ) : null}
        </Link>
      </li>
    );
  };

  return (
    <div className={`${OWNER_STORE_STACK_Y_CLASS} pb-8`} data-owner-customer-care-hub="1">
      {/* 제목은 전역 헤더 1곳 · 개발자 문구 삭제 (OA-09·OA-10·UN-07 · 2026-11-03) */}
      {(() => {
        const pendingTotal =
          orderChatUnread + unread.storeInquiry + unread.reviewsNeedReply + customerCenterUnread;
        if (pendingTotal <= 0) return null;
        return (
          <div
            className="rounded-ui-rect border border-sam-danger/25 bg-sam-danger-soft px-3 py-2.5"
            data-owner-care-action-required="1"
          >
            <p className="text-sm font-semibold text-sam-danger">
              {t("owner_copy_care_pending_total", { count: String(pendingTotal) })}
            </p>
          </div>
        );
      })()}

      <OwnerStoreAdminDashSection
        title={safeT("biz_care_section_store_customer")}
      >
        <ul className="space-y-3">{storeCustomerEntries.map(renderEntry)}</ul>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={t("owner_s4_title_cs_center")}
      >
        <ul className="space-y-3">{dibayEntries.map(renderEntry)}</ul>
      </OwnerStoreAdminDashSection>
    </div>
  );
}
