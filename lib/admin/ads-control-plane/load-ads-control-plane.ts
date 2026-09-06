/**
 * ARO-OPS-UX-002-B5 — Ads / Exposure Control Plane loader.
 * Composes Delivery / Feed / Popup / Trade-promote sources. No new ads tables.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listDeliveryAdAdminActionQueue } from "@/lib/stores/advertising/delivery-ad-operations-action-queue";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import {
  loadAdminDeliveryAdCampaignList,
} from "@/lib/stores/advertising/admin-delivery-ad-loader";
import { listAllPlacementMapRows, placementMapFocusHref } from "@/lib/admin/placement-map-read-model";
import { businessCcFinancialStatementHref } from "@/lib/admin-business/business-control-center-links";
import { projectFeedAdOpsProductStatus } from "@/lib/ads/feed-ad-ops-presentation";
import type {
  AdsActionItem,
  AdsCollisionCard,
  AdsControlPlaneModel,
  AdsExecutionRow,
} from "@/lib/admin/ads-control-plane/types";
import {
  adsPaymentLabel,
  adsRemainingPeriodLabel,
} from "@/lib/admin/domain-control/ads-operator-cta";
import { adminDeliveryAdInventoryHumanLabel } from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import { detectPlacementCollisions } from "@/lib/admin/ads-collision/detect-placement-collisions";
import { computePlacementOccupancy } from "@/lib/admin/ads-operator/placement-occupancy";

function ageHours(iso: string): number | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 3600000));
}

function memberHref(userId: string): string {
  return `/admin/users/${encodeURIComponent(userId)}`;
}

function isMissing(err: { message?: string } | null | undefined, re: RegExp): boolean {
  return !!err && re.test(String(err.message ?? ""));
}

function formatPeriod(startAt: string | null | undefined, endAt: string | null | undefined): string | null {
  if (!startAt && !endAt) return null;
  const a = startAt ? new Date(startAt).toLocaleDateString("ko") : "?";
  const b = endAt ? new Date(endAt).toLocaleDateString("ko") : "?";
  return `${a} → ${b}`;
}

export async function loadAdsControlPlane(sb: SupabaseClient): Promise<AdsControlPlaneModel> {
  const sectionErrors: string[] = [];

  const [deliveryQueue, feedRes, popupRes, boostPromoRes, activeDelivery, legacyTradeAdsRes, activePopupRes] =
    await Promise.all([
    listDeliveryAdAdminActionQueue(sb, { limit: 40 }),
    sb
      .from("feed_ad_requests")
      .select("id, user_id, status, start_at, end_at, created_at, placement, title")
      .order("created_at", { ascending: false })
      .limit(40),
    sb
      .from("platform_popup_owner_requests")
      .select("id, store_id, owner_user_id, request_status, created_at, title")
      .in("request_status", ["submitted", "under_review"])
      .order("created_at", { ascending: false })
      .limit(40),
    sb
      .from("point_promotion_orders")
      .select("id, user_id, domain, order_status, created_at, target_id, product_id, point_cost, start_at, end_at")
      .in("domain", ["trade", "community"])
      .eq("order_status", "pending_review")
      .order("created_at", { ascending: false })
      .limit(60),
    loadAdminDeliveryAdCampaignList(sb, { product: "all", limit: 80 }),
    // Legacy trade_post_ads — only surface when live ops rows exist (FINAL LOCK).
    sb
      .from("trade_post_ads")
      .select("id, user_id, post_id, status, start_at, end_at, created_at, placement")
      .in("status", ["pending_review", "approved", "active", "pending"])
      .order("created_at", { ascending: false })
      .limit(30),
    sb
      .from("platform_popup_campaigns")
      .select("id, name, status, priority, start_at, end_at, created_at")
      .in("status", ["active", "scheduled", "approved"])
      .order("priority", { ascending: false })
      .limit(40),
  ]);

  if (!deliveryQueue.ok) sectionErrors.push(`delivery_queue:${deliveryQueue.error}`);
  if (feedRes.error && !isMissing(feedRes.error, /feed_ad_requests|schema cache|does not exist/i)) {
    sectionErrors.push(`feed:${feedRes.error.message}`);
  }
  if (
    popupRes.error &&
    !isMissing(popupRes.error, /platform_popup_owner_requests|schema cache|does not exist/i)
  ) {
    sectionErrors.push(`popup:${popupRes.error.message}`);
  }
  if (
    boostPromoRes.error &&
    !isMissing(boostPromoRes.error, /point_promotion_orders|schema cache|does not exist/i)
  ) {
    sectionErrors.push(`boost_promo:${boostPromoRes.error.message}`);
  }
  if (
    legacyTradeAdsRes.error &&
    !isMissing(legacyTradeAdsRes.error, /trade_post_ads|schema cache|does not exist/i)
  ) {
    sectionErrors.push(`legacy_trade_ads:${legacyTradeAdsRes.error.message}`);
  }
  if (
    activePopupRes.error &&
    !isMissing(activePopupRes.error, /platform_popup_campaigns|schema cache|does not exist/i)
  ) {
    sectionErrors.push(`popup_campaigns:${activePopupRes.error.message}`);
  }
  if (activeDelivery.error) sectionErrors.push(`delivery_list:${activeDelivery.error}`);

  const deliveryUnavailable = !deliveryQueue.ok;
  const feedUnavailable =
    !!feedRes.error && !isMissing(feedRes.error, /feed_ad_requests|schema cache|does not exist/i);
  const popupUnavailable =
    !!popupRes.error &&
    !isMissing(popupRes.error, /platform_popup_owner_requests|schema cache|does not exist/i);
  const boostUnavailable =
    !!boostPromoRes.error &&
    !isMissing(boostPromoRes.error, /point_promotion_orders|schema cache|does not exist/i);

  const actionRequired: AdsActionItem[] = [];
  const applications: AdsActionItem[] = [];
  const creatives: AdsActionItem[] = [];

  // Dual-stack removal: Delivery per-row cards stay off the Control Plane.
  // Queue counts + href → Delivery hub; mutation detail remains single writer.

  const feedRows = feedUnavailable ? [] : ((feedRes.data ?? []) as Record<string, unknown>[]);
  const feedPending = feedRows.filter((r) => {
    return (
      projectFeedAdOpsProductStatus({
        requestStatus: String(r.status ?? ""),
        startAt: typeof r.start_at === "string" ? r.start_at : null,
        endAt: typeof r.end_at === "string" ? r.end_at : null,
      }) === "pending_review"
    );
  });
  for (const r of feedPending.slice(0, 15)) {
    const id = String(r.id ?? "");
    const userId = String(r.user_id ?? "");
    const at = String(r.created_at ?? "");
    const row: AdsActionItem = {
      id: `feed:${id}`,
      domain: "feed",
      product: "feed_ad",
      entity: "application",
      applicantLabel: String(r.title ?? "").trim() || id.slice(0, 8),
      storeId: null,
      memberId: userId || null,
      creativeHint: null,
      placementHint: r.placement
        ? String(r.placement)
        : "거래/커뮤니티 피드",
      amountLabel: null,
      currency: "POINT",
      status: "검토 대기",
      whyActionable: "피드 광고 신청 심사가 필요합니다.",
      paymentLabel: adsPaymentLabel(null, "POINT", true),
      periodLabel: formatPeriod(
        typeof r.start_at === "string" ? r.start_at : null,
        typeof r.end_at === "string" ? r.end_at : null
      ),
      remainingLabel: adsRemainingPeriodLabel(
        typeof r.start_at === "string" ? r.start_at : null,
        typeof r.end_at === "string" ? r.end_at : null,
        true
      ),
      exposureLabel: "아직 노출 안 됨",
      eligibility: null,
      ageHours: ageHours(at),
      at,
      source: "feed_ad_requests",
      href: `/admin/feed-ad-requests/${encodeURIComponent(id)}`,
      statementHref: null,
      financeHref: "/admin/finance#point",
      memberHref: userId ? memberHref(userId) : null,
    };
    actionRequired.push(row);
    applications.push(row);
  }

  const popupRows = popupUnavailable ? [] : ((popupRes.data ?? []) as Record<string, unknown>[]);
  for (const r of popupRows.slice(0, 15)) {
    const id = String(r.id ?? "");
    const storeId = String(r.store_id ?? "").trim() || null;
    const ownerId = String(r.owner_user_id ?? "").trim() || null;
    const at = String(r.created_at ?? "");
    const row: AdsActionItem = {
      id: `popup:${id}`,
      domain: "popup",
      product: "platform_popup",
      entity: "application",
      applicantLabel: String(r.title ?? "").trim() || id.slice(0, 8),
      storeId,
      memberId: ownerId,
      creativeHint: null,
      placementHint: "앱 팝업",
      amountLabel: null,
      currency: "CASH",
      status: "검토 대기",
      whyActionable: "팝업 광고 신청 심사가 필요합니다.",
      paymentLabel: adsPaymentLabel(null, "CASH", true),
      periodLabel: null,
      remainingLabel: null,
      exposureLabel: "아직 노출 안 됨",
      eligibility: null,
      ageHours: ageHours(at),
      at,
      source: "platform_popup_owner_requests",
      href: `/admin/platform-popup/requests/${encodeURIComponent(id)}`,
      statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
      financeHref: "/admin/finance#action-required",
      memberHref: ownerId ? memberHref(ownerId) : null,
    };
    actionRequired.push(row);
    applications.push(row);
  }

  // Trade + Community Boost — Point HOLD pending (NOT Feed Banner)
  const boostRows = boostUnavailable
    ? []
    : ((boostPromoRes.data ?? []) as Record<string, unknown>[]);
  const tradeRows = boostRows.filter((r) => String(r.domain) === "trade");
  const communityRows = boostRows.filter((r) => String(r.domain) === "community");
  for (const r of tradeRows.slice(0, 10)) {
    const id = String(r.id ?? "");
    const userId = String(r.user_id ?? "");
    const at = String(r.created_at ?? "");
    const row: AdsActionItem = {
      id: `trade_promo:${id}`,
      domain: "trade_promote",
      product: String(r.product_id ?? "trade_promote"),
      entity: "application",
      applicantLabel: id.slice(0, 8),
      storeId: null,
      memberId: userId || null,
      creativeHint: null,
      placementHint: "거래 피드 홍보",
      amountLabel: r.point_cost != null ? `${r.point_cost}P` : null,
      currency: "POINT",
      status: "검토 대기",
      whyActionable: "거래 더 알리기 승인이 필요합니다.",
      paymentLabel: adsPaymentLabel(null, "POINT", true),
      periodLabel: formatPeriod(
        typeof r.start_at === "string" ? r.start_at : null,
        typeof r.end_at === "string" ? r.end_at : null
      ),
      remainingLabel: null,
      exposureLabel: "아직 노출 안 됨",
      eligibility: null,
      ageHours: ageHours(at),
      at,
      source: "point_promotion_orders domain=trade",
      href: `/admin/ad-applications/${encodeURIComponent(id)}?domain=trade`,
      statementHref: null,
      financeHref: "/admin/finance#point",
      memberHref: userId ? memberHref(userId) : null,
    };
    actionRequired.push(row);
    applications.push(row);
  }
  for (const r of communityRows.slice(0, 10)) {
    const id = String(r.id ?? "");
    const userId = String(r.user_id ?? "");
    const at = String(r.created_at ?? "");
    const row: AdsActionItem = {
      id: `community_promo:${id}`,
      domain: "community_promote",
      product: String(r.product_id ?? "community_promote"),
      entity: "application",
      applicantLabel: id.slice(0, 8),
      storeId: null,
      memberId: userId || null,
      creativeHint: null,
      placementHint: "커뮤니티 상위 노출",
      amountLabel: r.point_cost != null ? `${r.point_cost}P` : null,
      currency: "POINT",
      status: "검토 대기",
      whyActionable: "커뮤니티 상위노출 승인이 필요합니다. (HOLD)",
      paymentLabel: adsPaymentLabel(null, "POINT", true),
      periodLabel: formatPeriod(
        typeof r.start_at === "string" ? r.start_at : null,
        typeof r.end_at === "string" ? r.end_at : null
      ),
      remainingLabel: null,
      exposureLabel: "아직 노출 안 됨",
      eligibility: null,
      ageHours: ageHours(at),
      at,
      source: "point_promotion_orders domain=community",
      href: `/admin/ad-applications/${encodeURIComponent(id)}?domain=community`,
      statementHref: null,
      financeHref: "/admin/finance#point",
      memberHref: userId ? memberHref(userId) : null,
    };
    actionRequired.push(row);
    applications.push(row);
  }

  // Dual-stack removal: Delivery ops *cases* stay off per-row Control Plane cards
  // (no delivery:${caseId}). Campaign rows ARE included for /admin/advertising canonical list.

  for (const c of (activeDelivery.error ? [] : activeDelivery.items).slice(0, 40)) {
    const life = String(c.lifecycleStatus ?? "");
    const id = String(c.id ?? "");
    if (!id) continue;
    const product =
      c.productKind === "store_sponsored" ? "store_sponsored" : "delivery_banner";
    const statusLabel =
      life === "PENDING_REVIEW" || life === "IN_REVIEW"
        ? "승인 대기"
        : life === "SCHEDULED"
          ? "예약"
          : life === "ACTIVE"
            ? "노출 중"
            : life.startsWith("PAUSED")
              ? "일시중지"
              : life === "REJECTED"
                ? "반려"
                : life === "ENDED" || life === "TERMINATED" || life === "ARCHIVED"
                  ? "종료"
                  : life;
    const needsAction =
      life === "PENDING_REVIEW" || life === "IN_REVIEW" || life === "CHANGES_REQUESTED";
    const row: AdsActionItem = {
      id: `delivery_cam:${id}`,
      domain: "delivery",
      product,
      entity: needsAction ? "application" : "execution",
      applicantLabel: String(c.storeName ?? c.title ?? "").trim() || id.slice(0, 8),
      storeId: c.storeId,
      memberId: null,
      creativeHint: c.creativeId,
      placementHint: (c.inventoryKeys ?? [])[0] ?? null,
      amountLabel: null,
      currency: "CASH",
      status: statusLabel,
      whyActionable: needsAction ? "배달 광고 승인이 필요합니다." : null,
      paymentLabel: adsPaymentLabel(null, "CASH", true),
      periodLabel: formatPeriod(c.startAt, c.endAt),
      remainingLabel: adsRemainingPeriodLabel(c.startAt, c.endAt, true),
      exposureLabel: life === "ACTIVE" ? "노출 가능" : null,
      eligibility: null,
      ageHours: ageHours(c.updatedAt ?? c.createdAt ?? new Date().toISOString()),
      at: c.updatedAt ?? c.createdAt ?? new Date().toISOString(),
      source: "store_*_ad_campaigns",
      href: DELIVERY_AD_ADMIN_ROUTES.detail(id),
      statementHref: c.storeId ? businessCcFinancialStatementHref(c.storeId) : null,
      financeHref: "/admin/finance#action-required",
      memberHref: null,
    };
    if (needsAction) {
      actionRequired.push(row);
      applications.push(row);
    } else {
      applications.push(row);
    }
  }

  // Conditional legacy ops surface only when live trade_post_ads rows exist.
  const legacyTradeAds =
    legacyTradeAdsRes.error || !Array.isArray(legacyTradeAdsRes.data)
      ? []
      : (legacyTradeAdsRes.data as Array<Record<string, unknown>>);
  for (const r of legacyTradeAds.slice(0, 20)) {
    const id = String(r.id ?? "");
    if (!id) continue;
    const userId = String(r.user_id ?? "");
    const postId = String(r.post_id ?? "");
    const at = String(r.created_at ?? "");
    const rawStatus = String(r.status ?? "").toLowerCase();
    const statusLabel =
      rawStatus === "pending_review" || rawStatus === "pending"
        ? "승인 대기"
        : rawStatus === "approved" || rawStatus === "active"
          ? "노출 중"
          : rawStatus;
    const needsAction = rawStatus === "pending_review" || rawStatus === "pending";
    const row: AdsActionItem = {
      id: `legacy_trade_ad:${id}`,
      domain: "trade_promote",
      product: "legacy_trade_post_ad",
      entity: needsAction ? "application" : "execution",
      applicantLabel: id.slice(0, 8),
      storeId: null,
      memberId: userId || null,
      creativeHint: postId || null,
      placementHint: typeof r.placement === "string" ? r.placement : "기존 거래 광고",
      amountLabel: null,
      currency: "POINT",
      status: statusLabel,
      whyActionable: needsAction ? "기존 거래 광고(레거시) 확인이 필요합니다." : null,
      paymentLabel: adsPaymentLabel(null, "POINT", true),
      periodLabel: formatPeriod(
        typeof r.start_at === "string" ? r.start_at : null,
        typeof r.end_at === "string" ? r.end_at : null
      ),
      remainingLabel: null,
      exposureLabel: rawStatus === "active" || rawStatus === "approved" ? "노출 가능" : null,
      eligibility: null,
      ageHours: ageHours(at),
      at,
      source: "trade_post_ads (legacy ops only)",
      href: postId
        ? `/admin/posts/${encodeURIComponent(postId)}`
        : "/admin/advertising",
      statementHref: null,
      financeHref: "/admin/finance#point",
      memberHref: userId ? memberHref(userId) : null,
    };
    if (needsAction) actionRequired.push(row);
    applications.push(row);
  }

  // Active/scheduled popup campaigns for placement board + list (winner = priority DESC).
  const activePopups =
    activePopupRes.error || !Array.isArray(activePopupRes.data)
      ? []
      : (activePopupRes.data as Array<Record<string, unknown>>);
  for (const r of activePopups.slice(0, 30)) {
    const id = String(r.id ?? "");
    if (!id) continue;
    const at = String(r.created_at ?? "");
    const rawStatus = String(r.status ?? "").toLowerCase();
    const statusLabel =
      rawStatus === "scheduled"
        ? "예약"
        : rawStatus === "active" || rawStatus === "approved"
          ? "노출 중"
          : rawStatus;
    const priority = typeof r.priority === "number" ? r.priority : Number(r.priority) || 0;
    const row: AdsActionItem = {
      id: `popup_cam:${id}`,
      domain: "popup",
      product: "platform_popup",
      entity: "execution",
      applicantLabel: String(r.name ?? "").trim() || id.slice(0, 8),
      storeId: null,
      memberId: null,
      creativeHint: null,
      placementHint: "팝업",
      amountLabel: null,
      currency: "N_A",
      status: statusLabel,
      whyActionable: null,
      paymentLabel: null,
      periodLabel: formatPeriod(
        typeof r.start_at === "string" ? r.start_at : null,
        typeof r.end_at === "string" ? r.end_at : null
      ),
      remainingLabel: null,
      exposureLabel: `priority ${priority}`,
      eligibility: null,
      ageHours: ageHours(at),
      at,
      source: "platform_popup_campaigns",
      href: `/admin/platform-popup/${encodeURIComponent(id)}`,
      statementHref: null,
      financeHref: null,
      memberHref: null,
    };
    applications.push(row);
  }

  actionRequired.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const deliveryItems = activeDelivery.error ? [] : activeDelivery.items;
  const collisionFindings = detectPlacementCollisions(
    deliveryItems.map((c) => ({
      id: c.id,
      storeId: c.storeId,
      storeName: c.storeName,
      title: c.title,
      productKind: c.productKind,
      inventoryKeys: c.inventoryKeys ?? [],
      lifecycleStatus: String(c.lifecycleStatus ?? ""),
      startAt: c.startAt,
      endAt: c.endAt,
      creativeId: c.creativeId,
    })),
    { hrefForId: (id) => DELIVERY_AD_ADMIN_ROUTES.detail(id) }
  );

  const collisions: AdsCollisionCard[] = collisionFindings
    .filter((f): f is typeof f & { severity: "WARNING" | "BLOCKING" } =>
      f.severity === "BLOCKING" || f.severity === "WARNING"
    )
    .slice(0, 40)
    .map((f) => ({
      id: `${f.campaignId}:${f.checkCode}:${f.placementKey}`,
      severity: f.severity,
      severityLabelKo: f.severityLabelKo,
      severityLabelEn: f.severityLabelEn,
      domain: "delivery",
      product: f.productKind,
      storeName: f.storeName,
      placementLabel: f.placementKey.startsWith("STORES_")
        ? adminDeliveryAdInventoryHumanLabel(f.placementKey, "ko")
        : f.placementLabel,
      periodLabel: formatPeriod(f.startAt, f.endAt),
      peerCount: f.peers.length,
      reasonKo: f.reasonKo,
      reasonEn: f.reasonEn,
      href: f.hrefHint,
    }));

  const endingSoonCount = deliveryItems.filter((c) => {
    const life = String(c.lifecycleStatus ?? "");
    if (!(life === "ACTIVE" || life === "SCHEDULED")) return false;
    if (!c.endAt) return false;
    const ms = new Date(c.endAt).getTime() - Date.now();
    return Number.isFinite(ms) && ms > 0 && ms <= 72 * 3600000;
  }).length;

  // Dual-stack removal: Delivery *ops cases* stay off CP writer UI.
  // Canonical /admin/advertising reads execution rows for ops list + occupancy.
  const currentExecution: AdsExecutionRow[] = deliveryItems
    .filter((c) => {
      const life = String(c.lifecycleStatus ?? "");
      return (
        life === "ACTIVE" ||
        life === "SCHEDULED" ||
        life.startsWith("PAUSED") ||
        life === "ENDED"
      );
    })
    .slice(0, 40)
    .map((c) => {
      const life = String(c.lifecycleStatus ?? "");
      const place = (c.inventoryKeys ?? [])[0] ?? null;
      const finding = collisionFindings.find((f) => f.campaignId === c.id);
      return {
        id: `delivery_cam:${c.id}`,
        domain: "delivery" as const,
        product: c.productKind === "store_sponsored" ? "store_sponsored" : "delivery_banner",
        label: String(c.storeName ?? c.title ?? c.id).trim(),
        placement: place,
        status:
          life === "ACTIVE"
            ? "노출 중"
            : life === "SCHEDULED"
              ? "예약"
              : life.startsWith("PAUSED")
                ? "일시중지"
                : "종료",
        eligibility: life === "ACTIVE" ? "노출 가능" : life,
        period: formatPeriod(c.startAt, c.endAt),
        remainingLabel: adsRemainingPeriodLabel(c.startAt, c.endAt, true),
        currency: "CASH" as const,
        href: DELIVERY_AD_ADMIN_ROUTES.detail(c.id),
        statementHref: c.storeId ? businessCcFinancialStatementHref(c.storeId) : null,
        source: "store_*_ad_campaigns",
        conflictSeverity: finding?.severity === "BLOCKING" || finding?.severity === "WARNING"
          ? finding.severity
          : ("NONE" as const),
        conflictLabelKo: finding?.severityLabelKo ?? "정상",
        conflictLabelEn: finding?.severityLabelEn ?? "OK",
      };
    });

  const placements = listAllPlacementMapRows()
    .slice(0, 40)
    .map((r) => ({
      domain: r.domain,
      placementId: r.placementId,
      displayNameKo: r.displayNameKo,
      displayNameEn: r.displayNameEn,
      productKind: r.productKind,
      aspectRatio: r.aspectRatio,
      href: placementMapFocusHref(r.placementId),
    }));

  const blockingCount = collisions.filter((c) => c.severity === "BLOCKING").length;
  const warningCount = collisions.filter((c) => c.severity === "WARNING").length;

  const occupancyUnavailable = !!activeDelivery.error;
  const occupancyRows = occupancyUnavailable
    ? []
    : computePlacementOccupancy(
        deliveryItems.map((c) => ({
          id: c.id,
          storeId: c.storeId,
          storeName: c.storeName,
          title: c.title,
          productKind: c.productKind,
          inventoryKeys: c.inventoryKeys ?? [],
          lifecycleStatus: String(c.lifecycleStatus ?? ""),
          startAt: c.startAt,
          endAt: c.endAt,
          creativeId: c.creativeId,
        })),
        {
          placementKeys: listAllPlacementMapRows()
            .filter((r) => r.domain === "DELIVERY")
            .map((r) => r.placementId),
        }
      );
  const placementNameById = new Map(
    listAllPlacementMapRows().map((r) => [r.placementId, r] as const)
  );
  const occupancy = occupancyRows.map((o) => {
    const row = placementNameById.get(o.placementKey);
    return {
      placementKey: o.placementKey,
      displayNameKo: row?.displayNameKo ?? o.placementKey,
      displayNameEn: row?.displayNameEn ?? o.placementKey,
      capacity: o.capacity,
      liveCount: o.liveCount,
      reservedCount: o.reservedCount,
      vacant: o.vacant,
      nextVacancyAt: o.nextVacancyAt,
      vacancyLabelKo: o.vacancyLabelKo,
      vacancyLabelEn: o.vacancyLabelEn,
      href: placementMapFocusHref(o.placementKey),
      loadState: "ok" as const,
    };
  });
  const vacantTotal = occupancyUnavailable
    ? null
    : occupancy.reduce((sum, o) => sum + o.vacant, 0);

  return {
    generatedAt: new Date().toISOString(),
    actionRequired: actionRequired.slice(0, 40),
    queues: {
      delivery: {
        count: deliveryUnavailable ? null : deliveryQueue.ok ? deliveryQueue.items.length : null,
        unavailable: deliveryUnavailable,
        href: `${DELIVERY_AD_ADMIN_ROUTES.hub}?view=actionable`,
        source: "delivery_ad_operations_cases WAITING_ADMIN",
      },
      feed: {
        count: feedUnavailable ? null : feedPending.length,
        unavailable: feedUnavailable,
        href: "/admin/ad-applications?domain=feed",
        source: "feed_ad_requests pending_review",
      },
      popup: {
        count: popupUnavailable ? null : popupRows.length,
        unavailable: popupUnavailable,
        href: "/admin/platform-popup",
        source: "platform_popup_owner_requests submitted|under_review",
      },
      tradePromote: {
        count: boostUnavailable ? null : tradeRows.length,
        unavailable: boostUnavailable,
        href: "/admin/ad-applications?domain=trade",
        source: "point_promotion_orders trade pending_review",
      },
      communityPromote: {
        count: boostUnavailable ? null : communityRows.length,
        unavailable: boostUnavailable,
        href: "/admin/ad-applications?domain=community",
        source: "point_promotion_orders community pending_review HOLD",
      },
      collisionBlocking: {
        count: activeDelivery.error ? null : blockingCount,
        unavailable: !!activeDelivery.error,
        href: `${DELIVERY_AD_ADMIN_ROUTES.hub}#collision`,
        source: "presentation detectPlacementCollisions BLOCKING",
      },
      collisionWarning: {
        count: activeDelivery.error ? null : warningCount,
        unavailable: !!activeDelivery.error,
        href: `${DELIVERY_AD_ADMIN_ROUTES.hub}#collision`,
        source: "presentation detectPlacementCollisions WARNING",
      },
      endingSoon: {
        count: activeDelivery.error ? null : endingSoonCount,
        unavailable: !!activeDelivery.error,
        href: `${DELIVERY_AD_ADMIN_ROUTES.hub}?view=active`,
        source: "ACTIVE|SCHEDULED endAt <= 72h",
      },
      vacantSlots: {
        count: vacantTotal,
        unavailable: occupancyUnavailable,
        href: `${DELIVERY_AD_ADMIN_ROUTES.inventory}#placement-map`,
        source: "computePlacementOccupancy over delivery schedules",
      },
    },
    currentExecution: currentExecution.slice(0, 30),
    collisions,
    occupancy,
    applications: applications.slice(0, 30),
    creatives: creatives.slice(0, 20),
    placements,
    billingNotes: [
      {
        domain: "delivery",
        currency: "CASH",
        noteKo: "배달 광고는 Cash로 결제합니다. 결제·승인·실제 노출은 각각 별개입니다.",
        noteEn: "Delivery Ads bill in Cash. Payment, approval, and exposure are separate.",
        href: "/admin/finance#action-required",
      },
      {
        domain: "feed",
        currency: "POINT",
        noteKo: "피드 광고는 Point로 결제합니다.",
        noteEn: "Feed Ads bill in Point.",
        href: "/admin/finance#point",
      },
      {
        domain: "popup",
        currency: "CASH",
        noteKo: "팝업은 Cash 결제입니다.",
        noteEn: "Popup bills in Cash.",
        href: "/admin/platform-popup",
      },
      {
        domain: "trade_promote",
        currency: "POINT",
        noteKo: "거래 홍보는 Point입니다. 광고 상품/Partner가 아닙니다.",
        noteEn: "Trade promote uses Point. Not an AdProduct/Partner.",
        href: "/admin/ad-applications?domain=trade",
      },
    ],
    domainEntries: [
      {
        id: "delivery_hub",
        labelKo: "Delivery Ads 허브",
        labelEn: "Delivery Ads hub",
        href: DELIVERY_AD_ADMIN_ROUTES.hub,
        frequency: "REALTIME_CRITICAL",
      },
      {
        id: "placement_map",
        labelKo: "Placement Map",
        labelEn: "Placement Map",
        href: `${DELIVERY_AD_ADMIN_ROUTES.inventory}#placement-map`,
        frequency: "FREQUENT",
      },
      {
        id: "feed",
        labelKo: "Feed Ads",
        labelEn: "Feed Ads",
        href: "/admin/feed-ads",
        frequency: "DAILY",
      },
      {
        id: "popup",
        labelKo: "Popup",
        labelEn: "Popup",
        href: "/admin/platform-popup",
        frequency: "DAILY",
      },
      {
        id: "partner",
        labelKo: "Partner (≠ AdProduct)",
        labelEn: "Partner (≠ AdProduct)",
        href: DELIVERY_AD_ADMIN_ROUTES.partnerMemberships,
        frequency: "OCCASIONAL",
      },
      {
        id: "finance",
        labelKo: "재무 관제 (B4)",
        labelEn: "Finance control plane (B4)",
        href: "/admin/finance#action-required",
        frequency: "FREQUENT",
      },
    ],
    recent: [...applications, ...actionRequired]
      .filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 80),
    sectionErrors,
  };
}
