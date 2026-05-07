"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { pickPreferredOwnerStore } from "@/lib/stores/owner-lite-external-store";
import { buildBusinessAdminSidebar } from "@/lib/business/business-admin-nav";
import { BusinessAdminSidebar } from "@/components/business/admin/BusinessAdminSidebar";
import { BusinessAdminOpenToggle } from "@/components/business/admin/BusinessAdminOpenToggle";
import { BusinessStatusBadge } from "@/components/business/admin/BusinessStatusBadge";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import { useOwnerCommerceNotificationUnreadCount } from "@/hooks/useOwnerCommerceNotificationUnreadCount";
import { storeRowCanSell } from "@/lib/business/store-can-sell";

export function OwnerHubShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/stores/owner";
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get("storeId")?.trim() ?? "";

  const [stores, setStores] = useState<StoreRow[] | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { status, json: raw } = await fetchMeStoresListDeduped();
        const json = raw as { ok?: boolean; stores?: StoreRow[] };
        if (cancelled) return;
        if (status === 401 || !json?.ok || !Array.isArray(json.stores)) {
          setStores([]);
          return;
        }
        setStores(json.stores as StoreRow[]);
      } catch {
        if (!cancelled) setStores([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRow = useMemo(() => {
    if (!stores || stores.length === 0) return null;
    const byParam =
      storeIdParam.length > 0 ? stores.find((s) => s.id === storeIdParam) : undefined;
    return byParam ?? pickPreferredOwnerStore(stores) ?? stores[0]!;
  }, [stores, storeIdParam]);

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
      orderAlertsBadge: 0,
    };
  }, [selectedRow]);

  const sections = useMemo(() => buildBusinessAdminSidebar(navCtx), [navCtx]);

  const sidebarBody = (
    <>
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
          {selectedRow?.is_visible === true ? (
            <BusinessStatusBadge tone="success">공개중</BusinessStatusBadge>
          ) : (
            <BusinessStatusBadge tone="muted">비공개</BusinessStatusBadge>
          )}
          {selectedRow && String(selectedRow.approval_status) === "approved" ? (
            <BusinessAdminOpenToggle row={selectedRow} onUpdated={() => {}} />
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
      <div className="border-t border-sam-border-soft p-3">
        <Link
          href="/my"
          className="block rounded-ui-rect px-3 py-2 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
          onClick={() => setDrawerOpen(false)}
        >
          ← 내 정보(홈)
        </Link>
      </div>
    </>
  );

  return (
    <div className="min-h-screen min-w-0 bg-sam-app">
      <aside
        className={`fixed inset-y-0 right-0 z-[60] flex w-[280px] max-w-[88vw] flex-col border-l border-sam-border bg-sam-surface shadow-xl transition-transform duration-200 lg:hidden ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-end border-b border-sam-border-soft px-2 py-2">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
            aria-label="메뉴 닫기"
            onClick={() => setDrawerOpen(false)}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {sidebarBody}
      </aside>

      <BodyPortal>
        <header className="fixed inset-x-0 top-0 z-[55] border-b border-sam-border bg-sam-surface/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur-sm">
          <div className="mx-auto flex h-14 w-full min-w-0 max-w-6xl items-center gap-2 px-3 sm:px-4">
            <div className="min-w-0 flex-1">
              <p className="truncate sam-text-body font-semibold leading-tight text-sam-fg">{shopName}</p>
              <p className="truncate sam-text-xxs leading-tight text-sam-muted">매장 운영 센터</p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
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
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
                aria-label="메뉴 열기"
                onClick={() => setDrawerOpen((v) => !v)}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </header>
      </BodyPortal>

      <main className="mx-auto w-full max-w-6xl min-w-0 px-3 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] pt-[calc(env(safe-area-inset-top,0px)+3.5rem+0.75rem)] sm:px-4 lg:pb-8">
        {children}
      </main>
    </div>
  );
}

