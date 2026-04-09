"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildBusinessAdminSidebar } from "@/lib/business/business-admin-nav";
import { getBusinessAdminPageTitle } from "@/lib/business/business-admin-page-title";
import { storeRowCanSell } from "@/lib/business/store-can-sell";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { pickPreferredOwnerStore } from "@/lib/stores/owner-lite-external-store";
import { useOwnerCommerceNotificationUnreadCount } from "@/hooks/useOwnerCommerceNotificationUnreadCount";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import { BusinessAdminSidebar } from "@/components/business/admin/BusinessAdminSidebar";
import { BusinessAdminOpenToggle } from "@/components/business/admin/BusinessAdminOpenToggle";
import { BusinessStatusBadge } from "@/components/business/admin/BusinessStatusBadge";
import { BusinessAdminStoreProvider } from "@/components/business/admin/business-admin-store-context";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

export function BusinessAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get("storeId")?.trim() ?? "";

  const [stores, setStores] = useState<StoreRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [orderAlertsBadge, setOrderAlertsBadge] = useState(0);

  const reloadStores = useCallback(async () => {
    try {
      const { status, json: raw } = await fetchMeStoresListDeduped();
      const json = raw as { ok?: boolean; stores?: StoreRow[]; error?: string };
      if (status === 401 || !json?.ok) {
        setStores([]);
        setLoadErr(typeof json?.error === "string" ? json.error : "load_failed");
        return;
      }
      setStores((json.stores ?? []) as StoreRow[]);
      setLoadErr(null);
    } catch {
      setStores([]);
      setLoadErr("network_error");
    }
  }, []);

  useEffect(() => {
    void reloadStores();
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
  const pageTitle = getBusinessAdminPageTitle(pathname);
  const shopName = selectedRow?.store_name?.trim() || "매장";
  const shopInitial = shopName.slice(0, 1) || "샵";
  const publicStoreHref =
    selectedRow &&
    String(selectedRow.approval_status) === "approved" &&
    selectedRow.is_visible === true &&
    selectedRow.slug
      ? `/stores/${encodeURIComponent(selectedRow.slug)}`
      : null;
  const ownerCommerceUnread = useOwnerCommerceNotificationUnreadCount();

  const ctxValue = useMemo(
    () => ({
      storeRow: selectedRow,
      reloadStores,
    }),
    [selectedRow, reloadStores]
  );

  if (loadErr && (!stores || stores.length === 0)) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] px-4 py-8">
        <p className="text-sm text-red-600">매장 정보를 불러오지 못했습니다. ({loadErr})</p>
        <button
          type="button"
          className="mt-2 text-sm font-medium text-signature underline"
          onClick={() => void reloadStores()}
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!selectedRow) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] px-4 py-8">
        <p className="text-sm text-gray-600">매장을 불러오는 중…</p>
      </div>
    );
  }

  const adminBackFallbackHref = `/my/business?storeId=${encodeURIComponent(selectedRow.id)}`;

  const sidebarBody = (
    <>
      <div className="border-b border-gray-100 px-3 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#f9ce34,#ee2a7b,#6228d7)] text-[15px] font-semibold text-white">
            {shopInitial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-gray-900">{shopName}</p>
            <p className="text-[11px] text-gray-500">매장 운영 센터</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {selectedRow.is_visible === true ? (
            <BusinessStatusBadge tone="success">공개중</BusinessStatusBadge>
          ) : (
            <BusinessStatusBadge tone="muted">비공개</BusinessStatusBadge>
          )}
          {String(selectedRow.approval_status) === "approved" ? (
            <BusinessAdminOpenToggle row={selectedRow} onUpdated={() => void reloadStores()} />
          ) : (
            <BusinessStatusBadge tone="warning">심사·준비</BusinessStatusBadge>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-1 py-3">
        <BusinessAdminSidebar
          sections={sections}
          pathname={pathname}
          onNavigate={() => setDrawerOpen(false)}
        />
      </div>
      <div className="border-t border-gray-100 p-3">
        <Link
          href="/my"
          className="block rounded-ui-rect px-3 py-2 text-[14px] font-medium text-gray-700 hover:bg-gray-50"
          onClick={() => setDrawerOpen(false)}
        >
          ← 내 정보(홈)
        </Link>
      </div>
    </>
  );

  return (
    <BusinessAdminStoreProvider value={ctxValue}>
      <div className="flex min-h-screen flex-col bg-[#F0F2F5] lg:flex-row">
        {drawerOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            aria-label="메뉴 닫기"
            onClick={() => setDrawerOpen(false)}
          />
        ) : null}

        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[88vw] flex-col border-r border-gray-200 bg-white shadow-xl transition-transform duration-200 lg:sticky lg:top-0 lg:z-0 lg:h-screen lg:max-w-none lg:w-[260px] lg:translate-x-0 lg:shadow-none ${
            drawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          {sidebarBody}
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
            <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
              <AppBackButton
                backHref={adminBackFallbackHref}
                ariaLabel="이전 화면으로"
              />
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-800 hover:bg-gray-100 lg:hidden"
                aria-label="메뉴 열기"
                onClick={() => setDrawerOpen(true)}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="min-w-0 flex-1 lg:hidden">
                {pageTitle ? (
                  <h1 className="truncate text-[16px] font-semibold text-gray-900">{pageTitle}</h1>
                ) : (
                  <h1 className="truncate text-[16px] font-semibold text-gray-900">운영 대시보드</h1>
                )}
                <p className="truncate text-[11px] text-gray-500">{shopName}</p>
              </div>
              <div className="hidden min-w-0 flex-1 items-baseline gap-3 lg:flex">
                {pageTitle ? (
                  <h1 className="text-[18px] font-semibold text-gray-900">{pageTitle}</h1>
                ) : (
                  <h1 className="text-[18px] font-semibold text-gray-900">운영 대시보드</h1>
                )}
                <span className="text-[13px] text-gray-500">{shopName}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={buildStoreOrdersHref({
                    storeId: selectedRow.id,
                    ackOwnerNotifications: true,
                  })}
                  className="relative flex h-11 w-11 items-center justify-center rounded-full text-gray-800 hover:bg-gray-100"
                  aria-label="배달 주문 알림"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                  {ownerCommerceUnread != null && ownerCommerceUnread > 0 ? (
                    <span className={`${OWNER_HUB_BADGE_DOT_CLASS} ring-white/80`}>
                      {ownerCommerceUnread > 99 ? "99+" : ownerCommerceUnread}
                    </span>
                  ) : null}
                </Link>
                {publicStoreHref ? (
                  <Link
                    href={publicStoreHref}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-gray-800 hover:bg-gray-100"
                    aria-label="고객 매장 페이지"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </Link>
                ) : null}
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-3 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:px-4 md:py-4 lg:pb-8">
            {children}
          </main>
        </div>
      </div>
    </BusinessAdminStoreProvider>
  );
}
