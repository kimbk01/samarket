"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { pickPreferredOwnerStore } from "@/lib/stores/owner-lite-external-store";
import { buildBusinessAdminSidebar } from "@/lib/business/business-admin-nav";
import { OwnerHubMainMenu } from "@/components/business/owner/OwnerHubMainMenu";
import { StoresOwnerStackHeader } from "@/components/business/owner/StoresOwnerStackHeader";
import { BusinessAdminOpenToggle } from "@/components/business/admin/BusinessAdminOpenToggle";
import { BusinessStatusBadge } from "@/components/business/admin/BusinessStatusBadge";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import { useOwnerCommerceNotificationUnreadCount } from "@/hooks/useOwnerCommerceNotificationUnreadCount";
import { storeRowCanSell } from "@/lib/business/store-can-sell";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";

export function OwnerHubShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/stores/owner";
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get("storeId")?.trim() ?? "";

  const [stores, setStores] = useState<StoreRow[] | null>(null);
  const [orderAlertsBadge, setOrderAlertsBadge] = useState(0);

  const reloadStores = useCallback(async () => {
    try {
      const { status, json: raw } = await fetchMeStoresListDeduped();
      const json = raw as { ok?: boolean; stores?: StoreRow[] };
      if (status === 401 || !json?.ok || !Array.isArray(json.stores)) {
        setStores([]);
        return;
      }
      setStores(json.stores as StoreRow[]);
    } catch {
      setStores([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await reloadStores();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadStores]);

  const selectedRow = useMemo(() => {
    if (!stores || stores.length === 0) return null;
    const byParam =
      storeIdParam.length > 0 ? stores.find((s) => s.id === storeIdParam) : undefined;
    return byParam ?? pickPreferredOwnerStore(stores) ?? stores[0]!;
  }, [stores, storeIdParam]);

  const orderCountsStoreId =
    selectedRow &&
    String(selectedRow.approval_status) === "approved" &&
    selectedRow.is_visible === true &&
    storeRowCanSell(selectedRow)
      ? selectedRow.id
      : null;

  useEffect(() => {
    if (!orderCountsStoreId) {
      setOrderAlertsBadge(0);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const { json: raw } = await fetchStoreOrderCountsDeduped(orderCountsStoreId);
        const j = raw as {
          ok?: boolean;
          refund_requested_count?: unknown;
          pending_accept_count?: unknown;
        };
        if (cancelled || !j?.ok) {
          if (!cancelled) setOrderAlertsBadge(0);
          return;
        }
        const refund = Math.max(0, Math.floor(Number(j.refund_requested_count) || 0));
        const pending = Math.max(0, Math.floor(Number(j.pending_accept_count) || 0));
        setOrderAlertsBadge(refund + pending);
      } catch {
        if (!cancelled) setOrderAlertsBadge(0);
      }
    };
    void tick();
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void tick();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [orderCountsStoreId]);

  const shopName = selectedRow?.store_name?.trim() || "매장";
  const shopInitial = shopName.slice(0, 1) || "샵";
  const ownerCommerceUnread = useOwnerCommerceNotificationUnreadCount();

  const navCtx = useMemo(() => {
    if (!selectedRow) {
      return {
        storeId: "",
        slug: "",
        approvalStatus: "",
        isVisible: false,
        canSell: false,
        orderAlertsBadge: 0,
      };
    }
    return {
      storeId: selectedRow.id,
      slug: selectedRow.slug ?? "",
      approvalStatus: String(selectedRow.approval_status),
      isVisible: selectedRow.is_visible === true,
      canSell: storeRowCanSell(selectedRow),
      orderAlertsBadge,
    };
  }, [selectedRow, orderAlertsBadge]);

  const sections = useMemo(() => buildBusinessAdminSidebar(navCtx), [navCtx]);

  const showInlineOwnerNav = Boolean(selectedRow);

  return (
    <div className="min-h-screen min-w-0 bg-sam-app">
      <StoresOwnerStackHeader
        variant="hub"
        backHref="/mypage/section/store/manage"
        shopName={shopName}
        hubSubtitle="매장 운영 센터"
        rightSlot={
          <Link
            href={`/stores/owner/notifications?${searchParams.toString()}`}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
            aria-label="알림"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {ownerCommerceUnread != null && ownerCommerceUnread > 0 ? (
              <span className={`${OWNER_HUB_BADGE_DOT_CLASS} ring-sam-surface/80`}>
                {ownerCommerceUnread > 99 ? "99+" : ownerCommerceUnread}
              </span>
            ) : null}
          </Link>
        }
      />

      <main className="mx-auto w-full max-w-6xl min-w-0 px-3 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] pt-[calc(env(safe-area-inset-top,0px)+3.5rem+0.75rem)] sm:px-4 lg:pb-8">
        {showInlineOwnerNav ?
          <>
            <section
              aria-labelledby="owner-hub-main-nav-heading"
              className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm"
            >
              <h2 id="owner-hub-main-nav-heading" className="sr-only">
                매장 운영 메뉴
              </h2>
              <div className="border-b border-sam-border-soft px-3 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#f9ce34,#ee2a7b,#6228d7)] sam-text-body font-semibold text-white">
                    {shopInitial}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate sam-text-body font-semibold text-sam-fg">{shopName}</p>
                    <p className="sam-text-xxs text-sam-muted">매장 운영 센터</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {selectedRow?.is_visible === true ?
                    <BusinessStatusBadge tone="success">공개중</BusinessStatusBadge>
                  : <BusinessStatusBadge tone="muted">비공개</BusinessStatusBadge>}
                  {selectedRow && String(selectedRow.approval_status) === "approved" ?
                    <BusinessAdminOpenToggle row={selectedRow} onUpdated={() => void reloadStores()} />
                  : <BusinessStatusBadge tone="warning">심사·준비</BusinessStatusBadge>}
                </div>
              </div>
              <div className="px-1 py-3">
                <OwnerHubMainMenu sections={sections} pathname={pathname} />
              </div>
              <div className="border-t border-sam-border-soft p-3">
                <Link
                  href="/my"
                  className="block rounded-ui-rect px-3 py-2 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
                >
                  ← 내 정보(홈)
                </Link>
              </div>
            </section>

            <section
              aria-labelledby="owner-hub-summary-heading"
              className="mt-6 border-t border-sam-border-soft pt-6"
            >
              <h2 id="owner-hub-summary-heading" className="mb-4 sam-text-body-lg font-semibold text-sam-fg">
                운영 요약
              </h2>
              {children}
            </section>
          </>
        : children}
      </main>
    </div>
  );
}
