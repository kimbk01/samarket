"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildBusinessAdminSidebar } from "@/lib/business/business-admin-nav";
import { getBusinessAdminPageTitle } from "@/lib/business/business-admin-page-title";
import { storeRowCanSell } from "@/lib/business/store-can-sell";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { pickPreferredOwnerStore } from "@/lib/stores/owner-lite-external-store";
import { BusinessAdminSidebar } from "@/components/business/admin/BusinessAdminSidebar";
import { BusinessAdminOpenToggle } from "@/components/business/admin/BusinessAdminOpenToggle";
import { BusinessAdminVisibleToggle } from "@/components/business/admin/BusinessAdminVisibleToggle";
import { BusinessStatusBadge } from "@/components/business/admin/BusinessStatusBadge";
import { useOwnerCommerceNotificationUnreadCount } from "@/hooks/useOwnerCommerceNotificationUnreadCount";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import { BusinessAdminStoreProvider } from "@/components/business/admin/business-admin-store-context";
import { StoresOwnerStackHeader } from "@/components/business/owner/StoresOwnerStackHeader";
import { OwnerHubStoreAvatar } from "@/components/business/owner/OwnerHubStoreAvatar";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { parsePostgresBool } from "@/lib/community-feed/parse-postgres-bool";
import {
  fetchStoreBannersDeduped,
  fetchStoreMenusDeduped,
  fetchStoreNoticesDeduped,
  fetchStorePublicBySlugDeduped,
  fetchStoreSummaryDeduped,
} from "@/lib/stores/store-delivery-api-client";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import {
  emitOwnerBasicInfoLeave,
  getOwnerBasicInfoDirty,
  isOwnerStoreAdminDirtyGuardPath,
} from "@/lib/business/owner-basic-info-guard";
import { setStoreOwnerMainBottomNavSuppressed } from "@/lib/business/store-owner-main-bottom-nav-suppress";
import { useIsMobileViewport } from "@/hooks/use-is-mobile-viewport";
import { ChevronRight } from "lucide-react";

export function BusinessAdminShell({
  children,
  entry = "guarded",
}: {
  children: React.ReactNode;
  /** `hub`: `/stores/owner` — 심사 전·매장 없음도 본문을 막지 않음. `guarded`: 기존 매장 관리 서브 라우트. */
  entry?: "hub" | "guarded";
}) {
  const isHub = entry === "hub";
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get("storeId")?.trim() ?? "";

  const [stores, setStores] = useState<StoreRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  /** md 이상: 우측 도킹 패널 — 기본 펼침, 접으면 본문 전폭 */
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [orderAlertsBadge, setOrderAlertsBadge] = useState(0);
  const isMobile = useIsMobileViewport();

  const ownerMainBottomPad = useMemo(() => {
    const f = resolveConditionalAppShellFlags(pathname, false);
    const p = pathname.split("?")[0]?.replace(/\/+$/, "") ?? "";
    const isStoreOwnerAdminSubroute = p.startsWith("/stores/owner/");
    if (f.showBottomNav) return "pb-4 sm:pb-5 lg:pb-6";
    if (isStoreOwnerAdminSubroute) {
      return "pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] sm:pb-3 md:pb-4 lg:pb-6";
    }
    return "pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-8";
  }, [pathname]);

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

  useEffect(() => {
    if (isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

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

  const prefetchSlug =
    selectedRow &&
    String(selectedRow.approval_status) === "approved" &&
    parsePostgresBool(selectedRow.is_visible, false) ?
      (selectedRow.slug ?? "").trim()
    : "";
  const prefetchCustomerHref =
    prefetchSlug.length > 0 ? `/stores/${encodeURIComponent(prefetchSlug)}` : null;

  useEffect(() => {
    if (!prefetchCustomerHref) return;
    try {
      router.prefetch(prefetchCustomerHref);
    } catch {
      /* noop */
    }
  }, [prefetchCustomerHref, router]);

  useEffect(() => {
    if (!prefetchCustomerHref || !prefetchSlug) return;
    void Promise.all([
      fetchStoreSummaryDeduped(prefetchSlug),
      fetchStoreMenusDeduped(prefetchSlug),
      fetchStorePublicBySlugDeduped(prefetchSlug),
      fetchStoreBannersDeduped(prefetchSlug),
      fetchStoreNoticesDeduped(prefetchSlug),
    ]).catch(() => {});
  }, [prefetchCustomerHref, prefetchSlug]);

  /** 모바일 햄버거로 운영 사이드 드로어가 열리면 전역 BottomNav 가 겹치지 않게 숨김 */
  useEffect(() => {
    const open = isMobile && mobileMenuOpen;
    setStoreOwnerMainBottomNavSuppressed(open);
    return () => {
      setStoreOwnerMainBottomNavSuppressed(false);
    };
  }, [isMobile, mobileMenuOpen]);

  /**
   * 모바일 전용(`useIsMobileViewport` = Tailwind `md` 미만): 드로어 열림 시 html/body 스크롤 잠금.
   * 태블릿·데스크톱(`md`+)에서는 이 effect 가 early-return 하며 레이아웃도 `aside`에 `max-md:` 만 적용한다.
   */
  useEffect(() => {
    if (!isMobile || !mobileMenuOpen) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [isMobile, mobileMenuOpen]);

  const hubPartialHeaderRight =
    storeIdParam.length > 0 ?
      <Link
        href={buildStoreOrdersHref({
          storeId: storeIdParam,
          ackOwnerNotifications: true,
        })}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
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
          <span className={`${OWNER_HUB_BADGE_DOT_CLASS} ring-sam-surface/80`}>
            {ownerCommerceUnread > 99 ? "99+" : ownerCommerceUnread}
          </span>
        ) : null}
      </Link>
    : null;

  const adminHeaderBackHref = useMemo(() => {
    if (isHub || !selectedRow) return undefined;
    return `/stores/owner?storeId=${encodeURIComponent(selectedRow.id)}`;
  }, [isHub, selectedRow]);

  const basicInfoBackIntercept = useCallback(() => {
    if (!isOwnerStoreAdminDirtyGuardPath(pathname)) return false;
    if (!getOwnerBasicInfoDirty()) return false;
    const sid = selectedRow?.id ?? storeIdParam;
    const href =
      adminHeaderBackHref ??
      (sid ? `/stores/owner?storeId=${encodeURIComponent(sid)}` : "/stores/owner");
    emitOwnerBasicInfoLeave({ href, kind: "back" });
    return true;
  }, [pathname, adminHeaderBackHref, selectedRow?.id, storeIdParam]);

  if (!isHub) {
    if (loadErr && (!stores || stores.length === 0)) {
      return (
        <div className="min-h-screen bg-sam-app px-4 py-8">
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
        <div className="min-h-screen bg-sam-app px-4 py-8">
          <p className="text-sm text-sam-muted">매장을 불러오는 중…</p>
        </div>
      );
    }
  }

  if (isHub && !selectedRow) {
    return (
      <div className="min-h-screen min-w-0 overflow-x-hidden bg-sam-app">
        <StoresOwnerStackHeader
          variant="hub"
          backHref="/mypage/section/store/manage"
          shopName={shopName}
          hubSubtitle="매장 운영 센터"
          rightSlot={<div className="flex shrink-0 items-center gap-1">{hubPartialHeaderRight}</div>}
        />
        <main
          className={`mx-auto w-full max-w-6xl min-w-0 bg-[var(--biz-app-bg)] px-3 pt-[calc(env(safe-area-inset-top,0px)+3.5rem+0.75rem)] sm:px-4 ${ownerMainBottomPad}`}
        >
          {children}
        </main>
      </div>
    );
  }

  if (!selectedRow) {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-8">
        <p className="text-sm text-sam-muted">매장을 불러오는 중…</p>
      </div>
    );
  }

  const headerRightSlot = (
    <>
      <Link
        href={buildStoreOrdersHref({
          storeId: selectedRow.id,
          ackOwnerNotifications: true,
        })}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
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
          <span className={`${OWNER_HUB_BADGE_DOT_CLASS} ring-sam-surface/80`}>
            {ownerCommerceUnread > 99 ? "99+" : ownerCommerceUnread}
          </span>
        ) : null}
      </Link>
      {publicStoreHref ?
        <Link
          href={publicStoreHref}
          className="flex h-10 w-10 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
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
      : null}
      {(isMobile || !desktopSidebarOpen) ?
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
          aria-label={isMobile ? "메뉴 열기" : "운영 메뉴 펼치기"}
          onClick={() => {
            if (isMobile) setMobileMenuOpen(true);
            else setDesktopSidebarOpen(true);
          }}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      : null}
    </>
  );

  const sidebarBody = (
    <>
      <div className="border-b border-sam-border-soft px-3 py-4">
        <div className="flex items-center gap-3">
          <OwnerHubStoreAvatar profileImageUrl={selectedRow.profile_image_url} shopName={shopName} />
          <div className="min-w-0">
            <p className="truncate sam-text-body font-semibold text-sam-fg">{shopName}</p>
            <p className="sam-text-xxs text-sam-muted">매장 운영 센터</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {String(selectedRow.approval_status) === "approved" ? (
            <>
              <BusinessAdminVisibleToggle row={selectedRow} onUpdated={() => void reloadStores()} />
              <BusinessAdminOpenToggle row={selectedRow} onUpdated={() => void reloadStores()} />
            </>
          ) : (
            <>
              {selectedRow.is_visible === true ? (
                <BusinessStatusBadge tone="success">공개중</BusinessStatusBadge>
              ) : (
                <BusinessStatusBadge tone="muted">비공개</BusinessStatusBadge>
              )}
              <BusinessStatusBadge tone="warning">심사·준비</BusinessStatusBadge>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-1 py-3 max-md:min-h-0 max-md:overscroll-y-contain max-md:[-webkit-overflow-scrolling:touch]">
        <BusinessAdminSidebar
          sections={sections}
          pathname={pathname}
          onNavigate={() => setMobileMenuOpen(false)}
          onDirtyNavBlocked={() => setMobileMenuOpen(false)}
        />
      </div>
      <div className="border-t border-sam-border-soft p-3">
        <Link
          href="/my"
          className="block rounded-ui-rect px-3 py-2 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
          onClick={(e) => {
            if (isOwnerStoreAdminDirtyGuardPath(pathname) && getOwnerBasicInfoDirty()) {
              e.preventDefault();
              emitOwnerBasicInfoLeave({ href: "/my", kind: "sidebar" });
            }
            setMobileMenuOpen(false);
          }}
        >
          ← 내 정보(홈)
        </Link>
      </div>
    </>
  );

  /** 모바일(`max-md`): 오버레이 드로어 + 뷰포트 높이·내부 스크롤. `md`+: 기존 sticky 우측 패널(태블릿·가로). */
  const asideClassName = [
    "flex flex-col border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] transition-[transform,width] duration-200 ease-out",
    "max-md:min-h-0 max-md:overflow-hidden max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-[60] max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:w-[280px] max-md:max-w-[88vw] max-md:border-l max-md:shadow-xl",
    mobileMenuOpen ? "max-md:translate-x-0" : "max-md:translate-x-full",
    "md:relative md:shrink-0 md:z-0 md:h-screen md:sticky md:top-0 md:border-l md:shadow-none md:max-w-none",
    desktopSidebarOpen ? "md:w-[260px]" : "md:w-0 md:min-w-0 md:overflow-hidden md:border-transparent",
  ].join(" ");

  return (
    <BusinessAdminStoreProvider value={ctxValue}>
      <div data-biz="1" className="flex min-h-screen min-w-0 flex-col bg-[var(--biz-app-bg)] md:flex-row-reverse">
        {isMobile && mobileMenuOpen ?
          <button
            type="button"
            className="fixed inset-0 z-[59] bg-black/45 backdrop-blur-[1px] md:hidden"
            aria-label="메뉴 닫기"
            onClick={() => setMobileMenuOpen(false)}
          />
        : null}
        <aside className={asideClassName}>
          <div className="flex items-center justify-end border-b border-[var(--biz-card-border)] px-2 py-2 md:hidden">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
              aria-label="메뉴 닫기"
              onClick={() => setMobileMenuOpen(false)}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="hidden shrink-0 items-center justify-end border-b border-[var(--biz-card-border)] px-2 py-1.5 md:flex">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
              aria-label="운영 메뉴 접기"
              onClick={() => setDesktopSidebarOpen(false)}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          </div>
          {sidebarBody}
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-[var(--biz-app-bg)] md:border-r md:border-sam-border-soft">
          <StoresOwnerStackHeader
            variant="admin"
            backHref={adminHeaderBackHref}
            backIntercept={basicInfoBackIntercept}
            backAriaLabel="운영 대시보드로"
            shopName={shopName}
            pageTitle={pageTitle}
            rightSlot={headerRightSlot}
          />

          <main
            className={`mx-auto w-full max-w-6xl bg-[var(--biz-app-bg)] px-3 pt-[calc(env(safe-area-inset-top,0px)+3.5rem+0.75rem)] sm:px-4 md:pt-[calc(env(safe-area-inset-top,0px)+3.5rem+1rem)] ${ownerMainBottomPad}`}
          >
            {children}
          </main>
        </div>
      </div>
    </BusinessAdminStoreProvider>
  );
}
