"use client";

import Link from "next/link";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
import { usePathname } from "next/navigation";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { OwnerMobileOpsMenuDrawer } from "@/components/business/owner/OwnerMobileOpsMenuDrawer";
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
import { formatUserAddressListPlainLine } from "@/lib/addresses/format-user-address-list-line";
import {
  readOwnerActiveStoreIdFromSession,
  resolveOwnerActiveStoreRow,
  writeOwnerActiveStoreIdToSession,
} from "@/lib/delivery/owner/resolve-owner-active-store";
import { BusinessAdminSidebar } from "@/components/business/admin/BusinessAdminSidebar";
import { BusinessAdminOpenToggle } from "@/components/business/admin/BusinessAdminOpenToggle";
import { BusinessAdminVisibleToggle } from "@/components/business/admin/BusinessAdminVisibleToggle";
import { BusinessStatusBadge } from "@/components/business/admin/BusinessStatusBadge";
import { useOwnerHubRuntime } from "@/components/business/owner/OwnerHubRuntimeProvider";
import { BusinessAdminStoreProvider } from "@/components/business/admin/business-admin-store-context";
import { OwnerMobileAdminHeader } from "@/components/business/owner/OwnerMobileAdminHeader";
import { OwnerMobileAdminHeaderTrailingProvider } from "@/components/business/owner/OwnerMobileAdminHeaderTrailingContext";
import { OwnerStackPageSlideShell } from "@/components/business/owner/OwnerStackPageSlideShell";
import { OwnerMobileBottomNav } from "@/components/stores/owner/OwnerMobileBottomNav";
import { StoresOwnerStackHeader } from "@/components/business/owner/StoresOwnerStackHeader";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { isStoresOwnerStackPath } from "@/lib/business/owner-stack-path";
import {
  useOwnerFabOrderChatBadgeCount,
  useOwnerFabStoreBadgeCount,
} from "@/lib/chats/use-owner-hub-badge-total";
import {
  isOwnerStoreProductComposerPath,
  resolveOwnerStackScrollHostPath,
} from "@/lib/business/owner-stack-scroll-host-path";
import { useOwnerMobileStackViewportLock } from "@/lib/business/use-owner-mobile-stack-viewport-lock";
import { buildStoreOpsMetaFromRow } from "@/lib/stores/owner-store-ops-snapshot";
import { OwnerHubStoreAvatar } from "@/components/business/owner/OwnerHubStoreAvatar";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import {
  emitOwnerBasicInfoLeave,
  getOwnerBasicInfoDirty,
  isOwnerStoreAdminDirtyGuardPath,
  isOwnerStoreFormBottomNavHiddenPath,
} from "@/lib/business/owner-basic-info-guard";
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
import { subscribeOwnerCompactShellBodyFlag } from "@/lib/business/sync-owner-compact-shell-body-flag";
import {
  OWNER_COMPACT_SHELL_MAX_TW,
} from "@/lib/business/owner-compact-shell-viewport";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import {
  OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS,
} from "@/lib/stores/owner-mobile-ui-tokens";
import {
  OWNER_COMPACT_SHELL_COLUMN_CLASS,
  OWNER_COMPACT_SHELL_MAIN_CLASS,
} from "@/lib/business/owner-compact-shell-layout";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  registerOwnerMobileOpsMenuOpen,
} from "@/lib/business/owner-mobile-ops-menu-bridge";
import { setOwnerOpsDrawerOpen } from "@/lib/business/owner-ops-drawer-open";
import {
  dispatchTier1HeaderOverlayClose,
  TIER1_HEADER_OVERLAY_OPEN,
} from "@/lib/layout/tier1-header-overlay-events";

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
  const searchParams = useOwnerAdminUrlSearchParams();
  const storeIdParam = searchParams.get("storeId")?.trim() ?? "";

  const hubRuntime = useOwnerHubRuntime();
  const ownerOrderChatUnread = useOwnerFabOrderChatBadgeCount();
  const ownerInquiryAttention = useOwnerFabStoreBadgeCount();
  const [stores, setStores] = useState<StoreRow[] | null>(() => {
    if (initialStores != null && initialStores.length > 0) return initialStores;
    return readInitialStoresFromMeListCache();
  });
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [linkedStoreAddressRow, setLinkedStoreAddressRow] = useState<UserAddressDTO | null>(null);
  /** 운영 사이드 내비 스크롤 — 열 때 내부 목록은 항상 맨 위 */
  const sidebarNavScrollRef = useRef<HTMLDivElement | null>(null);
  /** 모바일 드로어용: 닫을 때 복원할 `window` 세로 스크롤 (body 고정 잠금과 짝) */
  const mobileOwnerDrawerLockYRef = useRef(0);
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
  const isOwnerOrdersRoute = ownerPathNorm === "/stores/owner/orders";
  const ownerOrderChatSlideOpen = useMemo(
    () => isOwnerOrdersRoute && Boolean(searchParams.get("chat_order_id")?.trim()),
    [isOwnerOrdersRoute, searchParams]
  );
  /** `order_id` 는 카드 인라인 펼치기 — 채팅 슬라이드만 오버레이로 취급 */
  const ownerOrderOverlayOpen = ownerOrderChatSlideOpen;
  const isOwnerMobileAdminShell =
    isOwnerCompactShell && isStoresOwnerStackPath(ownerPathNorm);

  const isOwnerFormBottomNavHiddenRoute = useMemo(
    () => isOwnerStoreFormBottomNavHiddenPath(ownerPathNorm),
    [ownerPathNorm]
  );

  const ownerMainBottomPad = useMemo(() => {
    const f = resolveConditionalAppShellFlags(pathname, false);
    const isStoreOwnerAdminSubroute = ownerPathNorm.startsWith("/stores/owner/");
    /** 하단 5탭이 마운트되는 화면 — 모바일·데스크톱 동일 여백(구: desktop only 소폭 pb) */
    if (isStoresOwnerStackPath(ownerPathNorm) && !isOwnerFormBottomNavHiddenRoute) {
      return OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS;
    }
    if (isOwnerFormBottomNavHiddenRoute) {
      return "pb-[max(0.5rem,var(--safe-bottom))] sm:pb-3";
    }
    if (f.showBottomNav) return "pb-4 sm:pb-5 lg:pb-6";
    if (isStoreOwnerAdminSubroute) {
      return "pb-[max(0.5rem,var(--safe-bottom))] sm:pb-3 md:pb-4 lg:pb-6";
    }
    return "pb-[calc(5rem+var(--safe-bottom))] lg:pb-8";
  }, [pathname, ownerPathNorm, isOwnerFormBottomNavHiddenRoute]);

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

  /** 상품 등록·편집: 헤더 타이틀 분기(페이지 타이틀) — 높이/스크롤 소유권은 일반 Owner stack 과 동일 */
  const isOwnerStoreProductComposerRoute = useMemo(
    () => isOwnerStoreProductComposerPath(ownerPathNorm),
    [ownerPathNorm]
  );

  /** compact 스택 scroll host — `resolveOwnerStackScrollHostPath` (product composer 포함) */
  const ownerStackScrollHostPath = resolveOwnerStackScrollHostPath(ownerPathNorm);

  /** Tailwind — compact 뷰포트 높이 잠금(hydration 전 CSS) */
  const ownerCompactStackLayoutClass = `${OWNER_COMPACT_SHELL_MAX_TW}:h-[100dvh] ${OWNER_COMPACT_SHELL_MAX_TW}:max-h-[100dvh] ${OWNER_COMPACT_SHELL_MAX_TW}:min-h-0 ${OWNER_COMPACT_SHELL_MAX_TW}:overflow-hidden`;

  /** 헤더·본문 column — 모바일·태블릿·데스크톱 웹 동일(중앙 정렬) */
  const ownerUnifiedMainLayoutClass = `${OWNER_COMPACT_SHELL_MAIN_CLASS} ${OWNER_COMPACT_SHELL_COLUMN_CLASS} flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${OWNER_COMPACT_SHELL_MAX_TW}:overflow-hidden min-[1025px]:overflow-y-auto min-[1025px]:overscroll-y-contain`;

  /** 데스크톱(≥1025) — 앱 셸 overflow-y-hidden 안에서 본문 열 스크롤 */
  const isOwnerDesktopStackViewport =
    !isOwnerCompactShell && isStoresOwnerStackPath(ownerPathNorm);

  // SELECTIVE_RESTORE: product composer no longer uses a parallel 100dvh overflow-hidden height owner.
  const ownerStackShellHeightClass = `${ownerCompactStackLayoutClass} min-[1025px]:min-h-0 min-[1025px]:flex-1 min-[1025px]:overflow-hidden`;

  useOwnerMobileStackViewportLock(ownerStackScrollHostPath);

  /** 상품 작성·목록 허브·기본 정보·카테고리 편집: 하단 고정 UI 없음 — main 과패딩으로 짜투리 공간이 생기지 않게 */
  const ownerMainBottomPadForChildren = useMemo(() => {
    if (
      isOwnerStoreProductComposerRoute ||
      isOwnerStoreProductsHubRoute ||
      isOwnerFormBottomNavHiddenRoute
    ) {
      return "pb-0";
    }
    if (isOwnerMenuCategoriesRoute && storeOwnerFlyoutSuppressesOwnerMobileBottomNav) return "pb-0";
    return ownerMainBottomPad;
  }, [
    isOwnerStoreProductComposerRoute,
    isOwnerStoreProductsHubRoute,
    isOwnerFormBottomNavHiddenRoute,
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

  /** BodyPortal 헤더·하단 탭이 조상 밖에 있어도 동일 기기 변수(safe-area·content-max) 적용 */
  useLayoutEffect(() => {
    return subscribeOwnerCompactShellBodyFlag(isStoresOwnerStackPath(ownerPathNorm));
  }, [ownerPathNorm]);

  const selectedRow = useMemo(() => {
    if (!stores || stores.length === 0) return null;
    return (
      resolveOwnerActiveStoreRow(stores, {
        routeStoreId: storeIdParam,
        preferredStoreId: readOwnerActiveStoreIdFromSession(),
      }) ?? stores[0]!
    );
  }, [stores, storeIdParam]);

  useEffect(() => {
    const sid = selectedRow?.id?.trim();
    if (sid) writeOwnerActiveStoreIdToSession(sid);
  }, [selectedRow?.id]);

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
    storeRowCanSell(selectedRow)
      ? selectedRow.id
      : null;

  const bridgedOrdersAttentionBadge = useSyncExternalStore(
    subscribeOwnerOrdersAttentionBridge,
    () =>
      orderCountsStoreId ? peekOwnerOrdersAttentionBridge(orderCountsStoreId) : null,
    () => null
  );

  /**
   * Badge authority:
   * - Orders route: list bridge (visible attention) when present
   * - Else with hub Runtime: Runtime RT + 45s counts only (no Shell duplicate poll)
   * - Else (Runtime absent): Shell fallback poll
   */
  useEffect(() => {
    if (hubRuntime) return;
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
  }, [orderCountsStoreId, hubRuntime, isOwnerOrdersRoute]);

  /**
   * Admin surface only — hub WhenEnabled was always EMPTY on `/stores/owner*`.
   * Display authority = orders bridge / hubRuntime / Shell fallback (not Owner Header 3-axis sum).
   */
  const ownerOrderAttentionCount =
    isOwnerOrdersRoute && bridgedOrdersAttentionBadge != null
      ? bridgedOrdersAttentionBadge
      : (hubRuntime?.orderAlertsBadge ?? orderAlertsBadge);
  const ownerHeaderBellCount = ownerOrderAttentionCount;

  /**
   * Bottom-nav badge split (screenshot FAIL root cause):
   * - orders tab → orderAttention
   * - customers tab → chat unread + inquiry (never order queue)
   * Bell (Tier1 owner_commerce_inbox) is separate unread inbox — not the same as action-required.
   */
  const ownerMobileBottomNavOrderBadge = Math.min(Math.max(0, ownerOrderAttentionCount), 99);
  const ownerMobileBottomNavCustomersBadge = Math.min(
    Math.max(0, ownerOrderChatUnread) + Math.max(0, ownerInquiryAttention),
    99
  );

  const ownerStoreIdForBell = (selectedRow?.id ?? storeIdParam).trim();

  const ownerNotificationBell =
    ownerStoreIdForBell ?
      <Tier1NotificationAnchor surface="owner_commerce_inbox" storeId={ownerStoreIdForBell} />
    : null;

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
      orderAlertsBadge: ownerOrderAttentionCount,
    };
  }, [selectedRow, ownerOrderAttentionCount]);

  const sectionDefs = useMemo(() => buildBusinessAdminSidebar(navCtx), [navCtx]);
  const sections = useMemo(() => resolveBusinessAdminSidebar(sectionDefs, t), [sectionDefs, t]);
  const pageTitle = getBusinessAdminPageTitle(pathname, searchParams.toString());
  const shopName = selectedRow?.store_name?.trim() || t("business_phase7_579");
  const publicStoreHref =
    selectedRow &&
    String(selectedRow.approval_status) === "approved" &&
    selectedRow.is_visible === true &&
    selectedRow.slug
      ? `/stores/${encodeURIComponent(selectedRow.slug)}`
      : null;

  useEffect(() => {
    const releases: Array<() => void> = [];
    if (mobileMenuOpen) {
      releases.push(pushStoreOwnerMainBottomNavSuppressed());
    }
    if (ownerOrderOverlayOpen) {
      releases.push(pushStoreOwnerMainBottomNavSuppressed());
    }
    return () => {
      for (const release of releases) release();
    };
  }, [mobileMenuOpen, ownerOrderOverlayOpen]);

  useEffect(() => {
    setOwnerOpsDrawerOpen(mobileMenuOpen);
    return () => setOwnerOpsDrawerOpen(false);
  }, [mobileMenuOpen]);

  /**
   * 모바일 전용: 드로어 열릴 때 배경 스크롤 잠금.
   * `overflow:hidden` 만 쓰면 WebKit(모바일 Safari 등)에서 문서 스크롤과 `position:fixed` 패널이
   * 어긋나 사이드 상단(매장 헤더·토글)이 뷰포트 밖으로 밀린다. 본문을 `position:fixed` + `top:-y`로
   * 고정하고, 닫을 때 `scrollTo`로 이전 위치를 복원한다.
   */
  useLayoutEffect(() => {
    if (!mobileMenuOpen) return;
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
  }, [mobileMenuOpen]);

  useLayoutEffect(() => {
    if (!mobileMenuOpen) return;
    const el = sidebarNavScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    el.scrollLeft = 0;
  }, [mobileMenuOpen]);

  const hubPartialHeaderRight = ownerNotificationBell;

  const adminHeaderBackHref = useMemo(() => {
    if (isHub || !selectedRow) return undefined;
    const sid = selectedRow.id;
    const p = ownerPathNorm;
    if (p.startsWith("/stores/owner/customer-care/messages/") || p.startsWith("/stores/owner/customer-care/inquiries/")) {
      const tab = p.includes("/messages/") ? "messages" : "inquiries";
      return OwnerRoutes.customerCareCenter(sid, tab);
    }
    if (p === "/stores/owner/customer-care/customer-center" || p.startsWith("/stores/owner/customer-care/messages") || p.startsWith("/stores/owner/customer-care/inquiries")) {
      return OwnerRoutes.customerCare(sid);
    }
    if (p === "/stores/owner/customer-care") {
      return OwnerRoutes.hub(sid);
    }
    return `/stores/owner?storeId=${encodeURIComponent(sid)}`;
  }, [isHub, selectedRow, ownerPathNorm]);

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
    // Existing overlay contract: drawer must not stack under an open Tier1 notification panel.
    dispatchTier1HeaderOverlayClose();
    setMobileMenuOpen(true);
  }, []);

  useEffect(() => {
    const onNotificationOpen = () => setMobileMenuOpen(false);
    window.addEventListener(TIER1_HEADER_OVERLAY_OPEN, onNotificationOpen);
    return () => window.removeEventListener(TIER1_HEADER_OVERLAY_OPEN, onNotificationOpen);
  }, []);

  useLayoutEffect(() => {
    registerOwnerMobileOpsMenuOpen(openMobileOwnerMenu);
    return () => registerOwnerMobileOpsMenuOpen(null);
  }, [openMobileOwnerMenu]);

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
        <div
          data-biz="1"
          className={`flex min-w-0 flex-1 min-h-0 w-full flex-col bg-[var(--biz-app-bg)] px-4 py-8 ${ownerStackShellHeightClass}`}
        >
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
        <div
          data-biz="1"
          className={`flex min-w-0 flex-1 min-h-0 w-full flex-col bg-[var(--biz-app-bg)] px-4 py-8 ${ownerStackShellHeightClass}`}
        >
          <p className="text-sm text-sam-muted">{t("business_phase7_088")}</p>
        </div>
      );
    }
  }

  /**
   * Empty hub (no selected store) — header exception: `StoresOwnerStackHeader`
   * (no storeId for `OwnerMobileAdminHeader`). Layout stays compact shell height
   * (no `min-h-screen` escape from owner stack).
   */
  if (isHub && !selectedRow) {
    return (
      <div
        data-biz="1"
        data-owner-empty-hub-shell="1"
        className={`flex min-w-0 flex-1 min-h-0 w-full flex-col bg-[var(--biz-app-bg)] ${ownerStackShellHeightClass}`}
      >
        <StoresOwnerStackHeader
          variant="hub"
          hideTitle
          backHref="/mypage"
          shopName={shopName}
          hubSubtitle={t("business_phase7_079")}
          rightSlot={<div className="flex shrink-0 items-center gap-1">{hubPartialHeaderRight}</div>}
        />
        <main
          className={`mx-auto w-full min-w-0 bg-[var(--biz-app-bg)] ${ownerUnifiedMainLayoutClass} ${ownerMainBottomPad}`}
        >
          <OwnerStackPageSlideShell>{children}</OwnerStackPageSlideShell>
        </main>
      </div>
    );
  }

  if (!selectedRow) {
    return (
      <div
        data-biz="1"
        className={`flex min-w-0 flex-1 min-h-0 w-full flex-col bg-[var(--biz-app-bg)] px-4 py-8 ${ownerStackShellHeightClass}`}
      >
        <p className="text-sm text-sam-muted">{t("business_phase7_088")}</p>
      </div>
    );
  }

  const composerHeaderRightSlot = (
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

  const mobileDrawerTopBar = (
    <div className="owner-ops-drawer-topbar flex h-14 min-h-14 max-h-14 shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-0">
      {sidebarAddressLabel ? (
        <div
          className="flex h-full min-h-0 min-w-0 flex-1 items-center gap-1.5 overflow-hidden pr-1 sam-text-xxs font-medium leading-tight text-sam-muted"
          title={sidebarAddressLabel}
        >
          <AddressKindHeadPin kind="master" className="h-4 w-4 shrink-0 [&_svg]:h-4 [&_svg]:w-[0.85rem]" />
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
  );

  return (
    <BusinessAdminStoreProvider value={ctxValue}>
      {isStoresOwnerStackPath(ownerPathNorm) && selectedRow ?
        <OwnerMobileOpsMenuDrawer
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          scrimLabel={t("business_phase7_090")}
          panelLabel={t("business_phase7_076")}
          topBar={mobileDrawerTopBar}
        >
          {sidebarBody}
        </OwnerMobileOpsMenuDrawer>
      : null}
      <div
        data-biz="1"
        className={`flex min-w-0 flex-1 min-h-0 w-full flex-col bg-[var(--biz-app-bg)] ${ownerStackShellHeightClass}`}
      >
        <OwnerMobileAdminHeaderTrailingProvider>
          <div
            className={`flex min-w-0 flex-1 min-h-0 flex-col overflow-x-hidden bg-[var(--biz-app-bg)] ${ownerStackShellHeightClass}`}
          >
            {selectedRow && !isOwnerStoreProductComposerRoute ?
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
                opsMenuOpen={mobileMenuOpen}
              />
            : null}
            {isOwnerStoreProductComposerRoute ?
              <StoresOwnerStackHeader
                variant="admin"
                backHref={adminHeaderBackHref}
                backIntercept={combinedAdminHeaderBackIntercept}
                backPreferHistory
                backAriaLabel={t("business_phase7_351")}
                shopName={shopName}
                pageTitle={pageTitle}
                rightSlot={composerHeaderRightSlot}
              />
            : null}

            <main
              className={`mx-auto w-full min-w-0 bg-[var(--biz-app-bg)] ${ownerUnifiedMainLayoutClass} ${
                isOwnerStoreProductComposerRoute
                  ? // Composer still uses StoresOwnerStackHeader (out of flow) — keep top offset only.
                    "pt-[calc(var(--safe-top)+3.5rem+0.75rem)] px-2 sm:px-2 max-w-6xl"
                  : isOwnerDesktopStackViewport
                    ? ownerMainBottomPadForChildren
                    : ""
              }`}
            >
              <OwnerStackPageSlideShell>{children}</OwnerStackPageSlideShell>
            </main>
            {ownerStackScrollHostPath &&
            selectedRow &&
            !ownerOrderOverlayOpen &&
            !storeOwnerFlyoutSuppressesOwnerMobileBottomNav &&
            !isOwnerFormBottomNavHiddenRoute ?
              <OwnerMobileBottomNav
                storeId={selectedRow.id}
                storeSlug={selectedRow.slug}
                orderBadge={ownerMobileBottomNavOrderBadge}
                customersBadge={ownerMobileBottomNavCustomersBadge}
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
  return formatUserAddressListPlainLine(row);
}

function formatOwnerSidebarAddress(store: StoreRow, linkedAddress: UserAddressDTO | null): string {
  const fromAddressBook = linkedAddress ? formatOwnerSidebarAddressBookRow(linkedAddress).trim() : "";
  return fromAddressBook || formatOwnerSidebarFullAddress(store);
}
