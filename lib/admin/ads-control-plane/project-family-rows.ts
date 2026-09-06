/**
 * Pure projectors — family SSOT rows → Ads Control Plane display rows.
 * No unified ads table. Composition / presentation only.
 */

import type { FeedAdCampaignView } from "@/lib/ads/feed-ad-placement";
import {
  adsOpsStatusLabel,
  mapRawToAdsOpsStatus,
  projectAdsOpsStatus,
  type AdsOpsStatus,
} from "@/lib/admin/ads-exposure/ops-status";
import type {
  AdsActionItem,
  AdsBillingCurrency,
  AdsControlDomain,
  AdsExecutionRow,
} from "@/lib/admin/ads-control-plane/types";
import {
  adsPaymentLabel,
  adsRemainingPeriodLabel,
} from "@/lib/admin/domain-control/ads-operator-cta";
import { businessCcFinancialStatementHref } from "@/lib/admin-business/business-control-center-links";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import type { AdminDeliveryAdListItem } from "@/lib/stores/advertising/admin-delivery-ad-loader";
import type { PlatformPopupAdminListItem } from "@/lib/platform-popup/admin-campaign-loader";
import {
  projectPopupRuntimeDisplay,
  type PopupRuntimeDisplayStatus,
} from "@/lib/admin/ads-exposure/popup-runtime-display";
import { popupOperationalDisplayTitle } from "@/lib/admin/ads-exposure/untitled-display-title";

function ageHours(iso: string): number | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 3600000));
}

function memberHref(userId: string): string {
  return `/admin/users/${encodeURIComponent(userId)}`;
}

function formatPeriod(startAt: string | null | undefined, endAt: string | null | undefined): string | null {
  if (!startAt && !endAt) return null;
  const a = startAt ? new Date(startAt).toLocaleDateString("ko") : "?";
  const b = endAt ? new Date(endAt).toLocaleDateString("ko") : "?";
  return `${a} → ${b}`;
}

function opsLabel(ops: AdsOpsStatus): string {
  return adsOpsStatusLabel(ops, true);
}

function exposureFromOps(ops: AdsOpsStatus): string {
  if (ops === "live") return "노출 중";
  if (ops === "scheduled") return "아직 노출 안 됨(예약)";
  if (ops === "paused") return "노출 중단(일시중지)";
  if (ops === "ended" || ops === "rejected" || ops === "archived") return "노출 종료";
  return "아직 노출 안 됨";
}

/** Delivery lifecycle → canonical ops status (Korean label via opsLabel). */
export function deliveryCampaignOpsStatus(c: Pick<
  AdminDeliveryAdListItem,
  "lifecycleStatus" | "startAt" | "endAt"
>): AdsOpsStatus {
  const life = String(c.lifecycleStatus ?? "").toUpperCase();
  if (life === "REJECTED") return "rejected";
  if (
    life === "ENDED" ||
    life === "TERMINATED" ||
    life === "ARCHIVED" ||
    life === "EXHAUSTED"
  ) {
    return "ended";
  }
  if (life.startsWith("PAUSED")) return "paused";
  if (life === "ACTIVE") {
    return projectAdsOpsStatus({
      rawStatus: "active",
      startAt: c.startAt,
      endAt: c.endAt,
    });
  }
  if (life === "SCHEDULED" || life === "APPROVED") {
    return projectAdsOpsStatus({
      rawStatus: "scheduled",
      startAt: c.startAt,
      endAt: c.endAt,
    });
  }
  if (
    life === "SUBMITTED" ||
    life === "UNDER_REVIEW" ||
    life === "CHANGES_REQUESTED"
  ) {
    return "pending";
  }
  if (life === "DRAFT") return "draft";
  return mapRawToAdsOpsStatus(life);
}

export function isAdsShellActionRequired(ops: AdsOpsStatus): boolean {
  return ops === "pending" || ops === "draft";
}

export function isAdsShellExecutionOps(ops: AdsOpsStatus): boolean {
  return ops === "live" || ops === "scheduled" || ops === "paused";
}

function deliveryPlacementHint(c: AdminDeliveryAdListItem): string | null {
  const key = c.inventoryKeys?.[0] ?? null;
  if (!key) return null;
  const slide =
    key === "STORES_HOME_HERO" && c.sortOrder != null && Number.isFinite(c.sortOrder)
      ? ` slide:${Math.max(1, Math.floor(c.sortOrder) + 1)}`
      : "";
  return `${key}${slide}`;
}

export function projectDeliveryCampaignToActionItem(c: AdminDeliveryAdListItem): AdsActionItem {
  const ops = deliveryCampaignOpsStatus(c);
  const id = String(c.id ?? "");
  const at = String(c.updatedAt || c.createdAt || c.submittedAt || "");
  const storeId = c.storeId?.trim() || null;
  const ownerId = c.ownerUserId?.trim() || null;
  const product = String(c.productKind ?? "banner");
  const actionable =
    ops === "pending"
      ? "배달 광고 심사·조치가 필요합니다."
      : ops === "draft"
        ? "초안·소재 확인이 필요합니다."
        : null;
  const adminDirect = c.campaignSource === "DIBAY_FIRST_PARTY";
  const title =
    String(c.title ?? "").trim() ||
    String(c.headline ?? "").trim() ||
    id.slice(0, 8);

  return {
    id: `delivery:${id}`,
    domain: "delivery",
    product,
    entity: isAdsShellExecutionOps(ops) ? "execution" : "application",
    applicantLabel: adminDirect
      ? "Admin 직접 등록"
      : String(c.storeName ?? "").trim() ||
        String(c.ownerDisplayName ?? "").trim() ||
        (storeId ? `매장 ${storeId.slice(0, 8)}` : "Owner"),
    storeId,
    memberId: ownerId,
    creativeHint: c.imageUrl?.trim() || null,
    placementHint: deliveryPlacementHint(c) ?? (c.inventoryKeys?.[0] ?? null),
    amountLabel: null,
    currency: "CASH",
    status: opsLabel(ops),
    whyActionable: actionable,
    paymentLabel: adsPaymentLabel(adminDirect ? "FUNDED" : null, "CASH", true),
    periodLabel: formatPeriod(c.startAt, c.endAt),
    remainingLabel: adsRemainingPeriodLabel(c.startAt, c.endAt, true) || null,
    exposureLabel: exposureFromOps(ops),
    eligibility: exposureFromOps(ops),
    ageHours: ageHours(at),
    at,
    source: "admin_delivery_ad_campaign_list",
    href: DELIVERY_AD_ADMIN_ROUTES.detail(id),
    statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
    financeHref: "/admin/finance#action-required",
    memberHref: ownerId ? memberHref(ownerId) : null,
    title,
    creativeImageUrl: c.imageUrl?.trim() || null,
    ctaLabel: c.ctaHref ? "이동" : null,
    destinationLabel: c.ctaHref?.trim() || null,
    lifecycleStatusLabel: opsLabel(ops),
    sourceKind: adminDirect ? "admin_direct" : "owner",
    previewHref: `${DELIVERY_AD_ADMIN_ROUTES.detail(id)}?focus=preview`,
  };
}

export function projectDeliveryCampaignToExecutionRow(
  c: AdminDeliveryAdListItem
): AdsExecutionRow | null {
  const ops = deliveryCampaignOpsStatus(c);
  if (!isAdsShellExecutionOps(ops)) return null;
  const id = String(c.id ?? "");
  const storeId = c.storeId?.trim() || null;
  return {
    id: `delivery:${id}`,
    domain: "delivery",
    product: String(c.productKind ?? "banner"),
    label:
      String(c.title ?? "").trim() ||
      String(c.storeName ?? "").trim() ||
      id.slice(0, 8),
    placement: deliveryPlacementHint(c) ?? (c.inventoryKeys?.[0] ?? null),
    status: opsLabel(ops),
    eligibility: exposureFromOps(ops),
    period: formatPeriod(c.startAt, c.endAt),
    remainingLabel: adsRemainingPeriodLabel(c.startAt, c.endAt, true) || null,
    currency: "CASH",
    href: DELIVERY_AD_ADMIN_ROUTES.detail(id),
    statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
    source: "admin_delivery_ad_campaign_list",
    conflictSeverity: "NONE",
    conflictLabelKo: "",
    conflictLabelEn: "",
  };
}

export type PromoteOrderRow = {
  id?: unknown;
  user_id?: unknown;
  domain?: unknown;
  order_status?: unknown;
  created_at?: unknown;
  target_id?: unknown;
  target_title?: unknown;
  product_id?: unknown;
  point_cost?: unknown;
  start_at?: unknown;
  end_at?: unknown;
};

export function promoteOrderOpsStatus(r: PromoteOrderRow): AdsOpsStatus {
  const raw = String(r.order_status ?? "");
  return projectAdsOpsStatus({
    rawStatus: raw,
    startAt: typeof r.start_at === "string" ? r.start_at : null,
    endAt: typeof r.end_at === "string" ? r.end_at : null,
  });
}

export function projectPromoteOrderToActionItem(r: PromoteOrderRow): AdsActionItem {
  const id = String(r.id ?? "");
  const userId = String(r.user_id ?? "");
  const at = String(r.created_at ?? "");
  const domainRaw = String(r.domain ?? "trade").toLowerCase();
  const domain: AdsControlDomain =
    domainRaw === "community" ? "community_promote" : "trade_promote";
  const ops = promoteOrderOpsStatus(r);
  const isCommunity = domain === "community_promote";

  return {
    id: `${isCommunity ? "community_promo" : "trade_promo"}:${id}`,
    domain,
    product: String(r.product_id ?? (isCommunity ? "community_promote" : "trade_promote")),
    entity: isAdsShellExecutionOps(ops) ? "execution" : "application",
    applicantLabel:
      String(r.target_title ?? "").trim() || id.slice(0, 8),
    storeId: null,
    memberId: userId || null,
    creativeHint: r.target_id != null ? String(r.target_id) : null,
    placementHint: isCommunity ? "커뮤니티 상위 노출" : "거래 피드 홍보",
    amountLabel: r.point_cost != null ? `${r.point_cost}P` : null,
    currency: "POINT",
    status: opsLabel(ops),
    whyActionable:
      ops === "pending"
        ? isCommunity
          ? "커뮤니티 상위노출 승인이 필요합니다. (HOLD)"
          : "거래 더 알리기 승인이 필요합니다."
        : null,
    paymentLabel: adsPaymentLabel(null, "POINT", true),
    periodLabel: formatPeriod(
      typeof r.start_at === "string" ? r.start_at : null,
      typeof r.end_at === "string" ? r.end_at : null
    ),
    remainingLabel:
      adsRemainingPeriodLabel(
        typeof r.start_at === "string" ? r.start_at : null,
        typeof r.end_at === "string" ? r.end_at : null,
        true
      ) || null,
    exposureLabel: exposureFromOps(ops),
    eligibility: exposureFromOps(ops),
    ageHours: ageHours(at),
    at,
    source: `point_promotion_orders domain=${isCommunity ? "community" : "trade"}`,
    href: `/admin/ad-applications/${encodeURIComponent(id)}?domain=${isCommunity ? "community" : "trade"}`,
    statementHref: null,
    financeHref: "/admin/finance#point",
    memberHref: userId ? memberHref(userId) : null,
  };
}

export type FeedRequestRow = {
  id?: unknown;
  user_id?: unknown;
  status?: unknown;
  start_at?: unknown;
  end_at?: unknown;
  created_at?: unknown;
  placement?: unknown;
  title?: unknown;
};

export function feedRequestOpsStatus(r: FeedRequestRow): AdsOpsStatus {
  return projectAdsOpsStatus({
    rawStatus: String(r.status ?? ""),
    startAt: typeof r.start_at === "string" ? r.start_at : null,
    endAt: typeof r.end_at === "string" ? r.end_at : null,
  });
}

export function projectFeedRequestToActionItem(r: FeedRequestRow): AdsActionItem {
  const id = String(r.id ?? "");
  const userId = String(r.user_id ?? "");
  const at = String(r.created_at ?? "");
  const ops = feedRequestOpsStatus(r);

  return {
    id: `feed:${id}`,
    domain: "feed",
    product: "feed_ad",
    entity: isAdsShellExecutionOps(ops) ? "execution" : "application",
    applicantLabel: String(r.title ?? "").trim() || id.slice(0, 8),
    storeId: null,
    memberId: userId || null,
    creativeHint: null,
    placementHint: r.placement ? String(r.placement) : "거래/커뮤니티 피드",
    amountLabel: null,
    currency: "POINT",
    status: opsLabel(ops),
    whyActionable: ops === "pending" ? "피드 광고 신청 심사가 필요합니다." : null,
    paymentLabel: adsPaymentLabel(null, "POINT", true),
    periodLabel: formatPeriod(
      typeof r.start_at === "string" ? r.start_at : null,
      typeof r.end_at === "string" ? r.end_at : null
    ),
    remainingLabel:
      adsRemainingPeriodLabel(
        typeof r.start_at === "string" ? r.start_at : null,
        typeof r.end_at === "string" ? r.end_at : null,
        true
      ) || null,
    exposureLabel: exposureFromOps(ops),
    eligibility: exposureFromOps(ops),
    ageHours: ageHours(at),
    at,
    source: "feed_ad_requests",
    href: `/admin/feed-ad-requests/${encodeURIComponent(id)}`,
    statementHref: null,
    financeHref: "/admin/finance#point",
    memberHref: userId ? memberHref(userId) : null,
  };
}

export function feedCampaignOpsStatus(c: Pick<FeedAdCampaignView, "status" | "startAt" | "endAt">): AdsOpsStatus {
  return projectAdsOpsStatus({
    rawStatus: String(c.status ?? ""),
    startAt: c.startAt,
    endAt: c.endAt,
  });
}

export function projectFeedCampaignToActionItem(c: FeedAdCampaignView): AdsActionItem {
  const ops = feedCampaignOpsStatus(c);
  const id = String(c.id ?? "");
  const at = String(c.startAt || c.endAt || new Date().toISOString());

  return {
    id: `feed_campaign:${id}`,
    domain: "feed",
    product: "feed_banner",
    entity: isAdsShellExecutionOps(ops) ? "execution" : "application",
    applicantLabel: String(c.name ?? "").trim() || id.slice(0, 8),
    storeId: null,
    memberId: null,
    creativeHint: c.slides?.[0]?.imageUrl ?? null,
    placementHint: String(c.placement ?? "거래/커뮤니티 피드"),
    amountLabel: null,
    currency: "POINT",
    status: opsLabel(ops),
    whyActionable: ops === "pending" || ops === "draft" ? "피드 배너 캠페인 확인이 필요합니다." : null,
    paymentLabel: adsPaymentLabel(null, "POINT", true),
    periodLabel: formatPeriod(c.startAt, c.endAt),
    remainingLabel: adsRemainingPeriodLabel(c.startAt, c.endAt, true) || null,
    exposureLabel: exposureFromOps(ops),
    eligibility: exposureFromOps(ops),
    ageHours: ageHours(at),
    at,
    source: "feed_ad_campaigns",
    href: "/admin/feed-ads",
    statementHref: null,
    financeHref: "/admin/finance#point",
    memberHref: null,
  };
}

export function projectFeedCampaignToExecutionRow(
  c: FeedAdCampaignView
): AdsExecutionRow | null {
  const ops = feedCampaignOpsStatus(c);
  if (!isAdsShellExecutionOps(ops)) return null;
  const id = String(c.id ?? "");
  return {
    id: `feed_campaign:${id}`,
    domain: "feed",
    product: "feed_banner",
    label: String(c.name ?? "").trim() || id.slice(0, 8),
    placement: String(c.placement ?? ""),
    status: opsLabel(ops),
    eligibility: exposureFromOps(ops),
    period: formatPeriod(c.startAt, c.endAt),
    remainingLabel: adsRemainingPeriodLabel(c.startAt, c.endAt, true) || null,
    currency: "POINT",
    href: "/admin/feed-ads",
    statementHref: null,
    source: "feed_ad_campaigns",
    conflictSeverity: "NONE",
    conflictLabelKo: "",
    conflictLabelEn: "",
  };
}

export type PopupRequestRow = {
  id?: unknown;
  store_id?: unknown;
  owner_user_id?: unknown;
  request_status?: unknown;
  created_at?: unknown;
  title?: unknown;
};

export function popupRequestOpsStatus(r: PopupRequestRow): AdsOpsStatus {
  return mapRawToAdsOpsStatus(String(r.request_status ?? ""));
}

export function projectPopupRequestToActionItem(r: PopupRequestRow): AdsActionItem {
  const id = String(r.id ?? "");
  const storeId = String(r.store_id ?? "").trim() || null;
  const ownerId = String(r.owner_user_id ?? "").trim() || null;
  const at = String(r.created_at ?? "");
  const ops = popupRequestOpsStatus(r);

  return {
    id: `popup:${id}`,
    domain: "popup",
    product: "platform_popup",
    entity: "application",
    applicantLabel: storeId
      ? `매장 ${storeId.slice(0, 8)}`
      : ownerId
        ? `Owner ${ownerId.slice(0, 8)}`
        : "알 수 없음",
    storeId,
    memberId: ownerId,
    creativeHint: null,
    placementHint: "앱 팝업",
    amountLabel: null,
    currency: "CASH",
    status: opsLabel(ops),
    whyActionable: ops === "pending" ? "팝업 광고 신청 심사가 필요합니다." : null,
    paymentLabel: adsPaymentLabel(null, "CASH", true),
    periodLabel: null,
    remainingLabel: null,
    exposureLabel: exposureFromOps(ops),
    eligibility: exposureFromOps(ops),
    ageHours: ageHours(at),
    at,
    source: "platform_popup_owner_requests",
    href: `/admin/platform-popup/requests/${encodeURIComponent(id)}`,
    statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
    financeHref: "/admin/finance#action-required",
    memberHref: ownerId ? memberHref(ownerId) : null,
    title: String(r.title ?? "").trim() || id.slice(0, 8),
    sourceKind: "owner",
  };
}

export function popupCampaignOpsStatus(
  c: Pick<PlatformPopupAdminListItem, "status" | "approvalStatus" | "startAt" | "endAt">
): AdsOpsStatus {
  const approval = String(c.approvalStatus ?? "").toLowerCase();
  if (approval === "rejected" || String(c.status).toLowerCase() === "rejected") {
    return "rejected";
  }
  if (approval === "pending_review" || String(c.status).toLowerCase() === "pending_review") {
    return "pending";
  }
  return projectAdsOpsStatus({
    rawStatus: String(c.status ?? ""),
    startAt: c.startAt,
    endAt: c.endAt,
  });
}

export function projectPopupCampaignToActionItem(
  c: PlatformPopupAdminListItem,
  options: { winnerIds?: ReadonlySet<string> } = {}
): AdsActionItem {
  const ops = popupCampaignOpsStatus(c);
  const id = String(c.id ?? "");
  const storeId = c.ownerStoreId?.trim() || null;
  const at = String(c.updatedAt || c.startAt || "");
  const surfaceHint =
    c.surfaces?.length > 0 ? c.surfaces.join(",") : "GLOBAL";
  const adminDirect = !c.ownerStoreId && !c.ownerRequestId;
  const runtime = projectPopupRuntimeDisplay({
    opsStatus: ops,
    campaignId: id,
    winnerIds: options.winnerIds ?? new Set<string>(),
    startAt: c.startAt,
    endAt: c.endAt,
  });
  const displayTitle = popupOperationalDisplayTitle({
    name: c.name,
    id,
    updatedAt: c.updatedAt,
    ko: true,
  });
  const ctaLabel =
    c.ctaType === "internal_page"
      ? "내부 페이지 이동"
      : c.ctaType === "external_url"
        ? "외부 링크 이동"
        : c.ctaType === "store"
          ? "매장 이동"
          : c.ctaType === "trade_listing"
            ? "거래 글 이동"
            : "커뮤니티 글 이동";
  const destinationLabel = c.externalUrl?.trim() || c.ctaTarget?.trim() || null;

  return {
    id: `popup_campaign:${id}`,
    domain: "popup",
    product: "platform_popup",
    entity: isAdsShellExecutionOps(ops) ? "execution" : "application",
    applicantLabel: adminDirect
      ? "Admin 직접 등록"
      : storeId
        ? `매장 ${storeId.slice(0, 8)}`
        : "Owner",
    storeId,
    memberId: null,
    creativeHint: c.creativeThumbUrl,
    placementHint: surfaceHint,
    amountLabel: null,
    currency: "CASH" satisfies AdsBillingCurrency,
    status: opsLabel(ops),
    whyActionable: ops === "pending" || ops === "draft" ? "팝업 캠페인 확인이 필요합니다." : null,
    paymentLabel: adsPaymentLabel(null, "CASH", true),
    periodLabel: formatPeriod(c.startAt, c.endAt),
    remainingLabel: adsRemainingPeriodLabel(c.startAt, c.endAt, true) || null,
    exposureLabel: exposureFromOps(ops),
    eligibility: exposureFromOps(ops),
    ageHours: ageHours(at),
    at,
    source: "platform_popup_campaigns",
    href: `/admin/platform-popup/${encodeURIComponent(id)}`,
    statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
    financeHref: "/admin/finance#action-required",
    memberHref: null,
    title: displayTitle,
    creativeImageUrl: c.creativeThumbUrl,
    ctaLabel,
    destinationLabel,
    priority: c.priority,
    lifecycleStatusLabel: opsLabel(ops),
    runtimeDisplayStatus: runtime.status satisfies PopupRuntimeDisplayStatus,
    isRuntimeWinner: runtime.isRuntimeWinner,
    sourceKind: adminDirect ? "admin_direct" : "owner",
    previewHref: `/admin/platform-popup/${encodeURIComponent(id)}?focus=preview`,
  };
}

export function projectPopupCampaignToExecutionRow(
  c: PlatformPopupAdminListItem
): AdsExecutionRow | null {
  const ops = popupCampaignOpsStatus(c);
  if (!isAdsShellExecutionOps(ops)) return null;
  const id = String(c.id ?? "");
  const storeId = c.ownerStoreId?.trim() || null;
  return {
    id: `popup_campaign:${id}`,
    domain: "popup",
    product: "platform_popup",
    label: String(c.name ?? "").trim() || id.slice(0, 8),
    placement: c.surfaces?.length ? c.surfaces.join(",") : "앱 팝업",
    status: opsLabel(ops),
    eligibility: exposureFromOps(ops),
    period: formatPeriod(c.startAt, c.endAt),
    remainingLabel: adsRemainingPeriodLabel(c.startAt, c.endAt, true) || null,
    currency: "CASH",
    href: `/admin/platform-popup/${encodeURIComponent(id)}`,
    statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
    source: "platform_popup_campaigns",
    conflictSeverity: "NONE",
    conflictLabelKo: "",
    conflictLabelEn: "",
  };
}

export function dedupeAdsActionItems(rows: AdsActionItem[]): AdsActionItem[] {
  const seen = new Set<string>();
  const out: AdsActionItem[] = [];
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export function sortAdsActionItemsByAtDesc(rows: AdsActionItem[]): AdsActionItem[] {
  return [...rows].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );
}
