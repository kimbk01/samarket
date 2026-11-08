"use client";

/**
 * Canonical Ads / Exposure shell — /admin/advertising
 * Aggregates control-plane rows; mutations via existing family writers + deep-links.
 * Menu leaf reduction is NOT in scope.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { useAdminAccessActor, useAdminWriteGuard } from "@/components/admin/access/use-admin-route-access";
import {
  actorMeetsAdminRouteRequirement,
  advertisingWorkspaceFamilyActionRequirement,
} from "@/lib/admin/access/admin-route-access";
import { describeAdminRequirementDenial } from "@/lib/admin/access/admin-access-ui";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import type { AdsActionItem, AdsControlPlaneModel } from "@/lib/admin/ads-control-plane/types";
import type { MessageKey } from "@/lib/i18n/messages";
import { fetchAdsControlPlane } from "@/lib/admin/ads-control-plane/fetch-ads-control-plane";
import {
  familyFromControlDomain,
  filterWorkspaceActionsByMode,
  listWorkspaceDrawerActions,
  isWorkspacePopupDeleteSafeDraft,
  parseWorkspaceEntityId,
  type WorkspaceDrawerAction,
} from "@/lib/admin/advertising-workspace/resolve-drawer-actions";
import { ADS_FEEDBACK } from "@/lib/admin/ads-exposure/action-feedback";
import {
  adsWorkspaceMutationConfirmCopy,
  type AdminMutationConfirmCopy,
} from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";
import { PROMOTION_WORKSPACE_HREF } from "@/lib/admin/promotion-ownership-visibility";
import {
  toAdsShellListRow,
  type AdsShellListRow,
  type AdsShellProductFamily,
  type AdsShellStatusTab,
} from "@/lib/admin/ads-exposure/shell-row";
import {
  operationsWaitingFallback,
  resolveOperationsPrimaryCta,
} from "@/lib/admin/ads-exposure/operations-primary-cta";
import { adsLiveLinkLabel } from "@/lib/admin/ads-exposure/live-route";
import {
  collectAdsWorkspacePool as collectPool,
  computeAdsWorkspaceHeroOccupancy,
  computeAdsWorkspaceSummaryCounts,
  type AdvertisingWorkspaceMode,
} from "@/lib/admin/advertising-workspace/workspace-summary";
import {
  ADS_BOOST_ORDER_URL_PARAM,
  findBoostActionItemByOrderId,
  resolveAdsBoostOrderFocusState,
} from "@/lib/admin/ads-exposure/boost-order-deep-link";
import { adminIsoToManilaInput, adminManilaInputToIso } from "@/lib/admin/operator-ux/admin-manila-datetime-input";
import { isDeliveryAdLiveEndLifecycle } from "@/lib/stores/advertising/admin-delivery-ad-end";
import { formatAdminDeliveryAdPriceOrUnset } from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import { AdminAdsOtherSurfacesCards } from "@/components/admin/ads/AdminAdsOtherSurfacesCards";
import {
  AdminAdsLedgerDrawerPanel,
  AdminAdsLedgerShortcuts,
  adsLedgerRowTexts,
} from "@/components/admin/ads/AdminAdsLedgerParts";
import {
  ADS_LEDGER_DOMAINS,
  ADS_LEDGER_KINDS,
  adsLedgerAdvertiserLabel,
  adsLedgerDomainLabel,
  adsLedgerKindLabel,
  isAdsLedgerKind,
} from "@/lib/admin/ads-ledger/ad-ledger-presentation";
import {
  adLocationFilterValue,
  adLocationLabel,
  parseAdLocationFilterValue,
} from "@/lib/admin/ads-ledger/ad-location-label";
import { catalogPair } from "@/lib/i18n/catalog-pair";

/**
 * PHASE 2 — header CTA by page responsibility.
 * Global 7-leaf IA = sidebar only. Row operational CTAs unchanged.
 */
export function advertisingWorkspaceHeaderCtas(mode: AdvertisingWorkspaceMode): {
  showRegister: boolean;
  showPlacementsLink: boolean;
} {
  switch (mode) {
    case "all":
      return { showRegister: true, showPlacementsLink: true };
    case "operations":
      return { showRegister: false, showPlacementsLink: true };
    case "boosts":
    case "applications":
    case "history":
      return { showRegister: false, showPlacementsLink: false };
    default:
      return { showRegister: false, showPlacementsLink: false };
  }
}

const STATUS_TABS_ALL: Array<{ id: AdsShellStatusTab; ko: string; en: string }> = [
  { id: "all", ko: "전체", en: "All" },
  { id: "pending", ko: "확인중", en: "In review" },
  { id: "incomplete", ko: "보류", en: "On hold" },
  { id: "scheduled", ko: "예약", en: "Scheduled" },
  { id: "live", ko: "현재 노출", en: "Live" },
  { id: "waiting", ko: "노출 대기", en: "Waiting" },
  { id: "paused", ko: "일시중지", en: "Paused" },
  { id: "ended", ko: "종료", en: "Ended" },
  { id: "rejected", ko: "반려", en: "Rejected" },
];

function statusTabsForMode(mode: AdvertisingWorkspaceMode): Array<{ id: AdsShellStatusTab; ko: string; en: string }> {
  if (mode === "applications") {
    return [
      { id: "all", ko: "전체", en: "All" },
      { id: "pending", ko: "확인중", en: "In review" },
      { id: "incomplete", ko: "보류", en: "On hold" },
      { id: "rejected", ko: "반려", en: "Rejected" },
    ];
  }
  if (mode === "boosts") {
    return [
      { id: "all", ko: "전체", en: "All" },
      { id: "live", ko: "현재 노출", en: "Live" },
      { id: "scheduled", ko: "예약", en: "Scheduled" },
      { id: "paused", ko: "제재 중", en: "Sanctioned" },
      { id: "ended", ko: "종료", en: "Ended" },
    ];
  }
  if (mode === "operations") {
    return [
      { id: "all", ko: "전체", en: "All" },
      { id: "live", ko: "현재 노출", en: "Live" },
      { id: "waiting", ko: "노출 대기", en: "Waiting" },
      { id: "scheduled", ko: "예약", en: "Scheduled" },
      { id: "paused", ko: "일시중지", en: "Paused" },
      { id: "incomplete", ko: "비노출", en: "Not exposing" },
      { id: "ended", ko: "종료", en: "Ended" },
    ];
  }
  if (mode === "history") {
    // 설계 §5 「이력(삭제됨 포함)」 — 원장 함수가 삭제 표시 행을 `deleted` 탭으로 준다
    return [...STATUS_TABS_ALL, { id: "deleted" as string as AdsShellStatusTab, ko: "삭제됨", en: "Deleted" }];
  }
  return STATUS_TABS_ALL;
}

function familyTabsForMode(mode: AdvertisingWorkspaceMode): Array<{ id: AdsShellProductFamily; ko: string; en: string }> {
  if (mode === "boosts") {
    return [
      { id: "all", ko: "전체", en: "All" },
      { id: "promote", ko: "상위노출", en: "Promote" },
    ];
  }
  // 재감사 R-08: 광고 승인 목록은 DB 함수가 팝업 신청을 빼므로 「팝업」 탭이 항상 비어 있었다 → 승인 목록에서는 두지 않는다.
  // 사장님 팝업 신청은 「전체 광고」 팝업 종류(`PLATFORM_POPUP_ADMIN_REQUEST_ROUTES.queue`)에서 처리한다. 노출 관리에는 운영 팝업이 있어 유지.
  if (mode === "applications") {
    return [
      { id: "all", ko: "전체", en: "All" },
      { id: "banner", ko: "배너", en: "Banner" },
      { id: "sponsored", ko: "매장 홍보", en: "Store promote" },
    ];
  }
  if (mode === "operations") {
    return [
      { id: "all", ko: "전체", en: "All" },
      { id: "banner", ko: "배너", en: "Banner" },
      { id: "popup", ko: "팝업", en: "Popup" },
      { id: "sponsored", ko: "매장 홍보", en: "Store promote" },
    ];
  }
  return [
    { id: "all", ko: "전체 종류", en: "All kinds" },
    { id: "promote", ko: "상위노출", en: "Promote" },
    { id: "banner", ko: "배너", en: "Banner" },
    { id: "sponsored", ko: "매장 홍보", en: "Store promote" },
    { id: "popup", ko: "팝업", en: "Popup" },
  ];
}

const ACTION_LABEL: Record<WorkspaceDrawerAction, { ko: string; en: string }> = {
  approve: catalogPair("admin_meeting_engine_action_approve"),
  reject: catalogPair("admin_meeting_engine_action_reject"),
  request_changes: catalogPair("admin_delivery_ads_action_request_changes"),
  pause: catalogPair("admin_pause"),
  resume: catalogPair("admin_resume"),
  end: catalogPair("admin_end"),
  terminate: catalogPair("admin_delivery_ads_action_terminate"),
  delete_safe_draft: catalogPair("admin_delete_draft"),
  add_internal_memo: catalogPair("admin_stores_settlements_ops_memo_ph"),
  extend_compensation: catalogPair("admin_extend_period"),
  change_period: catalogPair("admin_change_period"),
};

function feedbackForAction(action: WorkspaceDrawerAction, ko: boolean): string {
  if (action === "approve") return ko ? ADS_FEEDBACK.approved.ko : ADS_FEEDBACK.approved.en;
  if (action === "reject") return ko ? ADS_FEEDBACK.rejected.ko : ADS_FEEDBACK.rejected.en;
  if (action === "pause") return ko ? ADS_FEEDBACK.paused.ko : ADS_FEEDBACK.paused.en;
  if (action === "resume") return ko ? ADS_FEEDBACK.resumed.ko : ADS_FEEDBACK.resumed.en;
  if (action === "end" || action === "terminate") {
    return ko ? ADS_FEEDBACK.ended.ko : ADS_FEEDBACK.ended.en;
  }
  if (action === "delete_safe_draft") return ko ? ADS_FEEDBACK.deleted.ko : ADS_FEEDBACK.deleted.en;
  if (action === "change_period") return ko ? "기간을 저장했습니다." : "Period saved.";
  return ko ? ADS_FEEDBACK.updated.ko : ADS_FEEDBACK.updated.en;
}

function resolveFamily(item: AdsActionItem) {
  return familyFromControlDomain(item.domain, item.product, {
    id: item.id,
    source: item.source,
  });
}

function defaultStatusTabForMode(mode: AdvertisingWorkspaceMode): AdsShellStatusTab {
  if (mode === "history") return "ended";
  if (mode === "applications") return "pending";
  if (mode === "operations") return "live";
  if (mode === "boosts") return "live";
  return "all";
}

/** 설계 v4 §7 페이지 골격 — 제목 = 메뉴 라벨 (admin-menu titleKey 와 같은 키). */
function modeTitleKey(mode: AdvertisingWorkspaceMode): MessageKey {
  if (mode === "operations") return "admin_menu_ads_authority_operations";
  if (mode === "applications") return "admin_menu_ads_authority_applications";
  if (mode === "boosts") return "admin_menu_ads_authority_boosts";
  if (mode === "history") return "admin_menu_ads_authority_history";
  return "admin_menu_ads_advertising_workspace";
}

function modeDescription(mode: AdvertisingWorkspaceMode, ko: boolean): string {
  if (mode === "operations") {
    return ko
      ? "승인 완료·운영자 직접 등록 광고의 실제 노출 위치·운영 상태·노출 상태를 확인하고, 허용된 운영 작업만 합니다."
      : "Inspect actual placement, operating state, and runtime for approved/Admin Direct ads; mutate only via writer-backed actions.";
  }
  if (mode === "applications") {
    return ko
      ? "사람 승인이 필요한 배너·매장 홍보 신청만 검토합니다. 커뮤니티·거래 상위노출, 운영자 직접 등록, 팝업은 여기 없습니다."
      : "Human-approval Banner and store promotion only. Boosts, Admin Direct, and Popup are excluded.";
  }
  if (mode === "boosts") {
    return ko
      ? "커뮤니티·거래 포인트 상위노출만 봅니다. 승인 없음. 제재 = 노출 일시정지, 다시 켜기 = 재개."
      : "Community/Trade Point boosts only. No approval. Sanction=pause, resume=resume.";
  }
  if (mode === "history") {
    return ko
      ? "종료·반려·취소·제재된 광고 이력을 확인합니다."
      : "Review ended, rejected, cancelled, and sanctioned ad history.";
  }
  return ko
    ? "유료 광고와 광고 노출 위치/재고를 관리합니다. 이벤트 프로모션은 「플랫폼 운영」에서 관리합니다."
    : "Manage paid ads and ad placement inventory. Event promotions live under Promotion / Events.";
}

export function AdminAdvertisingWorkspace({ mode = "all" }: { mode?: AdvertisingWorkspaceMode }) {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-sm text-sam-muted" data-admin-advertising-workspace-pending="1">
          …
        </div>
      }
    >
      <AdminAdvertisingWorkspaceInner mode={mode} />
    </Suspense>
  );
}

function AdminAdvertisingWorkspaceInner({ mode = "all" }: { mode?: AdvertisingWorkspaceMode }) {
  const { language, t } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { actor: accessActor } = useAdminAccessActor();
  /** 빈 목록 「광고 등록」 — 등록 화면 진입 권한 (접근표 action, 서버 가드는 그대로) */
  const registerGuard = useAdminWriteGuard("/admin/advertising/direct");
  /** LNK-1 — `?store_id=` (legacy `?storeId=`) scopes the workspace to one store. */
  const storeFilter = (searchParams.get("store_id") ?? searchParams.get("storeId") ?? "").trim();
  const clearStoreFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("store_id");
    next.delete("storeId");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [pathname, router, searchParams]);
  /** Owner 결정 O-6② — `?domain=` (도메인 메뉴 바로가기) = 서버에서 그 도메인 행만 거른다 */
  const domainRaw = (searchParams.get("domain") ?? "").trim();
  const domainFilter = (ADS_LEDGER_DOMAINS as readonly string[]).includes(domainRaw) ? domainRaw : "";
  /** 원장 거름 (설계 §1·§5) — `?kind=` 종류 · `?location=` 위치 지도 칸 · `?advertiser=` 문의·충전 상세의 「이 광고주의 광고」 */
  const kindFilterRaw = (searchParams.get("kind") ?? "").trim();
  const kindFilter = isAdsLedgerKind(kindFilterRaw) ? kindFilterRaw : "";
  const locationFilter = parseAdLocationFilterValue(searchParams.get("location"));
  const locationFilterValue = locationFilter ? adLocationFilterValue(locationFilter.key, locationFilter.target) : "";
  const advertiserFilter = (searchParams.get("advertiser") ?? "").trim();
  const clearLedgerFilter = useCallback(
    (key: "kind" | "location" | "advertiser") => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete(key);
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname);
    },
    [pathname, router, searchParams]
  );
  const clearDomainFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("domain");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [pathname, router, searchParams]);
  const boostOrderIdRaw =
    mode === "boosts" ? (searchParams.get(ADS_BOOST_ORDER_URL_PARAM) ?? "").trim() : "";
  const [model, setModel] = useState<AdsControlPlaneModel | null>(null);
  const [err, setErr] = useState("");
  const [errStatus, setErrStatus] = useState<number | undefined>(undefined);
  /**
   * R7 목록 표준 8 — 상태 탭(`?status=`)·종류 탭(`?family=`)을 주소에 둔다 (새로고침·링크 공유·상세 복귀 시 유지).
   * 대시보드 링크 `?status=` 는 이 화면의 상태 탭을 그대로 연다 (요약 카드 숫자 = 탭 개수).
   * 요약 카드(승인 대기 등)는 화면 탭 목록 밖 상태도 열 수 있으므로 허용 상태 = 전체 상태 탭.
   */
  const lq = useAdminListQuery<"family">({
    statuses: [...STATUS_TABS_ALL.map((t) => t.id), "deleted" as string as AdsShellStatusTab],
    defaults: { status: defaultStatusTabForMode(mode) },
    extras: ["family"],
    extraDefaults: { family: "all" },
  });
  const statusTab: AdsShellStatusTab =
    (lq.query.status as AdsShellStatusTab) || defaultStatusTabForMode(mode);
  const family: AdsShellProductFamily = familyTabsForMode(mode).some((t) => t.id === lq.query.extras.family)
    ? (lq.query.extras.family as AdsShellProductFamily)
    : "all";
  const { setStatus: setStatusTab, setExtra: setListExtra, patch: patchListQuery } = lq;
  /** R7 서버 페이지 — 모드·종류·상태 탭 필터·정렬·페이지·전체 건수는 서버(DB). */
  const { page: listPage, size: listSize } = lq.query;
  const setFamily = useCallback((f: AdsShellProductFamily) => setListExtra("family", f), [setListExtra]);
  const [selected, setSelected] = useState<AdsActionItem | null>(null);
  const [manageOpenId, setManageOpenId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [pendingMutation, setPendingMutation] = useState<{
    action: WorkspaceDrawerAction;
    item: AdsActionItem;
    copy: AdminMutationConfirmCopy;
  } | null>(null);
  const [publicMessage, setPublicMessage] = useState("");
  const [internalMemo, setInternalMemo] = useState("");
  /** 광고 감사 A-9: 저장한 내부 메모 목록(같은 계열 권한으로 조회) — 이전에는 저장만 되고 볼 곳이 없었다 */
  const [savedMemos, setSavedMemos] = useState<Array<{ memo: string; createdAt: string }>>([]);
  const [memoReload, setMemoReload] = useState(0);
  const [extendDays, setExtendDays] = useState(1);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  /** 커뮤니티 홍보 종료 — 귀책(필수)·환급 미리보기 (설계 v2 §F-1-2) */
  const [endFault, setEndFault] = useState<"operator" | "member" | "none" | null>(null);
  /** 종료 환급 미리보기 — 상위노출·피드 = 포인트(refundPoints) · 배달 = 비즈니스 캐시 minor(refundAmount) */
  const [endPreview, setEndPreview] = useState<
    { fault: string; refundPoints: number } | { fault: string; error: string } | null
  >(null);

  const load = useCallback(async () => {
    setErr("");
    setErrStatus(undefined);
    const result = await fetchAdsControlPlane({
      orderId: boostOrderIdRaw || undefined,
      storeId: storeFilter || undefined,
      page: {
        mode,
        status: statusTab,
        family,
        domain: domainFilter || undefined,
        kind: kindFilter || undefined,
        location: locationFilterValue || undefined,
        advertiser: advertiserFilter || undefined,
        includeDeleted: mode === "history" && String(statusTab) === "deleted" ? true : undefined,
        limit: listSize,
        offset: (listPage - 1) * listSize,
      },
    });
    if (!result.ok) {
      // 실패해도 이전 정상 목록(model)은 지우지 않는다 (지시서 §8-5).
      setErr(result.error === "network" ? "network_error" : result.error || "load_failed");
      setErrStatus(result.status);
      return;
    }
    setModel(result.plane);
  }, [
    boostOrderIdRaw,
    storeFilter,
    domainFilter,
    kindFilter,
    locationFilterValue,
    advertiserFilter,
    mode,
    statusTab,
    family,
    listPage,
    listSize,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 실기 v6 FAIL 1 (Owner 「설계안대로 진행」 2026-11-07): 원장 종류 칩 = 원장 13종 + 전체 (설계 §5 「종류 필터」).
   * 칩 수는 종류 거름을 뺀 값이어야 한다(서버 `kind_counts` 는 종류 거름이 들어간 값) → 위치 지도와 같이
   * 도메인·광고주·매장 거름만 넣고 1번 더 읽는다(그 거름이 바뀔 때만).
   */
  const showKindChips = mode === "all" || mode === "history";
  const [kindChipCounts, setKindChipCounts] = useState<Partial<Record<string, number>> | null>(null);
  useEffect(() => {
    if (!showKindChips) return;
    let alive = true;
    void fetchAdsControlPlane({
      storeId: storeFilter || undefined,
      page: {
        mode: "all",
        limit: 1,
        offset: 0,
        domain: domainFilter || undefined,
        advertiser: advertiserFilter || undefined,
      },
    }).then((r) => {
      if (!alive) return;
      setKindChipCounts(r.ok && r.plane.page?.ledger ? (r.plane.kindCounts ?? {}) : null);
    });
    return () => {
      alive = false;
    };
  }, [showKindChips, storeFilter, domainFilter, advertiserFilter]);
  const setKindFilter = useCallback(
    (kind: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (kind) next.set("kind", kind);
      else next.delete("kind");
      // 종류가 계열보다 좁은 거름 — 둘이 어긋나지 않게 계열은 전체로, 쪽은 처음으로
      next.delete("family");
      next.delete("page");
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname);
    },
    [pathname, router, searchParams]
  );

  /** 광고주 거름 칩 — 거른 행의 광고주 이름 (원장 칸) */
  const advertiserFilterLedger = useMemo(() => {
    if (!advertiserFilter || !model) return null;
    return model.applications.find((i) => i.ledger?.advertiserId === advertiserFilter)?.ledger ?? null;
  }, [advertiserFilter, model]);

  const storeFilterLabel = useMemo(() => {
    if (!storeFilter || !model) return storeFilter;
    const hit = collectPool(model).find((i) => i.storeId === storeFilter && i.applicantLabel.trim());
    return hit?.applicantLabel.trim() || storeFilter;
  }, [model, storeFilter]);

  const shellRows = useMemo(() => {
    if (!model) return [] as AdsShellListRow[];
    // R7 — 매장 범위·모드·종류·상태 탭·페이지는 서버가 적용했다 (`applications` = 이 조건의 한 페이지).
    return model.applications.map((i) => toAdsShellListRow(i, ko, mode));
  }, [model, ko, mode]);
  const listTotal = model?.page?.total ?? shellRows.length;

  const itemById = useMemo(() => {
    const map = new Map<string, AdsActionItem>();
    if (!model) return map;
    for (const i of collectPool(model)) map.set(i.id, i);
    return map;
  }, [model]);

  const boostFocusMatch = useMemo(() => {
    if (mode !== "boosts" || !model || !boostOrderIdRaw) return null;
    return findBoostActionItemByOrderId(collectPool(model), boostOrderIdRaw);
  }, [mode, model, boostOrderIdRaw]);

  const boostFocusAppliedRef = useRef<string | null>(null);
  /** 최신 탭 상태로 「전체」 적용 — effect 의존값을 늘리지 않으려고 ref 로 둔다. */
  const boostFocusShowAllRef = useRef<() => void>(() => {});
  useEffect(() => {
    boostFocusShowAllRef.current = () => {
      if (statusTab !== "all" || family !== "all") {
        patchListQuery({ status: "all", extras: { family: "all" } });
      }
    };
  }, [statusTab, family, patchListQuery]);
  const boostFocusState = useMemo(
    () =>
      resolveAdsBoostOrderFocusState({
        orderIdRaw: mode === "boosts" ? boostOrderIdRaw : "",
        matched: boostFocusMatch,
        poolReady: mode === "boosts" ? model != null : true,
      }),
    [mode, boostOrderIdRaw, boostFocusMatch, model]
  );

  useEffect(() => {
    if (mode !== "boosts") return;
    if (boostFocusState === "none") return;
    if (boostFocusState === "invalid" || boostFocusState === "not_found") {
      setSelected(null);
      return;
    }
    if (boostFocusState === "matched" && boostFocusMatch) {
      // 주문 포커스는 한 번만 「전체」 탭으로 연다 — 이후 운영자가 고른 탭을 되돌리지 않는다.
      if (boostFocusAppliedRef.current !== boostFocusMatch.id) {
        boostFocusAppliedRef.current = boostFocusMatch.id;
        boostFocusShowAllRef.current();
      }
      setSelected(boostFocusMatch);
    }
  }, [mode, boostFocusState, boostFocusMatch]);

  useEffect(() => {
    if (mode !== "boosts" || boostFocusState !== "matched" || !boostFocusMatch) return;
    const rowId = boostFocusMatch.id;
    const el = document.querySelector(
      `[data-admin-boost-order-row="${CSS.escape(rowId)}"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [mode, boostFocusState, boostFocusMatch, shellRows]);

  const summary = useMemo(() => {
    if (!model) {
      return {
        pending: 0,
        live: 0,
        waiting: 0,
        incomplete: 0,
        scheduled: 0,
        vacant: 0,
        heroCap: 5,
      };
    }
    const hero = computeAdsWorkspaceHeroOccupancy(model);
    return {
      ...computeAdsWorkspaceSummaryCounts(model, mode),
      vacant: hero.vacant,
      heroCap: hero.capacity,
    };
  }, [model, mode]);

  const popupQueue = useMemo(() => {
    type PopupSurfaceQueue = {
      surface: string;
      live: AdsShellListRow[];
      waiting: AdsShellListRow[];
      incompleteCount: number;
      scheduledCount: number;
    };
    if (!model) return [] as PopupSurfaceQueue[];
    if (model.popupSurfaces) {
      // R7 — 팝업 캠페인 전체 기준 위치별 점유 (서버 집계). 같은 위치 이름은 합친다.
      const byLabel = new Map<string, PopupSurfaceQueue>();
      for (const g of model.popupSurfaces) {
        const label =
          toAdsShellListRow(
            {
              id: `popup_campaign:surface:${g.surfaces}`,
              domain: "popup",
              product: "platform_popup",
              entity: "execution",
              applicantLabel: "",
              storeId: null,
              memberId: null,
              creativeHint: null,
              placementHint: g.surfaces,
              amountLabel: null,
              currency: "N_A",
              status: "",
              whyActionable: null,
              paymentLabel: null,
              periodLabel: null,
              remainingLabel: null,
              exposureLabel: null,
              eligibility: null,
              ageHours: null,
              at: model.generatedAt,
              source: "platform_popup_campaigns",
              href: "",
              statementHref: null,
              financeHref: null,
              memberHref: null,
            },
            ko
          ).placementLabel || "팝업";
        const cur = byLabel.get(label) ?? { surface: label, live: [], waiting: [], incompleteCount: 0, scheduledCount: 0 };
        cur.live.push(...g.live.map((i) => toAdsShellListRow(i, ko)));
        cur.waiting.push(...g.waiting.map((i) => toAdsShellListRow(i, ko)));
        cur.incompleteCount += g.incomplete;
        cur.scheduledCount += g.scheduled;
        byLabel.set(label, cur);
      }
      return [...byLabel.values()];
    }
    const popupRows = collectPool(model)
      .filter((i) => i.domain === "popup" && String(i.id).startsWith("popup_campaign:"))
      .map((i) => toAdsShellListRow(i, ko));
    const bySurface = new Map<string, AdsShellListRow[]>();
    for (const row of popupRows) {
      const key = row.placementLabel || "팝업";
      const list = bySurface.get(key) ?? [];
      list.push(row);
      bySurface.set(key, list);
    }
    return [...bySurface.entries()].map(
      ([surface, rows]): PopupSurfaceQueue => ({
        surface,
        live: rows.filter((r) => r.statusTab === "live"),
        waiting: rows.filter((r) => r.statusTab === "waiting"),
        incompleteCount: rows.filter((r) => r.statusTab === "incomplete").length,
        scheduledCount: rows.filter((r) => r.statusTab === "scheduled").length,
      })
    );
  }, [model, ko]);

  const executeDrawerAction = useCallback(
    async (
      action: WorkspaceDrawerAction,
      rowItem: AdsActionItem,
      reasonFromConfirm?: string,
      fault?: "operator" | "member" | "none" | null,
      internalReasonFromConfirm?: string | null
    ) => {
      const fam = resolveFamily(rowItem);
      if (!fam) {
        setActionMsg(ko ? "이 행은 관리 액션이 없습니다." : "No manage actions for this row.");
        return;
      }
      if (action === "change_period") {
        if (!periodStart.trim() || !periodEnd.trim()) {
          setActionMsg(ko ? "시작·종료 일시를 입력하세요." : "Enter start and end.");
          return;
        }
      }
      const reason =
        (reasonFromConfirm && reasonFromConfirm.trim()) ||
        publicMessage.trim() ||
        "";
      setBusyAction(action);
      setActionMsg("");
      try {
        if (action === "extend_compensation" && !reason) {
          setActionMsg(ko ? "연장 사유가 필요합니다." : "Extend reason required.");
          setBusyAction(null);
          return;
        }
        const res = await fetch("/api/admin/advertising-workspace/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            family: fam,
            entityId: parseWorkspaceEntityId(rowItem.id),
            action,
            // 화면에서 본 버전 — 서버가 현재 값으로 대신 채우지 않도록 (DEF-6)
            expectedUpdatedAt: rowItem.expectedUpdatedAt ?? undefined,
            expectedLifecycle: rowItem.expectedLifecycle ?? undefined,
            reason: reason || undefined,
            publicMessage: reason || undefined,
            // D-6: 확인창의 내부 메모(운영자만) — 공개 사유와 따로 보낸다
            internalReason: internalReasonFromConfirm?.trim() || undefined,
            internalMemo: action === "add_internal_memo" ? internalMemo : undefined,
            requestedDays: action === "extend_compensation" ? extendDays : undefined,
            extensionKind:
              action === "extend_compensation" ? "ADMIN_FREE_COMPENSATION" : undefined,
            // 재감사 S-2 (G-10): 기간 입력 = 필리핀 시간(PHT) — 기기 시간대로 해석하지 않는다
            startAt: action === "change_period" ? adminManilaInputToIso(periodStart) ?? undefined : undefined,
            endAt: action === "change_period" ? adminManilaInputToIso(periodEnd) ?? undefined : undefined,
            // 커뮤니티 홍보 종료: 귀책에 따라 서버가 환급(운영 사유) 또는 환급 없음(회원 사유)을 정한다.
            // 재감사 S-0 (H-1): 거래 상위노출 종료도 귀책이 필요하다(DB `admin_trade_promotion_end` 가 귀책 없으면 fault_required)
            // 설계 §6: 피드 배너(D-5)·배달 진행 중(D-13) 종료도 귀책 필수
            fault:
              action === "end" && (fam === "boost_community" || fam === "boost_trade" || fam === "feed_banner" || fam === "delivery_banner" || fam === "delivery_sponsored")
                ? fault ?? undefined
                : undefined,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          result?: { refundWarning?: string | null; refundQueued?: boolean } | null;
          refundPoints?: number | null;
          /** 거래 상위노출 종료 응답(DB 함수 원문 키) */
          refund_points?: number | null;
          /** 배달 진행 중 종료 환급 (비즈니스 캐시 minor · D-13) */
          refundAmount?: number | null;
          /** AL-07: 팝업 기간 변경 뒤 재검토로 돌아갔는지 */
          revertedToReview?: boolean;
        };
        if (!res.ok || !j.ok) {
          setActionMsg(
            j.error === "fault_required"
              ? ko
                ? "귀책(운영 사유/회원 사유)을 선택해 주세요."
                : "Choose who is at fault."
              : j.error === "capacity_full"
              ? ko
                ? ADS_FEEDBACK.capacityFull.ko
                : ADS_FEEDBACK.capacityFull.en
              : j.error === "reason_required"
                ? ko
                  ? "사유를 입력해 주세요."
                  : "Please enter a reason."
                : j.error
                  ? adminOperatorErrorMessage(res.status === 403 ? "forbidden" : j.error, ko)
                  : ko
                    ? ADS_FEEDBACK.saveFailed.ko
                    : ADS_FEEDBACK.saveFailed.en
          );
          return;
        }
        const refundWarning = j.result?.refundWarning ?? null;
        const endRefund = typeof j.refundPoints === "number" ? j.refundPoints : j.refund_points;
        const deliveryEnd = action === "end" && (fam === "delivery_banner" || fam === "delivery_sponsored");
        const communityRefund =
          action === "end" && deliveryEnd && typeof j.refundAmount === "number"
            ? ko
              ? j.refundAmount > 0
                ? ` 환급 ${formatAdminDeliveryAdPriceOrUnset(j.refundAmount, "ko")}`
                : " 환급 없음"
              : ` Refund ${formatAdminDeliveryAdPriceOrUnset(j.refundAmount, "en")}`
            : action === "end" &&
                (fam === "boost_community" || fam === "boost_trade" || fam === "feed_banner") &&
                typeof endRefund === "number"
              ? ko
                ? endRefund > 0
                  ? ` 환급 ${formatAdminNumber(endRefund)} P`
                  : " 환급 없음"
                : ` Refund ${formatAdminNumber(endRefund)} P`
              : "";
        // AL-07: 기간 변경으로 재검토 대기가 되면 결과 문구에 「다시 승인 필요」를 보인다
        const periodReview =
          action === "change_period" && j.revertedToReview
            ? ko
              ? " 노출이 멈추고 검토 대기로 돌아갔습니다 — 다시 승인이 필요합니다."
              : " Moved back to review — approval is required again."
            : "";
        setActionMsg(
          periodReview
            ? `${feedbackForAction(action, ko)}${periodReview}`
            : communityRefund
            ? `${feedbackForAction(action, ko)}${communityRefund}`
            : refundWarning
            ? `${feedbackForAction(action, ko)} ${adminOperatorErrorMessage(refundWarning, ko)} ${t(
                j.result?.refundQueued ? "admin_r4c_ad_refund_queued" : "admin_r4c_ad_refund_not_queued"
              )}`
            : feedbackForAction(action, ko)
        );
        setPublicMessage("");
        setInternalMemo("");
        if (action === "add_internal_memo") setMemoReload((n) => n + 1);
        setManageOpenId(null);
        setPendingMutation(null);
        await load();
      } catch {
        setActionMsg(ko ? ADS_FEEDBACK.saveFailed.ko : ADS_FEEDBACK.saveFailed.en);
      } finally {
        setBusyAction(null);
      }
    },
    [publicMessage, internalMemo, extendDays, periodStart, periodEnd, load, ko, t]
  );

  /** 상위노출(커뮤니티·거래) 종료 = 귀책 선택·환급 미리보기 폼 (재감사 S-0 H-1: 거래도 같은 폼) */
  const boostEndFamily = pendingMutation?.action === "end" ? resolveFamily(pendingMutation.item) : null;
  /** 설계 §6 종료 L3 = 귀책 + 환급 미리보기 폼 — 상위노출·피드 배너(D-5)·배달 진행 중(D-13) 같은 폼 */
  const communityEndPending =
    boostEndFamily === "boost_community" ||
    boostEndFamily === "boost_trade" ||
    boostEndFamily === "feed_banner" ||
    ((boostEndFamily === "delivery_banner" || boostEndFamily === "delivery_sponsored") &&
      isDeliveryAdLiveEndLifecycle(pendingMutation?.item.expectedLifecycle ?? null))
      ? pendingMutation
      : null;
  const endIsDelivery = boostEndFamily === "delivery_banner" || boostEndFamily === "delivery_sponsored";
  /** 귀책 「해당 없음」은 피드·배달만 (상위노출 DB 함수는 운영/회원 두 가지) */
  const endAllowsNoFault = boostEndFamily === "feed_banner" || endIsDelivery;
  const communityEndEntityId = communityEndPending ? parseWorkspaceEntityId(communityEndPending.item.id) : null;

  useEffect(() => {
    setEndFault(null);
    setEndPreview(null);
  }, [pendingMutation]);

  // 귀책을 고르면 서버 계산으로 환급 예정 포인트를 먼저 보여 준다 (preview: 기록·변경 없음).
  useEffect(() => {
    if (!communityEndEntityId || !endFault) return;
    let alive = true;
    setEndPreview(null);
    void (async () => {
      try {
        const res = await fetch("/api/admin/advertising-workspace/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            family: boostEndFamily,
            entityId: communityEndEntityId,
            action: "end",
            fault: endFault,
            preview: true,
            reason: "환급 미리보기",
            publicMessage: "환급 미리보기",
            expectedUpdatedAt: communityEndPending?.item.expectedUpdatedAt ?? undefined,
            expectedLifecycle: communityEndPending?.item.expectedLifecycle ?? undefined,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          preview?: { refundPoints?: number } | null;
          refundPoints?: number;
          /** 거래 미리보기 응답(DB 함수 원문 키) */
          refund_points?: number;
          /** 배달 미리보기 (비즈니스 캐시 minor) */
          refundAmount?: number;
        };
        if (!alive) return;
        if (!res.ok || !j.ok) {
          setEndPreview({ fault: endFault, error: j.error || `http_${res.status}` });
          return;
        }
        setEndPreview({
          fault: endFault,
          refundPoints: Number(j.preview?.refundPoints ?? j.refundPoints ?? j.refund_points ?? j.refundAmount ?? 0),
        });
      } catch {
        if (alive) setEndPreview({ fault: endFault, error: "network_error" });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 대상 행이 바뀔 때만 다시 계산 (판 정보는 같은 행)
  }, [communityEndEntityId, endFault, boostEndFamily]);

  useEffect(() => {
    if (!selected) {
      setSavedMemos([]);
      return;
    }
    const family = resolveFamily(selected);
    if (!family) {
      setSavedMemos([]);
      return;
    }
    let alive = true;
    const q = new URLSearchParams({
      family,
      entityId: parseWorkspaceEntityId(selected.id),
    });
    void fetch(`/api/admin/advertising-workspace/memos?${q.toString()}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => ({})))
      .then((j: { ok?: boolean; memos?: Array<{ memo: string; createdAt: string }> }) => {
        if (alive) setSavedMemos(j.ok && Array.isArray(j.memos) ? j.memos : []);
      })
      .catch(() => {
        if (alive) setSavedMemos([]);
      });
    return () => {
      alive = false;
    };
  }, [selected, memoReload]);

  // AL-08: 상세(드로어)를 열면 기간 입력칸 초기값 = 현재 기간 (PHT)
  useEffect(() => {
    setPeriodStart(adminIsoToManilaInput(selected?.periodStartAt ?? null));
    setPeriodEnd(adminIsoToManilaInput(selected?.periodEndAt ?? null));
  }, [selected?.id, selected?.periodStartAt, selected?.periodEndAt]);

  const requestDrawerAction = useCallback(
    (action: WorkspaceDrawerAction, rowItem: AdsActionItem) => {
      // Ordinary internal note save — not a consequential Ads state mutation.
      if (action === "add_internal_memo") {
        void executeDrawerAction(action, rowItem);
        return;
      }
      // AL-08: 목록 행의 「기간 변경」은 입력칸이 있는 상세(드로어)를 연다 — 입력칸 초기값 = 현재 기간.
      if (action === "change_period" && selected?.id !== rowItem.id) {
        setSelected(rowItem);
        setActionMsg(ko ? "상세에서 시작·종료 일시를 고친 뒤 「기간 변경」을 누르세요." : "Edit the period in the detail panel, then press Change period.");
        return;
      }
      const fam = resolveFamily(rowItem);
      const copy = adsWorkspaceMutationConfirmCopy(action, ko, {
        boostSanction: mode === "boosts" && action === "pause",
        family: fam,
      });
      // 종료(L3)는 귀책 선택·환급 미리보기가 있는 입력 폼 대화상자 — 상위노출·피드 배너·배달 진행 중 (설계 §6).
      if (
        action === "end" &&
        (fam === "boost_community" ||
          fam === "boost_trade" ||
          fam === "feed_banner" ||
          ((fam === "delivery_banner" || fam === "delivery_sponsored") &&
            isDeliveryAdLiveEndLifecycle(rowItem.expectedLifecycle ?? null)))
      ) {
        setPendingMutation({ action, item: rowItem, copy });
        return;
      }
      // 확인 단계는 동작 표(copy.level = adminActionLevel)로 정하고, L2·L3 사유는 API 본문 reason 으로 보낸다.
      void (async () => {
        // 설계 §3-1: 광고 조치에 대상 재입력(retype) 없음 — 사유만 (L3 = 사유 · R2 중앙 정의)
        const confirmed = await confirmAdminAction({
          level: copy.level,
          ko,
          title: copy.title,
          description: copy.body,
          confirmLabel: copy.confirmLabel,
          destructive: copy.tone === "danger",
          reasonPlaceholder: copy.reasonLabel,
          splitReason: copy.splitReason,
        });
        if (!confirmed.ok) return;
        await executeDrawerAction(action, rowItem, confirmed.reason ?? undefined, null, confirmed.internalMemo ?? null);
      })();
    },
    [ko, mode, executeDrawerAction, selected]
  );

  const selectedFamily = selected ? resolveFamily(selected) : null;
  const selectedActions =
    selected && selectedFamily
      ? filterWorkspaceActionsByMode(
          listWorkspaceDrawerActions({
            family: selectedFamily,
            statusRaw: selected.status,
            popupDeleteSafe:
              selectedFamily === "platform_popup_campaign" ? isWorkspacePopupDeleteSafeDraft(selected) : undefined,
            pausedBy: selected.pausedBy ?? null,
          }),
          mode
        )
      : [];
  /** G-01 · IA-04: 드로어 조치 = 계열별 서버 가드와 같은 키 (배달=business · 피드 배너·팝업 캠페인=ads · 팝업 신청=business · 거래=O-2 · 커뮤니티=promotion) */
  const selectedFamilyActionRequirement = selectedFamily
    ? advertisingWorkspaceFamilyActionRequirement(selectedFamily)
    : null;
  const selectedFamilyActionDenied =
    selectedFamilyActionRequirement && accessActor && !actorMeetsAdminRouteRequirement(selectedFamilyActionRequirement, accessActor)
      ? describeAdminRequirementDenial(selectedFamilyActionRequirement)
      : null;
  /**
   * 재감사 S-2 (H-4): 목록 행의 조치 버튼도 드로어와 같은 계열별 권한으로 막는다 — 예전에는 사유까지 쓴 뒤 403 이 났다.
   */
  const rowActionDenied = (it: AdsActionItem | null | undefined): string | null => {
    if (!it || !accessActor) return null;
    const fam = resolveFamily(it);
    if (!fam) return null;
    const req = advertisingWorkspaceFamilyActionRequirement(fam);
    return actorMeetsAdminRouteRequirement(req, accessActor) ? null : describeAdminRequirementDenial(req);
  };
  const selectedShell = selected ? toAdsShellListRow(selected, ko, mode) : null;
  const opsControlMode = mode === "operations" || mode === "boosts";
  const headerCtas = advertisingWorkspaceHeaderCtas(mode);

  return (
    <div
      className="space-y-4"
      data-admin-advertising-shell="1"
      data-admin-advertising-workspace="1"
      data-admin-advertising-mode={mode}
      data-admin-boost-order-focus={boostFocusState}
      data-admin-boost-order-id={boostFocusState === "matched" ? boostOrderIdRaw : undefined}
    >
      {mode === "boosts" && boostFocusState !== "none" ? (
        <div
          className={
            boostFocusState === "matched"
              ? "rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px] text-sam-fg"
              : "rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 text-[13px] text-sam-danger"
          }
          role={boostFocusState === "matched" ? "status" : "alert"}
          data-admin-boost-order-focus-banner={boostFocusState}
        >
          {boostFocusState === "matched" && boostFocusMatch ? (
            <>
              {ko ? "상위노출 주문 선택" : "Boost order focus"}
              {": "}
              <span className="font-mono text-[12px]" data-admin-boost-order-focus-id>
                {parseWorkspaceEntityId(boostFocusMatch.id)}
              </span>
              {" · "}
              <span data-admin-boost-order-focus-title>{boostFocusMatch.applicantLabel}</span>
              {" · "}
              <span data-admin-boost-order-focus-domain>
                {boostFocusMatch.domain === "community_promote"
                  ? ko
                    ? "커뮤니티"
                    : "community"
                  : ko
                    ? "거래"
                    : "trade"}
              </span>
            </>
          ) : boostFocusState === "invalid" ? (
            ko
              ? "잘못된 상위노출 주문 ID입니다. 주문을 선택하지 않았습니다."
              : "Invalid Boost order id. No order selected."
          ) : (
            ko
              ? "해당 상위노출 주문을 찾을 수 없습니다. 주문을 선택하지 않았습니다."
              : "Boost order not found. No order selected."
          )}
        </div>
      ) : null}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1" data-admin-ads-workspace-title="1">
          {/* 표준 헤더 — 제목 = 메뉴 라벨 키 (§2.8) */}
          <AdminPageHeader titleKey={modeTitleKey(mode)} description={modeDescription(mode, ko)} />
          <p className="text-[12px] text-sam-muted" data-admin-ads-promotion-deeplink-note="1">
            {/* D-19 (Owner 권장안 승인 2026-11-04): 목록에 없는 인트로·PTR·마이 배너·이벤트는 아래 카드에서 바로 이동 */}
            {model?.page?.ledger
              ? t("ads_ledger_note_rows")
              : mode === "all"
              ? ko
                ? "인트로·당겨서 새로고침 광고·마이 배너·이벤트는 아래 카드에서 바로 이동해 관리합니다."
                : "Manage intro, pull-to-refresh ads, My page banners and events from the cards below."
              : ko
                ? "인트로·당겨서 새로고침 광고·마이 배너·이벤트는 「전체 광고」 화면 카드에서 바로 이동합니다."
                : "Intro, pull-to-refresh ads, My page banners and events are linked from the All ads cards."}{" "}
            <AdminActionLink
              href={PROMOTION_WORKSPACE_HREF}
              variant="quiet"
              data-admin-ads-to-promotion-deeplink="1"
            >
              {ko ? "플랫폼 운영" : "Platform operations"}
            </AdminActionLink>
          </p>
          {storeFilter ? (
            <span
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-sam-border bg-sam-surface-muted px-3 py-1 text-[12px] text-sam-fg"
              data-admin-ads-store-filter-chip="1"
            >
              <span className="truncate" title={storeFilter}>
                {ko ? "매장 필터" : "Store filter"}: {storeFilterLabel}
              </span>
              <AdminActionButton
                variant="quiet"
                size="sm"
                className="shrink-0"
                onClick={clearStoreFilter}
                aria-label={ko ? "매장 필터 해제" : "Clear store filter"}
              >
                {ko ? "해제" : "Clear"}
              </AdminActionButton>
            </span>
          ) : null}
          {domainFilter ? (
            <span
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-sam-border bg-sam-surface-muted px-3 py-1 text-[12px] text-sam-fg"
              data-admin-ads-domain-filter-chip={domainFilter}
            >
              <span className="truncate">
                {ko
                  ? `${adsLedgerDomainLabel(domainFilter, true)}만 보는 중`
                  : `Showing ${adsLedgerDomainLabel(domainFilter, false)} only`}
              </span>
              <AdminActionButton variant="quiet" size="sm" className="shrink-0" onClick={clearDomainFilter}>
                {ko ? "전체 보기" : "Show all"}
              </AdminActionButton>
            </span>
          ) : null}
          {kindFilter || locationFilter || advertiserFilter ? (
            <div className="flex flex-wrap gap-2" data-admin-ads-ledger-filters="1">
              {kindFilter ? (
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-sam-border bg-sam-surface-muted px-3 py-1 text-[12px] text-sam-fg"
                  data-admin-ads-kind-filter-chip={kindFilter}
                >
                  {t("ads_ledger_filter_kind", { label: adsLedgerKindLabel(kindFilter, ko) })}
                  <AdminActionButton variant="quiet" size="sm" onClick={() => clearLedgerFilter("kind")}>
                    {t("ads_ledger_filter_clear")}
                  </AdminActionButton>
                </span>
              ) : null}
              {locationFilter ? (
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-sam-border bg-sam-surface-muted px-3 py-1 text-[12px] text-sam-fg"
                  data-admin-ads-location-filter-chip={locationFilterValue}
                >
                  {t("ads_ledger_filter_location", {
                    label: adLocationLabel(
                      {
                        locationKey: locationFilter.key,
                        locationTarget: locationFilter.target,
                        locationTargetName: model?.locationCounts?.find(
                          (c) => c.locationKey === locationFilter.key && (c.locationTarget ?? null) === locationFilter.target
                        )?.locationTargetName,
                      },
                      ko
                    ),
                  })}
                  <AdminActionButton variant="quiet" size="sm" onClick={() => clearLedgerFilter("location")}>
                    {t("ads_ledger_filter_clear")}
                  </AdminActionButton>
                </span>
              ) : null}
              {advertiserFilter ? (
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-sam-border bg-sam-surface-muted px-3 py-1 text-[12px] text-sam-fg"
                  data-admin-ads-advertiser-filter-chip="1"
                >
                  {t("ads_ledger_filter_advertiser")}
                  {advertiserFilterLedger ? `: ${adsLedgerAdvertiserLabel(advertiserFilterLedger, ko)}` : ""}
                  <AdminActionButton variant="quiet" size="sm" onClick={() => clearLedgerFilter("advertiser")}>
                    {t("ads_ledger_filter_clear")}
                  </AdminActionButton>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {headerCtas.showRegister || headerCtas.showPlacementsLink ? (
          <div className="flex flex-wrap gap-2">
            {mode === "operations" ? (
              /* G-16 — 피드(거래·Community) 배너 생성 화면 진입. 노출 관리 표가 피드 배너를 보여 주는 화면. */
              <AdminActionLink
                href="/admin/feed-ads/new"
                variant="primary"
                className="min-h-12 px-4 font-semibold"
                data-admin-ads-feed-banner-create="1"
              >
                {ko ? "피드 배너 등록" : "Register feed banner"}
              </AdminActionLink>
            ) : null}
            {headerCtas.showRegister ? (
              <AdminActionLink
                href="/admin/advertising/direct"
                variant="primary"
                className="min-h-12 px-6 text-base font-bold shadow-sm"
                data-admin-ads-register-cta="1"
              >
                {ko ? "+ 광고 등록" : "+ Register ad"}
              </AdminActionLink>
            ) : null}
            {headerCtas.showPlacementsLink ? (
              <AdminActionLink
                href="/admin/advertising/placements"
                variant="secondary"
                className="min-h-12 px-4 font-semibold"
                data-admin-ads-placement-cta="1"
              >
                {ko ? "광고 위치 관리" : "Ad placements"}
              </AdminActionLink>
            ) : null}
          </div>
        ) : null}
        {/* Owner 결정 O-5: 공통 목록에 없는 광고 4종도 이 화면에서 보고 들어간다 (읽기 전용 카드) */}
        {mode === "all" ? <AdminAdsOtherSurfacesCards ko={ko} /> : null}
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-shell-summary="1">
        {(
          [
            ["pending", ko ? "승인 대기" : "Pending", summary.pending],
            ["live", ko ? "노출 중" : "Live", summary.live],
            ["waiting", ko ? "노출 대기" : "Waiting", summary.waiting],
            ["incomplete", ko ? "불완전/임시" : "Incomplete", summary.incomplete],
            ["scheduled", ko ? "예약" : "Scheduled", summary.scheduled],
            [
              "hero",
              ko
                ? `홈 배너 ${summary.heroCap - summary.vacant}/${summary.heroCap}`
                : `Hero ${summary.heroCap - summary.vacant}/${summary.heroCap}`,
              summary.vacant,
            ],
          ] as const
        ).map(([key, label, value]) => (
          <AdminActionButton
            key={key}
            variant="secondary"
            className="!h-auto flex-col !items-start px-3 py-2 text-left font-normal"
            onClick={() => {
              if (
                key === "pending" ||
                key === "live" ||
                key === "waiting" ||
                key === "incomplete" ||
                key === "scheduled"
              ) {
                setStatusTab(key);
              }
            }}
          >
            <div className="text-[12px] text-sam-muted">{label}</div>
            <div className="text-[16px] font-semibold tabular-nums text-sam-fg">
              {key === "hero"
                ? `${summary.heroCap - summary.vacant}/${summary.heroCap}`
                : formatAdminNumber(value)}
            </div>
          </AdminActionButton>
        ))}
      </div>

      <div data-shell-status-tabs="1">
        <AdminTabs
          ariaLabel={ko ? "상태" : "Status"}
          param="status"
          syncUrl={false}
          value={statusTab}
          onChange={(id) => setStatusTab(id)}
          tabs={statusTabsForMode(mode).map((t) => ({ id: t.id, label: ko ? t.ko : t.en }))}
        />
      </div>

      <div className="flex flex-wrap gap-2" data-shell-family-tabs="1">
        {familyTabsForMode(mode).map((t) => (
          <AdminChipButton
            key={t.id}
            selected={family === t.id}
            data-family-tab={t.id}
            onClick={() => setFamily(t.id)}
          >
            {ko ? t.ko : t.en}
          </AdminChipButton>
        ))}
      </div>

      {showKindChips ? (
        <div className="flex flex-wrap gap-2" data-shell-kind-tabs="1" role="group" aria-label={t("ads_ledger_kind_chips_label")}>
          <AdminChipButton selected={!kindFilter} data-kind-tab="all" onClick={() => setKindFilter("")}>
            {t("ads_ledger_kind_all")}
          </AdminChipButton>
          {ADS_LEDGER_KINDS.map((k) => {
            const n = kindChipCounts ? (kindChipCounts[k] ?? 0) : null;
            return (
              <AdminChipButton
                key={k}
                selected={kindFilter === k}
                count={n}
                data-kind-tab={k}
                // 0건 종류도 보이되(없다는 것을 알 수 있게) 누르지 않는다 — 지금 고른 종류는 해제할 수 있게 둔다
                disabled={n === 0 && kindFilter !== k}
                onClick={() => setKindFilter(kindFilter === k ? "" : k)}
              >
                {adsLedgerKindLabel(k, ko)}
              </AdminChipButton>
            );
          })}
        </div>
      ) : null}

      {family === "popup" && popupQueue.length > 0 ? (
        <section
          className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
          data-popup-occupancy-queue="1"
        >
          <h2 className="text-sm font-semibold text-sam-fg">
            {ko ? "팝업 위치별 점유" : "Popup occupancy by surface"}
          </h2>
          {popupQueue.map((q) => (
            <div key={q.surface} className="rounded-ui-rect border border-sam-border bg-sam-app p-2 text-[12px]">
              <div className="font-medium text-sam-fg">{q.surface}</div>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                <div>
                  <div className="text-sam-muted">
                    {ko ? `현재 노출 중 ${q.live.length}건` : `Live ${q.live.length}`}
                  </div>
                  {q.live.map((r) => (
                    <div key={r.id} className="truncate text-sam-fg">
                      {r.title}
                    </div>
                  ))}
                  {q.live.length === 0 ? <div className="text-sam-muted">—</div> : null}
                </div>
                <div>
                  <div className="text-sam-muted">
                    {ko ? `노출 대기 ${q.waiting.length}건` : `Waiting ${q.waiting.length}`}
                  </div>
                  {q.waiting.map((r) => (
                    <div key={r.id} className="truncate text-sam-fg">
                      {r.title}
                    </div>
                  ))}
                  {q.waiting.length === 0 ? <div className="text-sam-muted">—</div> : null}
                </div>
                <div>
                  <div className="text-sam-muted">
                    {ko ? `불완전 ${q.incompleteCount}건` : `Incomplete ${q.incompleteCount}`}
                  </div>
                </div>
                <div>
                  <div className="text-sam-muted">
                    {ko ? `예약 ${q.scheduledCount}건` : `Scheduled ${q.scheduledCount}`}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {err ? <AdminErrorState ko={ko} code={err} httpStatus={errStatus} onRetry={() => void load()} /> : null}
      {actionMsg ? (
        <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm" role="status">
          {actionMsg}
        </p>
      ) : null}

      <div className="grid gap-4">
        {!model ? (
          err ? null : <AdminLoadingState ko={ko} />
        ) : shellRows.length === 0 && listPage <= 1 ? (
          <AdminEmptyState
            ko={ko}
            message={
              lq.isFiltered
                ? undefined
                : mode === "applications"
                  ? ko
                    ? "승인 대기 중인 광고가 없습니다."
                    : "No applications awaiting approval."
                  : mode === "operations"
                    ? ko
                      ? "현재 운영 중인 광고가 없습니다."
                      : "No ads currently in operations."
                    : undefined
            }
            onReset={lq.isFiltered ? lq.reset : undefined}
            action={
              // 빈 목록에서 첫 광고 등록 — 머리글에 「광고 등록」이 있는 화면(전체·노출 관리)과 같은 등록 화면으로 간다.
              mode === "operations" || mode === "all" ? (
                registerGuard.allowed ? (
                  <AdminActionLink
                    href="/admin/advertising/direct"
                    variant="primary"
                    size="sm"
                    data-admin-ads-ops-empty-register="1"
                  >
                    {ko ? "+ 광고 등록" : "+ Register ad"}
                  </AdminActionLink>
                ) : (
                  <AdminActionButton
                    variant="primary"
                    size="sm"
                    disabled
                    title={registerGuard.reason ?? undefined}
                    data-admin-ads-ops-empty-register="1"
                  >
                    {ko ? "+ 광고 등록" : "+ Register ad"}
                  </AdminActionButton>
                )
              ) : undefined
            }
          />
        ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="min-w-full text-left text-[12px]" data-shell-table="1">
            <thead className="bg-sam-app text-sam-muted">
              <tr>
                <th className="px-2 py-2 font-medium">{ko ? "제품" : "Product"}</th>
                <th className="px-2 py-2 font-medium">{ko ? "대상 / 소재" : "Target"}</th>
                {opsControlMode ? null : (
                  <>
                    <th className="px-2 py-2 font-medium">{ko ? "출처/신청자" : "Source"}</th>
                    <th className="px-2 py-2 font-medium">{ko ? "회원/매장" : "Member/Store"}</th>
                  </>
                )}
                <th className="px-2 py-2 font-medium">
                  {opsControlMode
                    ? ko
                      ? "실제 노출 위치"
                      : "Actual location"
                    : ko
                      ? "노출 위치"
                      : "Placement"}
                </th>
                <th className="px-2 py-2 font-medium">{ko ? "기간" : "Period"}</th>
                {opsControlMode ? null : (
                  <th className="px-2 py-2 font-medium">{ko ? "남은 기간" : "Remaining"}</th>
                )}
                {opsControlMode ? null : (
                  <th className="px-2 py-2 font-medium">{ko ? "결제" : "Pay"}</th>
                )}
                <th className="px-2 py-2 font-medium">
                  {mode === "applications"
                    ? ko
                      ? "승인 상태"
                      : "Approval"
                    : ko
                      ? "운영 상태"
                      : "Ops"}
                </th>
                <th className="px-2 py-2 font-medium">{ko ? "실제 노출 상태" : "Runtime"}</th>
                <th className="px-2 py-2 font-medium">
                  {mode === "applications"
                    ? ko
                      ? "검토"
                      : "Review"
                    : opsControlMode
                      ? ko
                        ? "다음 작업"
                        : "Next action"
                      : ko
                        ? "관리"
                        : "Manage"}
                </th>
              </tr>
            </thead>
            <tbody>
              {shellRows.map((r) => {
                  const item = itemById.get(r.id);
                  const fam = item ? resolveFamily(item) : null;
                  const actions =
                    item && fam
                      ? filterWorkspaceActionsByMode(
                          listWorkspaceDrawerActions({
                            family: fam,
                            statusRaw: item.status,
                            popupDeleteSafe:
                              fam === "platform_popup_campaign" ? isWorkspacePopupDeleteSafeDraft(item) : undefined,
                            pausedBy: item.pausedBy ?? null,
                          }),
                          mode
                        )
                      : [];
                  const open = manageOpenId === r.id;
                  /** 원장 칸 (§1-3) — 있으면 종류·위치·광고주·결제·상태·성과를 원장 값으로 */
                  const lx = item?.ledger ? adsLedgerRowTexts(item.ledger, ko) : null;
                  const primary =
                    opsControlMode
                      ? resolveOperationsPrimaryCta(r, {
                          mode: mode === "boosts" ? "boosts" : "operations",
                        })
                      : null;
                  const liveLink = adsLiveLinkLabel({
                    href: r.liveHref,
                    domain: r.domain,
                    ko,
                  });
                  const creativeMissing =
                    !r.creativeImageUrl &&
                    (r.domain === "feed" ||
                      r.domain === "delivery" ||
                      r.domain === "popup" ||
                      /banner|popup/i.test(r.product));
                  return (
                    <tr
                      key={r.id}
                      className={
                        boostFocusMatch && r.id === boostFocusMatch.id
                          ? "border-t border-sam-border align-top bg-sam-app/80 ring-1 ring-inset ring-sam-primary/30"
                          : "border-t border-sam-border align-top"
                      }
                      data-admin-boost-order-row={r.id}
                      data-admin-boost-order-focused={
                        boostFocusMatch && r.id === boostFocusMatch.id ? "1" : undefined
                      }
                    >
                      <td className="px-2 py-2">
                        <div className="flex min-w-[140px] items-center gap-2">
                          {r.creativeImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- operator creative thumbnail
                            <img
                              src={r.creativeImageUrl}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-ui-rect object-cover"
                            />
                          ) : creativeMissing ? (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-app px-0.5 text-center text-[12px] leading-tight text-sam-muted">
                              {ko ? "이미지 없음" : "No image"}
                            </span>
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-rect border border-dashed border-sam-border text-[12px] text-sam-muted">
                              {ko ? "대상" : "Tgt"}
                            </span>
                          )}
                          <span className="font-medium text-sam-fg" data-admin-ads-ledger-kind={item?.ledger?.kind}>
                            {lx ? lx.kindLabel : r.kindLabel}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2 max-w-[180px]">
                        <div className="truncate font-medium">{r.title}</div>
                        {opsControlMode ? (
                          <div className="mt-0.5 truncate text-[12px] text-sam-muted">
                            {lx ? lx.advertiser : r.targetLabel !== r.title ? r.targetLabel : r.applicantLabel}
                          </div>
                        ) : null}
                        {opsControlMode && lx ? (
                          <div className="mt-0.5 truncate text-[12px] text-sam-muted" data-admin-ads-ledger-payment={r.id}>
                            {lx.payment}
                          </div>
                        ) : null}
                      </td>
                      {opsControlMode ? null : (
                        <>
                          <td className="px-2 py-2" data-admin-ads-ledger-advertiser={lx ? r.id : undefined}>
                            {lx
                              ? lx.advertiser
                              : r.sourceKind === "admin_direct"
                                ? ko
                                  ? "운영자 등록"
                                  : "Operator registered"
                                : r.applicantLabel}
                          </td>
                          <td className="px-2 py-2">
                            {lx && item?.ledger?.advertiserId && item.memberHref ? (
                              <Link href={item.memberHref} className="underline">
                                {lx.advertiser}
                              </Link>
                            ) : lx ? (
                              "—"
                            ) : (
                              r.memberOrStore
                            )}
                          </td>
                        </>
                      )}
                      <td className="px-2 py-2 max-w-[220px] text-[12px]" data-admin-ads-ledger-location={lx ? r.id : undefined}>
                        {lx ? lx.location : r.placementLabel}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-[12px]">
                        <div>{r.periodLabel}</div>
                        {lx ? (
                          <div className="text-[12px] tabular-nums text-sam-muted" data-admin-ads-ledger-performance={r.id}>
                            {lx.performance}
                          </div>
                        ) : r.performanceLabel ? (
                          <div className="text-[12px] tabular-nums text-sam-muted" data-feed-ad-counts={r.id}>
                            {r.performanceLabel}
                          </div>
                        ) : null}
                        {opsControlMode ? (
                          <div className="text-[12px] text-sam-muted">{r.remainingLabel}</div>
                        ) : null}
                      </td>
                      {opsControlMode ? null : (
                        <td className="px-2 py-2 whitespace-nowrap text-[12px]">{r.remainingLabel}</td>
                      )}
                      {opsControlMode ? null : (
                        <td className="px-2 py-2" data-admin-ads-ledger-payment={lx ? r.id : undefined}>
                          {lx ? lx.payment : r.paymentLabel}
                        </td>
                      )}
                      <td className="px-2 py-2" data-admin-ads-ledger-status={lx ? r.id : undefined}>
                        {lx ? lx.statusLabel : mode === "applications" ? r.applicationStatusLabel : r.campaignStatusLabel}
                      </td>
                      <td className="px-2 py-2">
                        <div>{r.runtimeExposureStatusLabel}</div>
                        {mode !== "applications" && r.waitingReasonLabel ? (
                          <div className="mt-1 max-w-[180px] text-[12px] text-sam-muted">
                            {r.waitingReasonLabel}
                          </div>
                        ) : null}
                        {opsControlMode &&
                        r.statusTab === "waiting" &&
                        !r.waitingReasonLabel ? (
                          <div className="mt-1 max-w-[180px] text-[12px] text-sam-muted">
                            {operationsWaitingFallback(ko)}
                          </div>
                        ) : null}
                        {mode !== "applications" && r.winnerOccupantLabel ? (
                          <div className="mt-1 max-w-[180px] text-[12px] text-sam-muted">
                            {ko ? "현재 점유" : "Occupant"}: {r.winnerOccupantLabel}
                          </div>
                        ) : null}
                      </td>
                      <td className="relative px-2 py-2">
                        {item?.ledger && mode !== "applications" ? (
                          /* 바로 가기 (§2) · 관리 패널(바로 수정·삭제) */
                          <div className="mb-1 flex flex-col items-start gap-1" data-admin-ads-ledger-row-tools={r.id}>
                            <AdminActionButton
                              variant="quiet"
                              size="sm"
                              data-admin-ads-ledger-open-panel="1"
                              onClick={() => setSelected(item)}
                            >
                              {t("ads_ledger_open_panel")}
                            </AdminActionButton>
                            <AdminAdsLedgerShortcuts item={item} compact />
                          </div>
                        ) : null}
                        {mode === "applications" ? (
                          <div className="flex flex-col items-start gap-1">
                            <AdminActionLink
                              href={r.href}
                              variant="ghost"
                              size="sm"
                              data-admin-ads-review-cta="1"
                              data-shell-review="1"
                            >
                              {ko ? "검토하기" : "Review"}
                            </AdminActionLink>
                            <AdminActionButton
                              variant="quiet"
                              size="sm"
                              data-shell-manage="1"
                              onClick={() => {
                                setManageOpenId(open ? null : r.id);
                                if (item) setSelected(item);
                              }}
                            >
                              {ko ? "더보기" : "More"}
                            </AdminActionButton>
                            {open && item ? (
                              <div
                                className="absolute right-0 z-20 mt-1 min-w-[160px] rounded-ui-rect border border-sam-border bg-sam-surface p-2 shadow-md"
                                data-shell-manage-menu="1"
                              >
                                <Link
                                  href={r.href}
                                  className="block px-2 py-1.5 text-[12px] hover:bg-sam-app"
                                >
                                  {ko ? "상세" : "Detail"}
                                </Link>
                                {r.previewSupported ? (
                                  <Link
                                    href={r.previewHref}
                                    className="block px-2 py-1.5 text-[12px] hover:bg-sam-app"
                                  >
                                    {ko ? "미리보기" : "Preview"}
                                  </Link>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : opsControlMode && primary ? (
                          <div className="flex flex-col items-start gap-1">
                            {primary.mutation && item ? (
                              <AdminActionButton
                                variant="ghost"
                                size="sm"
                                data-admin-ads-ops-primary={primary.kind}
                                disabled={busyAction != null || pendingMutation != null || rowActionDenied(item) != null}
                                title={rowActionDenied(item) ?? undefined}
                                onClick={() => {
                                  setSelected(item);
                                  requestDrawerAction(primary.mutation!, item);
                                }}
                              >
                                {ko ? primary.labelKo : primary.labelEn}
                              </AdminActionButton>
                            ) : primary.href ? (
                              <AdminActionLink
                                href={primary.href}
                                target="_blank"
                                rel="noreferrer"
                                variant="ghost"
                                size="sm"
                                data-admin-ads-ops-primary={primary.kind}
                              >
                                {ko ? primary.labelKo : primary.labelEn}
                              </AdminActionLink>
                            ) : primary.adminHref && !primary.selectDetail ? (
                              <AdminActionLink
                                href={primary.adminHref}
                                variant="ghost"
                                size="sm"
                                data-admin-ads-ops-primary={primary.kind}
                              >
                                {ko ? primary.labelKo : primary.labelEn}
                              </AdminActionLink>
                            ) : (
                              <AdminActionButton
                                variant="ghost"
                                size="sm"
                                data-admin-ads-ops-primary={primary.kind}
                                onClick={() => {
                                  if (item) setSelected(item);
                                  setManageOpenId(null);
                                }}
                              >
                                {ko ? primary.labelKo : primary.labelEn}
                              </AdminActionButton>
                            )}
                            <AdminActionButton
                              variant="quiet"
                              size="sm"
                              data-shell-manage="1"
                              onClick={() => {
                                setManageOpenId(open ? null : r.id);
                                if (item) setSelected(item);
                              }}
                            >
                              {ko ? "더보기" : "More"}
                            </AdminActionButton>
                            {open && item ? (
                              <div
                                className="absolute right-0 z-20 mt-1 min-w-[180px] rounded-ui-rect border border-sam-border bg-sam-surface p-2 shadow-md"
                                data-shell-manage-menu="1"
                              >
                                <Link
                                  href={r.href}
                                  className="block px-2 py-1.5 text-[12px] hover:bg-sam-app"
                                >
                                  {ko ? "상세" : "Detail"}
                                </Link>
                                {r.previewSupported ? (
                                  <Link
                                    href={r.previewHref}
                                    className="block px-2 py-1.5 text-[12px] hover:bg-sam-app"
                                    data-admin-ads-preview-link="1"
                                  >
                                    {ko ? "미리보기" : "Preview"}
                                  </Link>
                                ) : null}
                                {liveLink ? (
                                  <a
                                    href={liveLink.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block px-2 py-1.5 text-[12px] hover:bg-sam-app"
                                    data-admin-ads-live-link={liveLink.exact ? "exact" : "domain"}
                                  >
                                    {ko ? liveLink.labelKo : liveLink.labelEn}
                                  </a>
                                ) : null}
                                {actions.map((a) => (
                                  <AdminActionButton
                                    key={a}
                                    variant={a === "delete_safe_draft" ? "danger" : "quiet"}
                                    size="sm"
                                    className="w-full !justify-start"
                                    disabled={busyAction != null || pendingMutation != null || rowActionDenied(item) != null}
                                title={rowActionDenied(item) ?? undefined}
                                    onClick={() => requestDrawerAction(a, item)}
                                  >
                                    {mode === "boosts" && a === "pause"
                                      ? ko
                                        ? "제재(노출 중지)"
                                        : "Sanction (pause)"
                                      : ko
                                        ? ACTION_LABEL[a].ko
                                        : ACTION_LABEL[a].en}
                                  </AdminActionButton>
                                ))}
                                {mode === "operations" && r.domain === "delivery" ? (
                                  <Link
                                    href="/admin/advertising/placements"
                                    className="block px-2 py-1.5 text-[12px] hover:bg-sam-app"
                                  >
                                    {ko ? "순서 변경" : "Reorder"}
                                  </Link>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <>
                            <AdminActionButton
                              variant="ghost"
                              size="sm"
                              data-shell-manage="1"
                              onClick={() => {
                                setManageOpenId(open ? null : r.id);
                                if (item) setSelected(item);
                              }}
                            >
                              {ko ? "관리 ▼" : "Manage ▼"}
                            </AdminActionButton>
                            {open && item ? (
                              <div
                                className="absolute right-0 z-20 mt-1 min-w-[160px] rounded-ui-rect border border-sam-border bg-sam-surface p-2 shadow-md"
                                data-shell-manage-menu="1"
                              >
                                <Link
                                  href={r.href}
                                  className="block px-2 py-1.5 text-[12px] hover:bg-sam-app"
                                >
                                  {ko ? "상세" : "Detail"}
                                </Link>
                                {r.previewSupported ? (
                                  <Link
                                    href={r.previewHref}
                                    className="block px-2 py-1.5 text-[12px] hover:bg-sam-app"
                                  >
                                    {ko ? "미리보기" : "Preview"}
                                  </Link>
                                ) : null}
                                {liveLink ? (
                                  <a
                                    href={liveLink.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block px-2 py-1.5 text-[12px] hover:bg-sam-app"
                                    data-admin-ads-live-link={liveLink.exact ? "exact" : "domain"}
                                  >
                                    {ko ? liveLink.labelKo : liveLink.labelEn}
                                  </a>
                                ) : null}
                                {actions.map((a) => (
                                  <AdminActionButton
                                    key={a}
                                    variant={a === "delete_safe_draft" ? "danger" : "quiet"}
                                    size="sm"
                                    className="w-full !justify-start"
                                    disabled={busyAction != null || pendingMutation != null || rowActionDenied(item) != null}
                                title={rowActionDenied(item) ?? undefined}
                                    onClick={() => requestDrawerAction(a, item)}
                                  >
                                    {mode === "boosts" && a === "pause"
                                      ? ko
                                        ? "제재(노출 중지)"
                                        : "Sanction (pause)"
                                      : ko
                                        ? ACTION_LABEL[a].ko
                                        : ACTION_LABEL[a].en}
                                  </AdminActionButton>
                                ))}
                              </div>
                            ) : null}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        )}
        {model && (listTotal > 0 || listPage > 1) ? (
          <AdminPagination
            ko={ko}
            page={listPage}
            size={listSize}
            total={listTotal}
            onPageChange={lq.setPage}
            onSizeChange={lq.setSize}
          />
        ) : null}

        {(opsControlMode || mode === "all" || mode === "history") && selected && selectedShell ? (
        <aside
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
          data-shell-detail-panel="1"
          data-admin-boost-order-detail={
            selected.domain === "community_promote" || selected.domain === "trade_promote"
              ? parseWorkspaceEntityId(selected.id)
              : undefined
          }
        >
          {(
            <div className="space-y-3">
              <div>
                <p className="text-[12px] font-semibold text-sam-muted">{selectedShell.kindLabel}</p>
                <h2 className="mt-0.5 font-semibold text-sam-fg">{selectedShell.title}</h2>
                <p className="mt-1 text-[12px] text-sam-fg">
                  <span className="text-sam-muted">{ko ? "운영" : "Ops"}: </span>
                  {selectedShell.operatingStatusLabel || "—"}
                  {" · "}
                  <span className="text-sam-muted">{ko ? "실제 노출" : "Runtime"}: </span>
                  {selectedShell.runtimeExposureStatusLabel}
                </p>
              </div>

              {selected.ledger ? (
                /* 원장 칸 · 바로 가기 · 바로 수정 · 삭제 (설계 §1-3 · §2 · §3-2 · §3-3) */
                <AdminAdsLedgerDrawerPanel key={selected.id} item={selected} onChanged={() => void load()} />
              ) : (
                <section className="rounded-ui-rect border border-sam-border bg-sam-app p-3">
                  <h3 className="text-[12px] font-semibold text-sam-fg">
                    {ko ? "실제 노출 위치" : "Actual exposure location"}
                  </h3>
                  <p className="mt-1 text-[13px] text-sam-fg">{selectedShell.placementLabel}</p>
                </section>
              )}

              <section className="rounded-ui-rect border border-sam-border bg-sam-app p-3">
                <h3 className="text-[12px] font-semibold text-sam-fg">
                  {ko ? "노출 기간" : "Exposure period"}
                </h3>
                <dl className="mt-1 space-y-1 text-[12px]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-sam-muted">{ko ? "기간" : "Period"}</dt>
                    <dd>{selectedShell.periodLabel}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-sam-muted">{ko ? "남은 기간" : "Remaining"}</dt>
                    <dd>{selectedShell.remainingLabel}</dd>
                  </div>
                  {selectedShell.performanceLabel ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-sam-muted">{ko ? "노출 · 클릭" : "Views · clicks"}</dt>
                      <dd className="tabular-nums">{selectedShell.performanceLabel}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>

              <section className="rounded-ui-rect border border-sam-border bg-sam-app p-3">
                <h3 className="text-[12px] font-semibold text-sam-fg">
                  {ko ? "광고 미리보기" : "Ad preview"}
                </h3>
                {selectedShell.creativeImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- operator creative preview
                  <img
                    src={selectedShell.creativeImageUrl}
                    alt=""
                    className="mt-2 max-h-52 w-full rounded-ui-rect object-cover"
                  />
                ) : (
                  <p className="mt-2 text-[12px] text-sam-muted">
                    {selected.domain === "trade_promote" || selected.domain === "community_promote"
                      ? selectedShell.targetLabel || selectedShell.title
                      : ko
                        ? "이미지 없음"
                        : "No image"}
                  </p>
                )}
              </section>

              <dl className="space-y-1 text-[12px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "신청자" : "Applicant"}</dt>
                  <dd>{selectedShell.applicantLabel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "회원/매장" : "Member/Store"}</dt>
                  <dd>{selectedShell.memberOrStore}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "결제" : "Payment"}</dt>
                  <dd>{selectedShell.paymentLabel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "우선순위" : "Priority"}</dt>
                  <dd>{selectedShell.priority ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">CTA</dt>
                  <dd>{selectedShell.ctaLabel || "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-sam-muted">{ko ? "이동 대상" : "Destination"}</dt>
                  <dd className="max-w-[210px] break-all text-right">
                    {selectedShell.destinationLabel || "—"}
                  </dd>
                </div>
              </dl>
              {selectedShell.missingFieldsLabel ? (
                <p className="rounded-ui-rect bg-sam-app px-3 py-2 text-[12px] text-sam-muted">
                  {ko ? "불완전" : "Incomplete"}
                  {" · "}
                  {selectedShell.missingFieldsLabel}
                </p>
              ) : null}
              {selectedShell.statusTab === "waiting" ||
              selectedShell.runtimeDisplayStatus === "eligible_waiting" ? (
                <p className="whitespace-pre-wrap rounded-ui-rect bg-sam-app px-3 py-2 text-[12px] text-sam-muted">
                  {selectedShell.waitingReasonLabel || operationsWaitingFallback(ko)}
                </p>
              ) : null}

              {selectedActions.includes("change_period") ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-[12px] text-sam-muted">
                    {ko ? "시작 (PHT)" : "Start (PHT)"}
                    <input
                      type="datetime-local"
                      className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                    />
                  </label>
                  <label className="block text-[12px] text-sam-muted">
                    {ko ? "종료 (PHT)" : "End (PHT)"}
                    <input
                      type="datetime-local"
                      className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                    />
                  </label>
                </div>
              ) : null}

              <label className="block text-[12px] text-sam-muted">
                {ko ? "신청자 메시지 (반려·보류·연장)" : "Applicant-visible message"}
                <textarea
                  className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm"
                  rows={2}
                  value={publicMessage}
                  onChange={(e) => setPublicMessage(e.target.value)}
                />
              </label>
              {selectedActions.includes("extend_compensation") ? (
                <label className="block text-[12px] text-sam-muted">
                  {ko ? "연장 일수" : "Extend days"}
                  <input
                    type="number"
                    min={1}
                    max={90}
                    className="mt-1 w-24 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm"
                    value={extendDays}
                    onChange={(e) => setExtendDays(Math.max(1, Number(e.target.value) || 1))}
                  />
                </label>
              ) : null}
              <label className="block text-[12px] text-sam-muted">
                {ko ? "내부 메모" : "Internal memo"}
                <textarea
                  className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm"
                  rows={2}
                  value={internalMemo}
                  onChange={(e) => setInternalMemo(e.target.value)}
                />
              </label>
              {savedMemos.length > 0 ? (
                <ul className="space-y-1 text-[12px] text-sam-muted" data-admin-ads-saved-memos="1">
                  {savedMemos.map((m, i) => (
                    <li key={`${m.createdAt}-${i}`} className="rounded-ui-rect border border-sam-border px-2 py-1">
                      <span className="text-sam-fg">{m.memo}</span>
                      <span className="ml-2">{formatAdminManilaDateTime(m.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {selectedFamilyActionDenied ? (
                <p className="text-[12px] text-sam-muted" data-admin-action-denied="1">
                  {selectedFamilyActionDenied}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {selectedActions.map((a) => (
                  <AdminActionButton
                    key={a}
                    type="button"
                    disabled={busyAction != null || pendingMutation != null || selectedFamilyActionDenied != null}
                    title={selectedFamilyActionDenied ?? undefined}
                    onClick={() => requestDrawerAction(a, selected)}
                    data-drawer-action={a}
                  >
                    {busyAction === a
                      ? "…"
                      : mode === "boosts" && a === "pause"
                        ? ko
                          ? "제재"
                          : "Sanction"
                        : ko
                          ? ACTION_LABEL[a].ko
                          : ACTION_LABEL[a].en}
                  </AdminActionButton>
                ))}
              </div>

              <div className="flex flex-col gap-1 text-[13px]">
                {selectedShell.previewSupported ? (
                  <AdminActionLink href={selectedShell.previewHref}>
                    {ko ? "미리보기" : "Preview"}
                  </AdminActionLink>
                ) : null}
                <AdminActionLink href={selectedShell.href}>
                  {ko ? "상품 상세" : "Product detail"}
                </AdminActionLink>
                {(() => {
                  const detailLive = adsLiveLinkLabel({
                    href: selectedShell.liveHref,
                    domain: selectedShell.domain,
                    ko,
                  });
                  if (!detailLive) {
                    return (
                      <span className="text-sam-muted">
                        {ko ? "실제 노출 링크 없음" : "No live link"}
                      </span>
                    );
                  }
                  return (
                    <a
                      href={detailLive.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sam-primary underline"
                      data-admin-ads-live-link={detailLive.exact ? "exact" : "domain"}
                    >
                      {ko ? detailLive.labelKo : detailLive.labelEn}
                    </a>
                  );
                })()}
              </div>
            </div>
          )}
        </aside>
        ) : null}
      </div>

      <p className="text-[12px] text-sam-muted">
        <Link href="/admin/advertising/products" className="underline">
          {ko ? "광고 상품 / 가격" : "Products & pricing"}
        </Link>
      </p>

      {/* 폼 시트(표준 AdminFormSheet) — 커뮤니티 홍보 종료(귀책 선택·환급 미리보기 입력). 실행 확인(사유만 · 대상 재입력 없음 §3-1)은 confirmAdminAction. */}
      {communityEndPending ? (
        <AdminFormSheet
          title={pendingMutation?.copy.title ?? ""}
          subtitle={pendingMutation?.copy.body ?? ""}
          dismissible={busyAction == null}
          maxWidthClass="max-w-lg"
          onClose={() => {
            if (busyAction != null) return;
            setPendingMutation(null);
          }}
          footer={
            <div className="flex justify-end gap-2">
              <AdminActionButton
                variant="secondary"
                disabled={busyAction != null}
                onClick={() => {
                  if (busyAction != null) return;
                  setPendingMutation(null);
                }}
              >
                {pendingMutation?.copy.cancelLabel ?? (ko ? "취소" : "Cancel")}
              </AdminActionButton>
              <AdminActionButton
                variant={pendingMutation?.copy.tone === "danger" ? "danger" : "primary"}
                disabled={busyAction != null}
                onClick={() => {
                  if (!pendingMutation || busyAction != null) return;
                  if (communityEndPending && (!endFault || !endPreview || "error" in endPreview || endPreview.fault !== endFault)) {
                    setActionMsg(ko ? "귀책을 선택하고 환급 예정 금액을 확인해 주세요." : "Choose fault and check the refund preview.");
                    return;
                  }
                  const { action, item, copy } = pendingMutation;
                  const fault = communityEndPending ? endFault : null;
                  // 폼을 닫은 뒤 실행 확인 — 단계는 동작 표(copy.level = forceCancel L3), 사유는 API 본문 reason.
                  setPendingMutation(null);
                  void (async () => {
                    const confirmed = await confirmAdminAction({
                      level: copy.level,
                      ko,
                      title: copy.title,
                      description: copy.body,
                      confirmLabel: copy.confirmLabel,
                      destructive: copy.tone === "danger",
                      reasonPlaceholder: copy.reasonLabel,
                      splitReason: copy.splitReason,
                    });
                    if (!confirmed.ok) return;
                    await executeDrawerAction(action, item, confirmed.reason ?? undefined, fault, confirmed.internalMemo ?? null);
                  })();
                }}
              >
                {pendingMutation?.copy.confirmLabel ?? ""}
              </AdminActionButton>
            </div>
          }
        >
          {communityEndPending ? (
            <div className="mt-3 space-y-2 text-[13px]" data-admin-boost-community-end-fault="1">
              <p className="font-semibold">{ko ? "귀책 (필수)" : "Fault (required)"}</p>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="boost-community-end-fault"
                  checked={endFault === "operator"}
                  disabled={busyAction != null}
                  onChange={() => setEndFault("operator")}
                  className="mt-0.5"
                />
                <span>
                  {endIsDelivery
                    ? ko
                      ? "운영 사유 — 남은 기간만큼 비즈니스 캐시 비례 환급"
                      : "Operator — prorated business cash refund"
                    : ko
                      ? "운영 사유 — 남은 노출 기간만큼 포인트 비례 환급"
                      : "Operator — prorated refund"}
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="boost-community-end-fault"
                  checked={endFault === "member"}
                  disabled={busyAction != null}
                  onChange={() => setEndFault("member")}
                  className="mt-0.5"
                />
                <span>
                  {endIsDelivery ? (ko ? "사장님 사유 — 환급 없음" : "Owner — no refund") : ko ? "회원 사유 — 환급 없음" : "Member — no refund"}
                </span>
              </label>
              {endAllowsNoFault ? (
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="boost-community-end-fault"
                    checked={endFault === "none"}
                    disabled={busyAction != null}
                    onChange={() => setEndFault("none")}
                    className="mt-0.5"
                  />
                  <span>{ko ? "해당 없음 — 환급 없음" : "None — no refund"}</span>
                </label>
              ) : null}
              {endFault && !endPreview ? (
                <p className="opacity-70">{ko ? "환급 예정 금액을 계산하는 중…" : "Calculating refund…"}</p>
              ) : null}
              {endPreview && !("error" in endPreview) && endPreview.fault === endFault ? (
                <p className="font-semibold">
                  {ko ? "환급 예정" : "Refund"}{" "}
                  {endIsDelivery
                    ? formatAdminDeliveryAdPriceOrUnset(endPreview.refundPoints, ko ? "ko" : "en")
                    : `${formatAdminNumber(endPreview.refundPoints)} P`}
                </p>
              ) : null}
              {endPreview && "error" in endPreview ? (
                <p className="text-sam-danger">{adminOperatorErrorMessage(endPreview.error, ko)}</p>
              ) : null}
            </div>
          ) : null}
        </AdminFormSheet>
      ) : null}
    </div>
  );
}
