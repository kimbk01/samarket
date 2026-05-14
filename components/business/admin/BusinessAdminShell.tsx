"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildBusinessAdminSidebar } from "@/lib/business/business-admin-nav";
import { getBusinessAdminPageTitle } from "@/lib/business/business-admin-page-title";
import { storeRowCanSell } from "@/lib/business/store-can-sell";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { readCachedMeAddressList } from "@/lib/addresses/address-list-client-cache";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { formatPhAddressCardOneLinePlain } from "@/lib/addresses/ph-address-display";
import {
  buildAddressManagementListPrimaryLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";
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
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import {
  emitOwnerBasicInfoLeave,
  getOwnerBasicInfoDirty,
  isOwnerStoreAdminDirtyGuardPath,
} from "@/lib/business/owner-basic-info-guard";
import { setStoreOwnerMainBottomNavSuppressed } from "@/lib/business/store-owner-main-bottom-nav-suppress";
import { useIsMobileViewport } from "@/hooks/use-is-mobile-viewport";
import { ChevronRight, MapPin } from "lucide-react";

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
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get("storeId")?.trim() ?? "";

  const [stores, setStores] = useState<StoreRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  /** md 이상: 우측 도킹 패널 — 기본 펼침, 접으면 본문 전폭 */
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [linkedStoreAddressRow, setLinkedStoreAddressRow] = useState<UserAddressDTO | null>(null);
  /** 운영 사이드 내비 스크롤 — 열 때 내부 목록은 항상 맨 위 */
  const sidebarNavScrollRef = useRef<HTMLDivElement | null>(null);
  /** 모바일 드로어용: 닫을 때 복원할 `window` 세로 스크롤 (body 고정 잠금과 짝) */
  const mobileOwnerDrawerLockYRef = useRef(0);
  /** 클라이언트 마운트 후에만 `body` 포털 — SSR·하이드레이션과 `useIsMobileViewport` 스냅샷 정합 */
  const [ownerBizDrawerPortalReady, setOwnerBizDrawerPortalReady] = useState(false);
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

  useLayoutEffect(() => {
    setOwnerBizDrawerPortalReady(true);
  }, []);

  useEffect(() => {
    if (isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

  const selectedRow = useMemo(() => {
    if (!stores || stores.length === 0) return null;
    const byParam =
      storeIdParam.length > 0 ? stores.find((s) => s.id === storeIdParam) : undefined;
    return byParam ?? pickPreferredOwnerStore(stores) ?? stores[0]!;
  }, [stores, storeIdParam]);

  const selectedStoreId = selectedRow?.id?.trim() ?? "";

  useEffect(() => {
    const sid = selectedStoreId.trim();
    if (!sid) {
      setLinkedStoreAddressRow(null);
      return;
    }
    /** 네트워크 호출 금지 — 운영 셸에서 목록 API는 체감 지연을 키움. 세션 캐시·주소 업데이트 이벤트만 사용 */
    function syncLinkedRowFromSessionCache(): void {
      const cached = readCachedMeAddressList();
      const row =
        cached?.find(
          (address) =>
            address.labelType === "shop" && (address.linkedStoreId?.trim() ?? "") === sid,
        ) ?? null;
      setLinkedStoreAddressRow(row);
    }
    syncLinkedRowFromSessionCache();
    const onAddressesUpdated = () => syncLinkedRowFromSessionCache();
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [selectedStoreId]);

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

  /** 모바일 햄버거로 운영 사이드 드로어가 열리면 전역 BottomNav 가 겹치지 않게 숨김 */
  useEffect(() => {
    const open = isMobile && mobileMenuOpen;
    setStoreOwnerMainBottomNavSuppressed(open);
    return () => {
      setStoreOwnerMainBottomNavSuppressed(false);
    };
  }, [isMobile, mobileMenuOpen]);

  /**
   * 모바일 전용: 드로어 열릴 때 배경 스크롤 잠금.
   * `overflow:hidden` 만 쓰면 WebKit(모바일 Safari 등)에서 문서 스크롤과 `position:fixed` 패널이
   * 어긋나 사이드 상단(매장 헤더·토글)이 뷰포트 밖으로 밀린다. 본문을 `position:fixed` + `top:-y`로
   * 고정하고, 닫을 때 `scrollTo`로 이전 위치를 복원한다.
   */
  useLayoutEffect(() => {
    if (!isMobile || !mobileMenuOpen) return;
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    mobileOwnerDrawerLockYRef.current = y;

    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    };

    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.left = prev.bodyLeft;
      body.style.right = prev.bodyRight;
      body.style.width = prev.bodyWidth;
      const restoreY = mobileOwnerDrawerLockYRef.current;
      requestAnimationFrame(() => {
        window.scrollTo(0, restoreY);
      });
    };
  }, [isMobile, mobileMenuOpen]);

  useLayoutEffect(() => {
    const shouldResetNavScroll =
      (isMobile && mobileMenuOpen) || (!isMobile && desktopSidebarOpen);
    if (!shouldResetNavScroll) return;
    const el = sidebarNavScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    el.scrollLeft = 0;
  }, [isMobile, mobileMenuOpen, desktopSidebarOpen]);

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

  const sidebarAddressLabel = formatOwnerSidebarAddress(selectedRow, linkedStoreAddressRow);

  const sidebarBody = (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col bg-[var(--biz-card-bg)]">
      <div className="border-b border-sam-border-soft bg-[var(--biz-card-bg)] px-3 py-4">
        <div className="flex items-center gap-3">
          <OwnerHubStoreAvatar profileImageUrl={selectedRow.profile_image_url} shopName={shopName} />
          <div className="min-w-0">
            <p className="truncate sam-text-body font-semibold text-sam-fg">{shopName}</p>
            <p className="sam-text-xxs text-sam-muted">매장 운영 센터</p>
          </div>
        </div>
        <div className="mt-3 flex flex-nowrap items-center gap-3">
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
      <div
        ref={sidebarNavScrollRef}
        className="flex-1 overflow-y-auto bg-[var(--biz-card-bg)] px-1 py-3 max-md:min-h-0 max-md:overscroll-y-contain max-md:[-webkit-overflow-scrolling:touch]"
      >
        <BusinessAdminSidebar
          sections={sections}
          pathname={pathname}
          onNavigate={() => setMobileMenuOpen(false)}
          onDirtyNavBlocked={() => setMobileMenuOpen(false)}
        />
      </div>
      <div className="border-t border-sam-border-soft bg-[var(--biz-card-bg)] p-3">
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
    </div>
  );

  /** 모바일(`max-md`): 오버레이 드로어 + 뷰포트 높이·내부 스크롤. `md`+: 기존 sticky 우측 패널(태블릿·가로). */
  const asideClassName = [
    "flex flex-col border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] transition-[transform,width] duration-200 ease-out max-md:[backdrop-filter:none]",
    "max-md:min-h-0 max-md:overflow-hidden max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-[1003] max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:w-[280px] max-md:max-w-[88vw] max-md:border-l max-md:shadow-xl",
    mobileMenuOpen ? "max-md:translate-x-0" : "max-md:translate-x-full",
    "md:relative md:shrink-0 md:z-0 md:h-screen md:sticky md:top-0 md:border-l md:shadow-none md:max-w-none",
    desktopSidebarOpen ? "md:w-[260px]" : "md:w-0 md:min-w-0 md:overflow-hidden md:border-transparent",
  ].join(" ");

  /**
   * 모바일: `AppRouteTransition`·헤더 스택 래퍼 등 조상에 `transform` 이 있으면 `position:fixed` 가
   * 뷰포트가 아닌 그 조상에 묶여 문서 스크롤과 같이 움직인다. 드로어·딤은 `document.body` 직계로 올려
   * 본문과 스크롤 맥락을 분리한다.
   */
  const mobileOwnerDrawerPortaled = ownerBizDrawerPortalReady && isMobile;
  const mobileOwnerOverlay =
    isMobile && mobileMenuOpen ?
      /**
       * 스크림: 뷰포트 전체(`inset-0`)를 동일한 불투명도로 덮는다. 드로어는 DOM·z-index(1003)로 그 위에만 올라가며,
       * `right: min(...)` 로 잘라 내는 방식은 오른쪽에 딤이 비어 본문이 그대로 비치는 버그를 만든다.
       */
      <div
        role="button"
        tabIndex={-1}
        aria-label="메뉴 닫기"
        className="fixed inset-0 z-[1002] m-0 min-h-[100dvh] min-h-[100svh] w-full max-w-[100vw] cursor-pointer touch-none border-0 bg-black/45 p-0 [overscroll-behavior:none] md:hidden"
        onClick={() => setMobileMenuOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setMobileMenuOpen(false);
          }
        }}
      />
    : null;
  const ownerAdminAside = (
    <aside className={asideClassName}>
          {/** 모바일 드로어 상단 — `StoresOwnerStackHeader` 와 동일 `h-14`, 주소는 최대 2줄 + 말줄임 */}
          <div className="flex h-14 min-h-14 max-h-14 shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-0 md:hidden">
            {sidebarAddressLabel ? (
              <div
                className="flex h-full min-h-0 min-w-0 flex-1 items-center gap-1.5 overflow-hidden pr-1 sam-text-xxs font-medium leading-tight text-sam-muted"
                title={sidebarAddressLabel}
              >
                <MapPin className="h-4 w-4 shrink-0 text-signature" strokeWidth={2} aria-hidden />
                <span className="min-w-0 flex-1 break-words line-clamp-2">{sidebarAddressLabel}</span>
              </div>
            ) : (
              <span className="min-w-0 flex-1" aria-hidden />
            )}
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
              aria-label="메뉴 닫기"
              onClick={() => setMobileMenuOpen(false)}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="hidden shrink-0 items-center justify-end border-b border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-2 py-1.5 md:flex">
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
  );

  return (
    <BusinessAdminStoreProvider value={ctxValue}>
      {mobileOwnerDrawerPortaled ?
        createPortal(
          <div data-biz="1" className="contents">
            {mobileOwnerOverlay}
            {ownerAdminAside}
          </div>,
          document.body
        )
      : null}
      <div data-biz="1" className="flex min-h-screen min-w-0 flex-col bg-[var(--biz-app-bg)] md:flex-row-reverse">
        {!mobileOwnerDrawerPortaled ?
          <>
            {mobileOwnerOverlay}
            {ownerAdminAside}
          </>
        : null}

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

function cleanStoreAddressPart(v: string | null | undefined): string {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!s || s === "null" || s === "undefined") return "";
  return s;
}

function storeAddressPartKey(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function appendUniqueAddressPart(parts: string[], value: string | null | undefined) {
  const next = cleanStoreAddressPart(value);
  if (!next) return;
  const nextKey = storeAddressPartKey(next);
  if (!nextKey) return;

  const includedByExisting = parts.some((part) => {
    const key = storeAddressPartKey(part);
    return key && key.includes(nextKey);
  });
  if (includedByExisting) return;

  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const key = storeAddressPartKey(parts[i] ?? "");
    if (key && nextKey.includes(key)) parts.splice(i, 1);
  }
  parts.push(next);
}

function formatOwnerSidebarFullAddress(row: StoreRow): string {
  const parts: string[] = [];
  appendUniqueAddressPart(parts, row.detail_address);
  appendUniqueAddressPart(parts, row.address_line2);
  appendUniqueAddressPart(parts, row.formatted_address);
  appendUniqueAddressPart(parts, row.address_line1);
  appendUniqueAddressPart(parts, row.district);
  appendUniqueAddressPart(parts, row.city);
  appendUniqueAddressPart(parts, row.region);
  return parts.join(", ");
}

function formatOwnerSidebarAddressBookRow(row: UserAddressDTO): string {
  const countryCode = (row.countryCode ?? "PH").trim().toUpperCase();
  if (countryCode === "PH") {
    return formatPhAddressCardOneLinePlain(row);
  }
  return stripCountryFromAddressDisplayLine(
    buildAddressManagementListPrimaryLine(row),
    row.countryName,
  );
}

function formatOwnerSidebarAddress(store: StoreRow, linkedAddress: UserAddressDTO | null): string {
  const fromAddressBook = linkedAddress ? formatOwnerSidebarAddressBookRow(linkedAddress).trim() : "";
  return fromAddressBook || formatOwnerSidebarFullAddress(store);
}
