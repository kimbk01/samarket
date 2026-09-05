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
import { listOwnerCustomerHubEntries } from "@/lib/business/owner-nav-registry";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";
import { parseOwnerStoreOpsSnapshotFromJson } from "@/lib/stores/owner-store-ops-snapshot";
import { ownerUiCopy } from "@/lib/business/owner-ui-copy";

type UnreadState = {
  storeInquiry: number;
  adminInbox: number;
  adminInquiry: number;
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
  const { safeT, language } = useI18n();
  const sp = useSearchParams();
  const storeIdParam = sp.get("storeId");
  const orderChatUnread = useOwnerFabOrderChatBadgeCount();
  const [unread, setUnread] = useState<UnreadState>({
    storeInquiry: 0,
    adminInbox: 0,
    adminInquiry: 0,
    reviewsNeedReply: 0,
  });
  const [resolvedStoreId, setResolvedStoreId] = useState<string | null>(storeIdParam);

  const loadBadges = useCallback(async () => {
    let sid = (storeIdParam ?? "").trim();
    if (!sid) {
      const { status, json } = await fetchMeStoresListDeduped();
      const stores = (json as { stores?: { id?: string }[] } | null)?.stores;
      if (status === 200 && Array.isArray(stores) && stores[0]?.id) {
        sid = String(stores[0].id);
      }
    }
    setResolvedStoreId(sid || null);

    const noteUnread = async (kind: "inbox" | "inquiry") => {
      const res = await fetch(`/api/me/admin-notes?kind=${kind}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        threads?: { member_unread_count?: number }[];
      };
      if (!res.ok || !j.ok || !Array.isArray(j.threads)) return 0;
      return j.threads.reduce((sum, th) => sum + Math.max(0, Number(th.member_unread_count) || 0), 0);
    };

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

    const [adminInbox, adminInquiry] = await Promise.all([noteUnread("inbox"), noteUnread("inquiry")]);
    setUnread({ storeInquiry, adminInbox, adminInquiry, reviewsNeedReply });
  }, [storeIdParam]);

  useEffect(() => {
    void loadBadges();
  }, [loadBadges]);

  const storeId = resolvedStoreId ?? storeIdParam;
  const customerCenterUnread = unread.adminInbox + unread.adminInquiry;
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
                  ? ownerUiCopy(language, `미확인 채팅 ${badge}건`, `${badge} unread chats`)
                  : e.id === "store-inquiry"
                    ? ownerUiCopy(language, `열린 문의 ${badge}건`, `${badge} open inquiries`)
                    : e.id === "reviews"
                      ? ownerUiCopy(language, `답글 필요 ${badge}건`, `${badge} need reply`)
                      : ownerUiCopy(language, `새 상담 ${badge}건`, `${badge} support updates`)}
              </span>
            ) : null}
          </span>
          {badge > 0 ? (
            <span
              className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white"
              data-owner-care-badge={e.id}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          ) : (
            <span className={`${OwnerCta.tertiary} min-h-9 shrink-0 px-2.5 text-xs`}>
              {ownerUiCopy(language, "열기", "Open")}
              <ChevronRight className="h-4 w-4 opacity-70" aria-hidden />
            </span>
          )}
          {badge > 0 ? (
            <span className={`${OwnerCta.secondary} min-h-9 shrink-0 whitespace-nowrap px-2.5 text-xs`}>
              {ownerUiCopy(language, "지금 처리", "Handle now")}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </span>
          ) : null}
        </Link>
      </li>
    );
  };

  return (
    <div className={`${OWNER_STORE_STACK_Y_CLASS} pb-8`} data-owner-customer-care-hub="1">
      <div className="space-y-1" data-owner-care-work-queue="1">
        <h1 className="text-lg font-semibold text-sam-fg">
          {ownerUiCopy(language, "고객 응대 큐", "Customer work queue")}
        </h1>
        <p className="text-xs text-sam-muted">
          {ownerUiCopy(
            language,
            "미읽음·대기 건수만 실제 데이터로 표시합니다. 매장 고객과 DIBAY 지원은 분리됩니다.",
            "Only real unread/waiting counts. Store customers stay separate from DIBAY Support."
          )}
        </p>
      </div>
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
              {ownerUiCopy(
                language,
                `지금 확인할 응대 ${pendingTotal}건`,
                `${pendingTotal} customer items need attention`
              )}
            </p>
            <p className="mt-0.5 text-xs text-sam-muted">
              {ownerUiCopy(
                language,
                "배지는 실제 unread/열림 건수만 표시합니다. 없는 숫자는 만들지 않습니다.",
                "Badges show real unread/open counts only — nothing invented."
              )}
            </p>
          </div>
        );
      })()}

      <OwnerStoreAdminDashSection
        title={safeT("biz_care_section_store_customer", {
          fallbackKo: "매장 고객",
          fallbackEn: "Store customers",
        })}
      >
        <ul className="space-y-3">{storeCustomerEntries.map(renderEntry)}</ul>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("biz_care_section_dibay_support", {
          fallbackKo: "DIBAY 고객센터",
          fallbackEn: "DIBAY Support",
        })}
      >
        <p className="mb-3 text-xs text-sam-muted">
          {safeT("biz_care_home_hint", {
            fallbackKo: "DIBAY 관리자 문의는 「고객센터」에서 Support로 연결됩니다.",
            fallbackEn: "Contact DIBAY admin via Customer Center → Support.",
          })}
        </p>
        <ul className="space-y-3">{dibayEntries.map(renderEntry)}</ul>
      </OwnerStoreAdminDashSection>
    </div>
  );
}
