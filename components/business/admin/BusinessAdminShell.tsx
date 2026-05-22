"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { buildBusinessAdminSidebar, resolveBusinessAdminSidebar } from "@/lib/business/business-admin-nav";
import { getBusinessAdminPageTitle } from "@/lib/business/business-admin-page-title";
import { storeRowCanSell } from "@/lib/business/store-can-sell";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";
import {
  fetchMeStoresListDeduped,
  peekMeStoresListClientCache,
  parseStoreRowsFromMeStoresJson,
} from "@/lib/me/fetch-me-stores-deduped";
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
import { useOwnerCommerceNotificationUnreadCountDeferred } from "@/hooks/useOwnerCommerceNotificationUnreadCount";
import { useOwnerHubBadgeBreakdownWhenEnabled } from "@/lib/chats/use-owner-hub-badge-total";
import { useOwnerHubRuntime } from "@/components/business/owner/OwnerHubRuntimeProvider";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import { resolveOwnerOperationsCenterAttentionCount } from "@/lib/stores/owner-store-badge-display-policy";
import { BusinessAdminStoreProvider } from "@/components/business/admin/business-admin-store-context";
import { OwnerMobileAdminHeader } from "@/components/business/owner/OwnerMobileAdminHeader";
import { OwnerMobileAdminHeaderTrailingProvider } from "@/components/business/owner/OwnerMobileAdminHeaderTrailingContext";
import { OwnerStackPageSlideShell } from "@/components/business/owner/OwnerStackPageSlideShell";
import { OwnerMobileBottomNav } from "@/components/stores/owner/OwnerMobileBottomNav";
import { StoresOwnerStackHeader } from "@/components/business/owner/StoresOwnerStackHeader";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { isStoresOwnerStackPath } from "@/lib/business/owner-stack-path";
import { useOwnerMobileStackViewportLock } from "@/lib/business/use-owner-mobile-stack-viewport-lock";
import { buildStoreOpsMetaFromRow } from "@/lib/stores/owner-store-ops-snapshot";
import { OwnerHubStoreAvatar } from "@/components/business/owner/OwnerHubStoreAvatar";
import { resolveOwnerStoreNotificationsHref } from "@/lib/business/owner-store-notifications-route";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import {
  emitOwnerBasicInfoLeave,
  getOwnerBasicInfoDirty,
  isOwnerStoreAdminDirtyGuardPath,
} from "@/lib/business/owner-basic-info-guard";
import { isStoreOwnerAdminPathname } from "@/lib/business/owner-hub-path";
import {
  peekOwnerOrdersAttentionBridge,
  subscribeOwnerOrdersAttentionBridge,
} from "@/lib/business/owner-orders-attention-bridge";
import {
  getStoreOwnerMainBottomNavSuppressed,
  pushStoreOwnerMainBottomNavSuppressed,
  subscribeStoreOwnerMainBottomNavSuppressed,
} from "@/lib/business/store-owner-main-bottom-nav-suppress";
import { useOwnerCompactShellViewport } from "@/hooks/use-owner-compact-shell-viewport";
import { applyOwnerCompactShellBodyFlag } from "@/lib/business/owner-compact-shell-layout";
import {
  matchesOwnerCompactShellViewport,
  OWNER_COMPACT_SHELL_MAX_TW,
  OWNER_DESKTOP_SHELL_MIN_TW,
} from "@/lib/business/owner-compact-shell-viewport";
import { ChevronRight, MapPin } from "lucide-react";
import {
  OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS,
} from "@/lib/stores/owner-mobile-ui-tokens";
import { OWNER_COMPACT_SHELL_COLUMN_CLASS, OWNER_COMPACT_SHELL_MAIN_CLASS } from "@/lib/business/owner-compact-shell-layout";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

function readInitialStoresFromMeListCache(): StoreRow[] | null {
  const peek = peekMeStoresListClientCache();
  if (!peek || peek.status !== 200) return null;
  return parseStoreRowsFromMeStoresJson(peek.json);
}

export function BusinessAdminShell({
  children,
  entry = "guarded",
  initialStores = null,
}: {
  children: React.ReactNode;
  /** `hub`: `/stores/owner` — 심사 전·매장 없음도 본문을 막지 않음. `guarded`: 기존 매장 관리 서브 라우트. */
  entry?: "hub" | "guarded";
  /** RSC `layout` 선로딩 매장 목록 — 허브 첫 페인트 전 `GET /api/me/stores` 제거 */
  initialStores?: StoreRow[] | null;
}) {
  const { t } = useI18n();
  const isHub = entry === "hub";
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get("storeId")?.trim() ?? "";

  const hubRuntime = useOwnerHubRuntime();
  const [stores, setStores] = useState<StoreRow[] | null>(() => {
    if (initialStores != null && initialStores.length > 0) return initialStores;
    return readInitialStoresFromMeListCache();
  });
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  /** md 이상: 우측 도킹 패널 — 기본 펼침, 접으면 본문 전폭 */
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [linkedStoreAddressRow, setLinkedStoreAddressRow] = useState<UserAddressDTO | null>(null);
  /** 운영 사이드 내비 스크롤 — 열 때 내부 목록은 항상 맨 위 */
  const sidebarNavScrollRef = useRef<HTMLDivElement | null>(null);
  /** 모바일 드로어용: 닫을 때 복원할 `window` 세로 스크롤 (body 고정 잠금과 짝) */
  const mobileOwnerDrawerLockYRef = useRef(0);
  /** 클라이언트 마운트 후에만 `body` 포털 — SSR·하이드레이션과 컴팩트 뷰포트 스냅샷 정합 */
  const [ownerBizDrawerPortalReady, setOwnerBizDrawerPortalReady] = useState(false);
  const [orderAlertsBadge, setOrderAlertsBadge] = useState(0);
  /** ≤1024px — 모바일 헤더·하단 탭·드로어 메뉴 (태블릿·아이패드 세로 포함) */
  const isOwnerCompactShell = useOwnerCompactShellViewport();
  /** 서브 화면(예: 메뉴 카테고리 편집)이 운영 헤더 뒤로가기를 가로챌 때 */
  const ownerHeaderBackInterceptRef = useRef<(() => boolean) | null>(null);

  const ownerPathNorm = useMemo(
    () => pathname.split("?")[0]?.replace(/\/+$/, "") ?? "",
    [pathname]
  );
  const isOwnerHubRoute = ownerPathNorm === "/stores/owner";
  const isOwnerOrdersRoute = ownerPathNorm.includes("/stores/owner/orders");
  const ownerOrderDetailOpen = useMemo(
    () => isOwnerOrdersRoute && Boolean(searchParams.get("order_id")?.trim()),
    [isOwnerOrdersRoute, searchParams]
  );
  const ownerOrderChatSlideOpen = useMemo(
    () => isOwnerOrdersRoute && Boolean(searchParams.get("chat_order_id")?.trim()),
    [isOwnerOrdersRoute, searchParams]
  );
  const ownerOrderOverlayOpen = ownerOrderDetailOpen || ownerOrderChatSlideOpen;
  const isOwnerMobileAdminShell =
    isOwnerCompactShell && isStoresOwnerStackPath(ownerPathNorm);

  const ownerMainBottomPad = useMemo(() => {
    const f = resolveConditionalAppShellFlags(pathname, false);
    const isStoreOwnerAdminSubroute = ownerPathNorm.startsWith("/stores/owner/");
    if (isOwnerMobileAdminShell) return OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS;
    if (f.showBottomNav) return "pb-4 sm:pb-5 lg:pb-6";
    if (isStoreOwnerAdminSubroute) {
      return "pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] sm:pb-3 md:pb-4 lg:pb-6";
    }
    return "pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-8";
  }, [pathname, ownerPathNorm, isOwnerMobileAdminShell]);

  /** 상품 목록 허브 — 하단 탭 없음, 과한 main pb·클라 pb-8 중복 제거 대상 */
  const isOwnerStoreProductsHubRoute = useMemo(() => {
    const p = pathname.split("?")[0]?.replace(/\/+$/, "") ?? "";
    return p === "/stores/owner/products" || p === "/my/business/products";
  }, [pathname]);

  const isOwnerMenuCategoriesRoute = useMemo(() => {
    const p = pathname.split("?")[0]?.replace(/\/+$/, "") ?? "";
    return p === "/stores/owner/menu-categories" || p === "/my/business/menu-categories";
  }, [pathname]);

  const storeOwnerFlyoutSuppressesOwnerMobileBottomNav = useSyncExternalStore(
    subscribeStoreOwnerMainBottomNavSuppressed,
    getStoreOwnerMainBottomNavSuppressed,
    () => false
  );

  /** 상품 등록·편집: 본문 스크롤 + 하단 액션 분리를 위해 main 열 높이를 뷰포트에 맞춘다 */
  const isOwnerStoreProductComposerRoute = useMemo(() => {
    const p = pathname.split("?")[0]?.replace(/\/+$/, "") ?? "";
    return (
      p === "/stores/owner/products/new" ||
      /^\/stores\/owner\/products\/[^/]+\/edit$/.test(p) ||
      p === "/my/business/products/new" ||
      /^\/my\/business\/products\/[^/]+\/edit$/.test(p)
    );
  }, [pathname]);

  const isOwnerMobileStackViewport =
    isOwnerMobileAdminShell && !isOwnerStoreProductComposerRoute;

  useOwnerMobileStackViewportLock(isOwnerMobileStackViewport);

  /** 상품 작성·목록 허브·카테고리 편집: 하단 고정 UI 없음 — main 과패딩으로 짜투리 공간이 생기지 않게 */
  const ownerMainBottomPadForChildren = useMemo(() => {
    if (isOwnerStoreProductComposerRoute || isOwnerStoreProductsHubRoute) return "pb-0";
    if (isOwnerMenuCategoriesRoute && storeOwnerFlyoutSuppressesOwnerMobileBottomNav) return "pb-0";
    return ownerMainBottomPad;
  }, [
    isOwnerStoreProductComposerRoute,
    isOwnerStoreProductsHubRoute,
    isOwnerMenuCategoriesRoute,
    storeOwnerFlyoutSuppressesOwnerMobileBottomNav,
    ownerMainBottomPad,
  ]);

  const reloadStores = useCallback(async () => {
    try {
      const peek = peekMeStoresListClientCache();
      if (peek?.status === 200) {
        const fromPeek = parseStoreRowsFromMeStoresJson(peek.json);
        if (fromPeek && fromPeek.length > 0) {
          setStores(fromPeek);
          setLoadErr(null);
          return;
        }
      }
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

  const shellStoresHydrateRef = useRef(
    (initialStores != null && initialStores.length > 0) ||
      (readInitialStoresFromMeListCache()?.length ?? 0) > 0
  );

  useEffect(() => {
    if (stores != null && stores.length > 0) return;
    if (initialStores != null && initialStores.length > 0) {
      setStores(initialStores);
      shellStoresHydrateRef.current = true;
      return;
    }
    const peek = readInitialStoresFromMeListCache();
    if (peek?.length) {
      setStores(peek);
      shellStoresHydrateRef.current = true;
      return;
    }
    if (isHub) {
      if (hubRuntime?.stores?.length) {
        setStores(hubRuntime.stores);
        shellStoresHydrateRef.current = true;
        return;
      }
      // 허브: Runtime 시드 전에 Shell이 먼저 마운트되면 매장 목록이 비어 하단 탭·모바일 셸이 안 뜸
      if (shellStoresHydrateRef.current) return;
      shellStoresHydrateRef.current = true;
      void reloadStores();
      return;
    }
    if (shellStoresHydrateRef.current) return;
    shellStoresHydrateRef.current = true;
    void reloadStores();
  }, [reloadStores, stores, initialStores, isHub, hubRuntime?.stores?.length, hubRuntime?.stores]);

  useLayoutEffect(() => {
    setOwnerBizDrawerPortalReady(true);
  }, []);

  /** BodyPortal 헤더·하단 탭이 조상 밖에 있어도 동일 기기 변수(safe-area·content-max) 적용 */
  const ownerCompactShellBodyAppliedRef = useRef(false);
  useLayoutEffect(() => {
    const on = isOwnerCompactShell && isStoresOwnerStackPath(ownerPathNorm);
    if (ownerCompactShellBodyAppliedRef.current === on) return;
    ownerCompactShellBodyAppliedRef.current = on;
    applyOwnerCompactShellBodyFlag(on);
    return () => {
      ownerCompactShellBodyAppliedRef.current = false;
      applyOwnerCompactShellBodyFlag(false);
    };
  }, [isOwnerCompactShell, ownerPathNorm]);

  useEffect(() => {
    if (!isOwnerCompactShell) setMobileMenuOpen(false);
  }, [isOwnerCompactShell]);

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

  const bridgedOrdersAttentionBadge = useSyncExternalStore(
    subscribeOwnerOrdersAttentionBridge,
    () =>
      orderCountsStoreId ? peekOwnerOrdersAttentionBridge(orderCountsStoreId) : null,
    () => null
  );

  const shellOrderAlertsBadge =
    isOwnerOrdersRoute && bridgedOrdersAttentionBadge != null
      ? bridgedOrdersAttentionBadge
      : orderAlertsBadge;

  useEffect(() => {
    if (isHub && hubRuntime) return;
    if (isOwnerOrdersRoute) return;
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
    }, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [orderCountsStoreId, isHub, hubRuntime, isOwnerOrdersRoute]);

  const ownerCommerceUnread = useOwnerCommerceNotificationUnreadCountDeferred(isHub);
  const isOwnerAdminRoute = isStoreOwnerAdminPathname(pathname);
  const ownerHubBreakdown = useOwnerHubBadgeBreakdownWhenEnabled(!isOwnerAdminRoute);
  const ownerOpsAttention = resolveOwnerOperationsCenterAttentionCount(ownerHubBreakdown);
  const hubOrderAlertsBadge = hubRuntime?.orderAlertsBadge ?? shellOrderAlertsBadge;
  const ownerMobileBottomNavChatBadge =
    hubOrderAlertsBadge > 0 ? Math.min(hubOrderAlertsBadge, 99) : 0;
  const ownerHeaderBellCount = isHub
    ? Math.max(hubOrderAlertsBadge, ownerCommerceUnread ?? 0)
    : Math.max(ownerOpsAttention, shellOrderAlertsBadge, ownerCommerceUnread ?? 0);

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
      orderAlertsBadge: isHub ? hubOrderAlertsBadge : shellOrderAlertsBadge,
    };
  }, [selectedRow, shellOrderAlertsBadge, isHub, hubOrderAlertsBadge]);

  const sectionDefs = useMemo(() => buildBusinessAdminSidebar(navCtx), [navCtx]);
  const sections = useMemo(() => resolveBusinessAdminSidebar(sectionDefs, t), [sectionDefs, t]);
  const pageTitle = getBusinessAdminPageTitle(pathname);
  const shopName = selectedRow?.store_name?.trim() || "매장";
  const publicStoreHref =
    selectedRow &&
    String(selectedRow.approval_status) === "approved" &&
    selectedRow.is_visible === true &&
    selectedRow.slug
      ? `/stores/${encodeURIComponent(selectedRow.slug)}`
      : null;

  const ownerNotificationsHref = useMemo(() => {
    const fromRow = resolveOwnerStoreNotificationsHref(selectedRow);
    if (fromRow) return fromRow;
    const sid = storeIdParam.trim();
    if (!sid || !stores?.length) return null;
    const row = stores.find((s) => s.id === sid);
    return resolveOwnerStoreNotificationsHref(row);
  }, [selectedRow, stores, storeIdParam]);

  const ownerNotificationBell =
    ownerNotificationsHref ?
      <Link
        href={ownerNotificationsHref}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
        aria-label={
          ownerHeaderBellCount > 0 ? `알림 · 확인할 일 ${ownerHeaderBellCount}건` : "알림"
        }
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {ownerHeaderBellCount > 0 ? (
          <span className={`${OWNER_HUB_BADGE_DOT_CLASS} ring-sam-surface/80`}>
            {ownerHeaderBellCount > 99 ? "99+" : ownerHeaderBellCount}
          </span>
        ) : null}
      </Link>
    : null;

  useEffect(() => {
    const releases: Array<() => void> = [];
    if (isOwnerCompactShell && mobileMenuOpen) {
      releases.push(pushStoreOwnerMainBottomNavSuppressed());
    }
    if (ownerOrderOverlayOpen) {
      releases.push(pushStoreOwnerMainBottomNavSuppressed());
    }
    return () => {
      for (const release of releases) release();
    };
  }, [isOwnerCompactShell, mobileMenuOpen, ownerOrderOverlayOpen]);

  /**
   * 모바일 전용: 드로어 열릴 때 배경 스크롤 잠금.
   * `overflow:hidden` 만 쓰면 WebKit(모바일 Safari 등)에서 문서 스크롤과 `position:fixed` 패널이
   * 어긋나 사이드 상단(매장 헤더·토글)이 뷰포트 밖으로 밀린다. 본문을 `position:fixed` + `top:-y`로
   * 고정하고, 닫을 때 `scrollTo`로 이전 위치를 복원한다.
   */
  useLayoutEffect(() => {
    if (!isOwnerCompactShell || !mobileMenuOpen) return;
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
  }, [isOwnerCompactShell, mobileMenuOpen]);

  useLayoutEffect(() => {
    const shouldResetNavScroll =
      (isOwnerCompactShell && mobileMenuOpen) || (!isOwnerCompactShell && desktopSidebarOpen);
    if (!shouldResetNavScroll) return;
    const el = sidebarNavScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    el.scrollLeft = 0;
  }, [isOwnerCompactShell, mobileMenuOpen, desktopSidebarOpen]);

  const hubPartialHeaderRight = ownerNotificationBell;

  const adminHeaderBackHref = useMemo(() => {
    if (isHub || !selectedRow) return undefined;
    const sid = selectedRow.id;
    return `/stores/owner?storeId=${encodeURIComponent(sid)}`;
  }, [isHub, selectedRow]);

  const storeOpsForMobileHeader = useMemo(() => {
    if (!selectedRow) {
      return buildStoreOpsMetaFromRow({ is_open: false, business_hours_json: null });
    }
    return buildStoreOpsMetaFromRow({
      is_open: selectedRow.is_open,
      business_hours_json: selectedRow.business_hours_json,
    });
  }, [selectedRow]);

  const mobileAdminHeaderBackHref =
    isOwnerHubRoute ? undefined : (
      adminHeaderBackHref ?? (selectedRow ? OwnerRoutes.hub(selectedRow.id) : OwnerRoutes.hub())
    );

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

  const registerOwnerAdminHeaderBackIntercept = useCallback((fn: (() => boolean) | null) => {
    ownerHeaderBackInterceptRef.current = fn;
  }, []);

  const combinedAdminHeaderBackIntercept = useCallback(() => {
    if (basicInfoBackIntercept()) return true;
    const fn = ownerHeaderBackInterceptRef.current;
    return fn ? fn() : false;
  }, [basicInfoBackIntercept]);

  const openMobileOwnerMenu = useCallback(() => {
    /** 태블릿(≤1024)은 드로어 — 예전 767px 분기면 햄버거가 데스크톱 사이드만 열어 아무 것도 안 보임 */
    const compact = isOwnerCompactShell || matchesOwnerCompactShellViewport();
    if (compact) {
      setMobileMenuOpen(true);
      return;
    }
    setDesktopSidebarOpen(true);
  }, [isOwnerCompactShell]);

  const ctxValue = useMemo(
    () => ({
      storeRow: selectedRow,
      reloadStores,
      registerOwnerAdminHeaderBackIntercept,
      openMobileOwnerMenu,
    }),
    [selectedRow, reloadStores, registerOwnerAdminHeaderBackIntercept, openMobileOwnerMenu]
  );

  if (!isHub) {
    if (loadErr && (!stores || stores.length === 0)) {
      return (
        <div className="min-h-screen bg-sam-app px-4 py-8">
          <p className="text-sm text-red-600">{t("business_phase7_083", { v1: loadErr })}</p>
          <button
            type="button"
            className="mt-2 text-sm font-medium text-signature underline"
            onClick={() => void reloadStores()}
          >
            {t("business_phase7_466")}
          </button>
        </div>
      );
    }

    if (!selectedRow) {
      return (
        <div className="min-h-screen bg-sam-app px-4 py-8">
          <p className="text-sm text-sam-muted">{t("business_phase7_088")}</p>
        </div>
      );
    }
  }

  if (isHub && !selectedRow) {
    return (
      <div className="min-h-screen min-w-0 overflow-x-hidden bg-sam-app">
        <StoresOwnerStackHeader
          variant="hub"
          hideTitle
          backHref="/mypage/section/store/manage"
          shopName={shopName}
          hubSubtitle={t("business_phase7_079")}
          rightSlot={<div className="flex shrink-0 items-center gap-1">{hubPartialHeaderRight}</div>}
        />
        <main
          className={`mx-auto w-full max-w-6xl min-w-0 bg-[var(--biz-app-bg)] px-2 pt-[calc(env(safe-area-inset-top,0px)+3.5rem+0.75rem)] sm:px-2 ${ownerMainBottomPad}`}
        >
          {children}
        </main>
      </div>
    );
  }

  if (!selectedRow) {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-8">
        <p className="text-sm text-sam-muted">{t("business_phase7_088")}</p>
      </div>
    );
  }

  const hubHeaderRightSlot = (
    <>
      {(isOwnerCompactShell || !desktopSidebarOpen) ?
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
          aria-label={
            isOwnerCompactShell ? t("store_owner_aria_open_menu") : t("store_owner_expand_ops_menu")
          }
          onClick={() => {
            if (isOwnerCompactShell) setMobileMenuOpen(true);
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

  const headerRightSlot = (
    <>
      {ownerNotificationBell}
      {publicStoreHref ?
        <Link
          href={publicStoreHref}
          className="flex h-10 w-10 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
          aria-label={t("business_phase7_019")}
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
      {(isOwnerCompactShell || !desktopSidebarOpen) ?
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
          aria-label={
            isOwnerCompactShell ? t("store_owner_aria_open_menu") : t("store_owner_expand_ops_menu")
          }
          onClick={() => {
            if (isOwnerCompactShell) setMobileMenuOpen(true);
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
            <p className="sam-text-xxs text-sam-muted">{t("business_phase7_079")}</p>
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
                <BusinessStatusBadge tone="success">{t("business_phase7_029")}</BusinessStatusBadge>
              ) : (
                <BusinessStatusBadge tone="muted">{t("business_phase7_132")}</BusinessStatusBadge>
              )}
              <BusinessStatusBadge tone="warning">{t("business_phase7_183")}</BusinessStatusBadge>
            </>
          )}
        </div>
      </div>
      <div
        ref={sidebarNavScrollRef}
        className={`flex-1 overflow-y-auto bg-[var(--biz-card-bg)] px-1 py-3 ${OWNER_COMPACT_SHELL_MAX_TW}:min-h-0 ${OWNER_COMPACT_SHELL_MAX_TW}:overscroll-y-contain ${OWNER_COMPACT_SHELL_MAX_TW}:[-webkit-overflow-scrolling:touch]`}
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
          {t("store_owner_my_home_link")}
        </Link>
      </div>
    </div>
  );

  /** 컴팩트(≤1024px): 오버레이 드로어. 넓은 화면: sticky 우측 패널. */
  const asideClassName = [
    `flex flex-col border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] ${OWNER_COMPACT_SHELL_MAX_TW}:[backdrop-filter:none]`,
    `${OWNER_COMPACT_SHELL_MAX_TW}:transition-transform ${OWNER_COMPACT_SHELL_MAX_TW}:duration-[270ms] ${OWNER_COMPACT_SHELL_MAX_TW}:ease-out`,
    `${OWNER_DESKTOP_SHELL_MIN_TW}:transition-[width] ${OWNER_DESKTOP_SHELL_MIN_TW}:duration-200 ${OWNER_DESKTOP_SHELL_MIN_TW}:ease-out`,
    `${OWNER_COMPACT_SHELL_MAX_TW}:min-h-0 ${OWNER_COMPACT_SHELL_MAX_TW}:overflow-hidden ${OWNER_COMPACT_SHELL_MAX_TW}:fixed ${OWNER_COMPACT_SHELL_MAX_TW}:inset-y-0 ${OWNER_COMPACT_SHELL_MAX_TW}:right-0 ${OWNER_COMPACT_SHELL_MAX_TW}:z-[1003] ${OWNER_COMPACT_SHELL_MAX_TW}:h-[100dvh] ${OWNER_COMPACT_SHELL_MAX_TW}:max-h-[100dvh] ${OWNER_COMPACT_SHELL_MAX_TW}:w-[280px] ${OWNER_COMPACT_SHELL_MAX_TW}:max-w-[88vw] ${OWNER_COMPACT_SHELL_MAX_TW}:border-l ${OWNER_COMPACT_SHELL_MAX_TW}:shadow-none`,
    mobileMenuOpen ?
      `${OWNER_COMPACT_SHELL_MAX_TW}:translate-x-0`
    : `${OWNER_COMPACT_SHELL_MAX_TW}:translate-x-full`,
    `${OWNER_DESKTOP_SHELL_MIN_TW}:relative ${OWNER_DESKTOP_SHELL_MIN_TW}:shrink-0 ${OWNER_DESKTOP_SHELL_MIN_TW}:z-0 ${OWNER_DESKTOP_SHELL_MIN_TW}:h-screen ${OWNER_DESKTOP_SHELL_MIN_TW}:sticky ${OWNER_DESKTOP_SHELL_MIN_TW}:top-0 ${OWNER_DESKTOP_SHELL_MIN_TW}:border-l ${OWNER_DESKTOP_SHELL_MIN_TW}:shadow-none ${OWNER_DESKTOP_SHELL_MIN_TW}:max-w-none`,
    desktopSidebarOpen ?
      `${OWNER_DESKTOP_SHELL_MIN_TW}:w-[260px]`
    : `${OWNER_DESKTOP_SHELL_MIN_TW}:w-0 ${OWNER_DESKTOP_SHELL_MIN_TW}:min-w-0 ${OWNER_DESKTOP_SHELL_MIN_TW}:overflow-hidden ${OWNER_DESKTOP_SHELL_MIN_TW}:border-transparent`,
  ].join(" ");

  /**
   * 모바일: `AppRouteTransition`·헤더 스택 래퍼 등 조상에 `transform` 이 있으면 `position:fixed` 가
   * 뷰포트가 아닌 그 조상에 묶여 문서 스크롤과 같이 움직인다. 드로어·딤은 `document.body` 직계로 올려
   * 본문과 스크롤 맥락을 분리한다.
   */
  const mobileOwnerDrawerPortaled = ownerBizDrawerPortalReady && isOwnerCompactShell;
  const mobileOwnerOverlay =
    isOwnerCompactShell ?
      /**
       * 스크림: 뷰포트 전체(`inset-0`)를 동일한 불투명도로 덮는다. 드로어는 DOM·z-index(1003)로 그 위에만 올라가며,
       * `right: min(...)` 로 잘라 내는 방식은 오른쪽에 딤이 비어 본문이 그대로 비치는 버그를 만든다.
       * 닫힘 시에도 270ms 페이드아웃을 위해 언마운트하지 않고 opacity 만 토글한다.
       */
      <div
        role="button"
        tabIndex={mobileMenuOpen ? 0 : -1}
        aria-label={t("business_phase7_090")}
        aria-hidden={!mobileMenuOpen}
        className={`fixed inset-0 z-[1002] m-0 min-h-[100dvh] min-h-[100svh] w-full max-w-[100vw] touch-none border-0 bg-black/45 p-0 transition-opacity duration-[270ms] ease-out [overscroll-behavior:none] ${OWNER_DESKTOP_SHELL_MIN_TW}:hidden ${
          mobileMenuOpen ?
            "cursor-pointer opacity-100"
          : "pointer-events-none cursor-default opacity-0"
        }`}
        onClick={() => setMobileMenuOpen(false)}
        onKeyDown={(e) => {
          if (!mobileMenuOpen) return;
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
          <div
            className={`flex h-14 min-h-14 max-h-14 shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-0 ${OWNER_DESKTOP_SHELL_MIN_TW}:hidden`}
          >
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
              aria-label={t("business_phase7_090")}
              onClick={() => setMobileMenuOpen(false)}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div
            className={`hidden shrink-0 items-center justify-end border-b border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-2 py-1.5 ${OWNER_DESKTOP_SHELL_MIN_TW}:flex`}
          >
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
              aria-label={t("business_phase7_224")}
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
      <div
        data-biz="1"
        className={`flex min-w-0 flex-col bg-[var(--biz-app-bg)] ${OWNER_DESKTOP_SHELL_MIN_TW}:flex-row-reverse ${
          isOwnerStoreProductComposerRoute || isOwnerMobileStackViewport
            ? "h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden"
            : "min-h-screen"
        }`}
      >
        {!mobileOwnerDrawerPortaled ?
          <>
            {mobileOwnerOverlay}
            {ownerAdminAside}
          </>
        : null}

        <OwnerMobileAdminHeaderTrailingProvider>
          <div
            className={`flex min-w-0 flex-1 flex-col overflow-x-hidden bg-[var(--biz-app-bg)] ${OWNER_DESKTOP_SHELL_MIN_TW}:border-r ${OWNER_DESKTOP_SHELL_MIN_TW}:border-sam-border-soft ${
              isOwnerStoreProductComposerRoute
                ? "min-h-0 overflow-hidden"
                : isOwnerMobileStackViewport
                  ? "h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden"
                  : "min-h-screen"
            }`}
          >
            {isOwnerMobileAdminShell && !isOwnerStoreProductComposerRoute && selectedRow ?
              <OwnerMobileAdminHeader
                variant={isOwnerHubRoute ? "hub" : "page"}
                storeName={shopName}
                storeId={selectedRow.id}
                storeSlug={selectedRow.slug}
                storeOps={storeOpsForMobileHeader}
                urgentAlertCount={ownerHeaderBellCount}
                stores={hubRuntime?.stores ?? initialStores ?? null}
                pageTitle={pageTitle}
                backHref={mobileAdminHeaderBackHref}
                backIntercept={combinedAdminHeaderBackIntercept}
              />
            : null}
            {!(isOwnerMobileAdminShell && !isOwnerStoreProductComposerRoute) ?
              <StoresOwnerStackHeader
                variant={isHub ? "hub" : "admin"}
                hideTitle={isHub}
                backHref={isHub ? "/mypage/section/store/manage" : adminHeaderBackHref}
                backIntercept={isHub ? undefined : combinedAdminHeaderBackIntercept}
                backPreferHistory
                backAriaLabel="이전 화면으로"
                shopName={shopName}
                pageTitle={isHub ? null : pageTitle}
                rightSlot={isHub ? hubHeaderRightSlot : headerRightSlot}
                desktopInsetLeft={desktopSidebarOpen}
              />
            : null}

            <main
              className={`mx-auto w-full min-w-0 ${
                isOwnerMobileAdminShell
                  ? `${OWNER_COMPACT_SHELL_MAIN_CLASS} ${OWNER_COMPACT_SHELL_COLUMN_CLASS} flex flex-1 flex-col overflow-hidden min-h-0`
                  : "max-w-6xl px-2 sm:px-2"
              } ${
                !isOwnerMobileAdminShell
                  ? `pt-[calc(env(safe-area-inset-top,0px)+3.5rem+0.75rem)] ${OWNER_DESKTOP_SHELL_MIN_TW}:pt-[calc(env(safe-area-inset-top,0px)+3.5rem+1rem)]`
                  : ""
              } ${isOwnerMobileAdminShell ? "bg-[#F3F4F6]" : "bg-[var(--biz-app-bg)]"} ${
                isOwnerMobileStackViewport ? "" : ownerMainBottomPadForChildren
              }${isOwnerStoreProductComposerRoute ? " flex min-h-0 flex-1 flex-col overflow-hidden" : ""}`}
            >
              <OwnerStackPageSlideShell>{children}</OwnerStackPageSlideShell>
            </main>
            {isOwnerMobileStackViewport &&
            selectedRow &&
            !ownerOrderOverlayOpen &&
            !storeOwnerFlyoutSuppressesOwnerMobileBottomNav ?
              <OwnerMobileBottomNav
                storeId={selectedRow.id}
                storeSlug={selectedRow.slug}
                chatBadge={ownerMobileBottomNavChatBadge}
                scrollHideEnabled
              />
            : null}
          </div>
        </OwnerMobileAdminHeaderTrailingProvider>
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
