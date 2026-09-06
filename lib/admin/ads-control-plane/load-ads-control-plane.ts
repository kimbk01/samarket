/**
 * ARO-OPS-UX-002-B5 — Ads / Exposure Control Plane loader.
 * Composes Delivery / Feed / Popup / Trade-promote sources. No new ads tables.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listDeliveryAdAdminActionQueue } from "@/lib/stores/advertising/delivery-ad-operations-action-queue";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { loadAdminDeliveryAdCampaignList } from "@/lib/stores/advertising/admin-delivery-ad-loader";
import { listAllPlacementMapRows, placementMapFocusHref } from "@/lib/admin/placement-map-read-model";
import { listFeedAdCampaignsForAdmin } from "@/lib/ads/feed-ad-campaigns-db";
import { listPlatformPopupAdminCampaigns } from "@/lib/platform-popup/admin-campaign-loader";
import { projectFeedAdOpsProductStatus } from "@/lib/ads/feed-ad-ops-presentation";
import type {
  AdsActionItem,
  AdsCollisionCard,
  AdsControlPlaneModel,
  AdsExecutionRow,
} from "@/lib/admin/ads-control-plane/types";
import { mapRawToAdsOpsStatus } from "@/lib/admin/ads-exposure/ops-status";
import { adminDeliveryAdInventoryHumanLabel } from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import { detectPlacementCollisions } from "@/lib/admin/ads-collision/detect-placement-collisions";
import { computePlacementOccupancy } from "@/lib/admin/ads-operator/placement-occupancy";
import {
  dedupeAdsActionItems,
  isAdsShellActionRequired,
  projectDeliveryCampaignToActionItem,
  projectDeliveryCampaignToExecutionRow,
  projectFeedCampaignToActionItem,
  projectFeedCampaignToExecutionRow,
  projectFeedRequestToActionItem,
  projectPopupCampaignToActionItem,
  projectPopupCampaignToExecutionRow,
  projectPopupRequestToActionItem,
  projectPromoteOrderToActionItem,
  promoteOrderOpsStatus,
  sortAdsActionItemsByAtDesc,
  type FeedRequestRow,
  type PopupRequestRow,
  type PromoteOrderRow,
} from "@/lib/admin/ads-control-plane/project-family-rows";

function isMissing(err: { message?: string } | null | undefined, re: RegExp): boolean {
  return !!err && re.test(String(err.message ?? ""));
}

function formatPeriod(startAt: string | null | undefined, endAt: string | null | undefined): string | null {
  if (!startAt && !endAt) return null;
  const a = startAt ? new Date(startAt).toLocaleDateString("ko") : "?";
  const b = endAt ? new Date(endAt).toLocaleDateString("ko") : "?";
  return `${a} → ${b}`;
}

const FAMILY_LIMIT = 120;

export async function loadAdsControlPlane(sb: SupabaseClient): Promise<AdsControlPlaneModel> {
  const sectionErrors: string[] = [];

  const [
    deliveryQueue,
    feedRes,
    popupRes,
    boostPromoRes,
    activeDelivery,
    popupCampaignsRes,
    feedCampaignsSettled,
  ] = await Promise.all([
    listDeliveryAdAdminActionQueue(sb, { limit: 40 }),
    sb
      .from("feed_ad_requests")
      .select("id, user_id, status, start_at, end_at, created_at, placement, title")
      .order("created_at", { ascending: false })
      .limit(FAMILY_LIMIT),
    sb
      .from("platform_popup_owner_requests")
      .select("id, store_id, owner_user_id, request_status, created_at, title")
      .order("created_at", { ascending: false })
      .limit(FAMILY_LIMIT),
    sb
      .from("point_promotion_orders")
      .select(
        "id, user_id, domain, order_status, created_at, target_id, target_title, product_id, point_cost, start_at, end_at"
      )
      .in("domain", ["trade", "community"])
      .order("created_at", { ascending: false })
      .limit(FAMILY_LIMIT),
    loadAdminDeliveryAdCampaignList(sb, { product: "all", limit: FAMILY_LIMIT }),
    listPlatformPopupAdminCampaigns(sb, { limit: FAMILY_LIMIT }),
    listFeedAdCampaignsForAdmin(sb)
      .then((items) => ({ ok: true as const, items }))
      .catch((e: unknown) => ({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      })),
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
  if (activeDelivery.error) sectionErrors.push(`delivery_list:${activeDelivery.error}`);
  if (!popupCampaignsRes.ok) {
    if (!/platform_popup_campaigns|schema cache|does not exist/i.test(popupCampaignsRes.error)) {
      sectionErrors.push(`popup_campaigns:${popupCampaignsRes.error}`);
    }
  }
  if (!feedCampaignsSettled.ok) {
    if (
      !/feed_ad_campaigns|schema cache|does not exist/i.test(feedCampaignsSettled.error)
    ) {
      sectionErrors.push(`feed_campaigns:${feedCampaignsSettled.error}`);
    }
  }

  const deliveryUnavailable = !deliveryQueue.ok;
  const feedUnavailable =
    !!feedRes.error && !isMissing(feedRes.error, /feed_ad_requests|schema cache|does not exist/i);
  const popupUnavailable =
    !!popupRes.error &&
    !isMissing(popupRes.error, /platform_popup_owner_requests|schema cache|does not exist/i);
  const boostUnavailable =
    !!boostPromoRes.error &&
    !isMissing(boostPromoRes.error, /point_promotion_orders|schema cache|does not exist/i);
  const popupCampaignsUnavailable = !popupCampaignsRes.ok;

  const feedRows = feedUnavailable ? [] : ((feedRes.data ?? []) as FeedRequestRow[]);
  const popupRows = popupUnavailable ? [] : ((popupRes.data ?? []) as PopupRequestRow[]);
  const boostRows = boostUnavailable
    ? []
    : ((boostPromoRes.data ?? []) as PromoteOrderRow[]);
  const deliveryItems = activeDelivery.error ? [] : activeDelivery.items;
  const popupCampaignItems = popupCampaignsUnavailable ? [] : popupCampaignsRes.items;
  const feedCampaigns = feedCampaignsSettled.ok ? feedCampaignsSettled.items : [];

  const projected: AdsActionItem[] = [];

  for (const c of deliveryItems) {
    projected.push(projectDeliveryCampaignToActionItem(c));
  }
  for (const r of feedRows) {
    projected.push(projectFeedRequestToActionItem(r));
  }
  for (const c of feedCampaigns) {
    projected.push(projectFeedCampaignToActionItem(c));
  }
  for (const r of popupRows) {
    projected.push(projectPopupRequestToActionItem(r));
  }
  for (const c of popupCampaignItems) {
    projected.push(projectPopupCampaignToActionItem(c));
  }
  for (const r of boostRows) {
    projected.push(projectPromoteOrderToActionItem(r));
  }

  const applications = sortAdsActionItemsByAtDesc(dedupeAdsActionItems(projected));

  const actionRequired = applications.filter((row) =>
    isAdsShellActionRequired(mapRawToAdsOpsStatus(row.status))
  );

  const promoteExecution: AdsExecutionRow[] = boostRows.flatMap((r) => {
    const ops = promoteOrderOpsStatus(r);
    if (ops !== "live" && ops !== "scheduled" && ops !== "paused") return [];
    const item = projectPromoteOrderToActionItem(r);
    return [
      {
        id: item.id,
        domain: item.domain,
        product: item.product,
        label: item.applicantLabel,
        placement: item.placementHint,
        status: item.status,
        eligibility: item.exposureLabel ?? item.status,
        period: item.periodLabel,
        remainingLabel: item.remainingLabel,
        currency: item.currency,
        href: item.href,
        statementHref: item.statementHref,
        source: item.source,
        conflictSeverity: "NONE" as const,
        conflictLabelKo: "",
        conflictLabelEn: "",
      },
    ];
  });

  const currentExecution: AdsExecutionRow[] = [
    ...deliveryItems
      .map((c) => projectDeliveryCampaignToExecutionRow(c))
      .filter((row): row is AdsExecutionRow => row != null),
    ...feedCampaigns
      .map((c) => projectFeedCampaignToExecutionRow(c))
      .filter((row): row is AdsExecutionRow => row != null),
    ...popupCampaignItems
      .map((c) => projectPopupCampaignToExecutionRow(c))
      .filter((row): row is AdsExecutionRow => row != null),
    ...promoteExecution,
  ];

  const feedPending = feedRows.filter((r) => {
    return (
      projectFeedAdOpsProductStatus({
        requestStatus: String(r.status ?? ""),
        startAt: typeof r.start_at === "string" ? r.start_at : null,
        endAt: typeof r.end_at === "string" ? r.end_at : null,
      }) === "pending_review"
    );
  });
  const popupPending = popupRows.filter((r) => {
    const st = String(r.request_status ?? "").toLowerCase();
    return st === "submitted" || st === "under_review";
  });
  const tradeRows = boostRows.filter((r) => String(r.domain) === "trade");
  const communityRows = boostRows.filter((r) => String(r.domain) === "community");
  const tradePending = tradeRows.filter(
    (r) => String(r.order_status ?? "").toLowerCase() === "pending_review"
  );
  const communityPending = communityRows.filter(
    (r) => String(r.order_status ?? "").toLowerCase() === "pending_review"
  );

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

  const creatives: AdsActionItem[] = [];

  return {
    generatedAt: new Date().toISOString(),
    actionRequired: actionRequired.slice(0, 60),
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
        count: popupUnavailable ? null : popupPending.length,
        unavailable: popupUnavailable,
        href: "/admin/platform-popup",
        source: "platform_popup_owner_requests submitted|under_review",
      },
      tradePromote: {
        count: boostUnavailable ? null : tradePending.length,
        unavailable: boostUnavailable,
        href: "/admin/ad-applications?domain=trade",
        source: "point_promotion_orders trade pending_review",
      },
      communityPromote: {
        count: boostUnavailable ? null : communityPending.length,
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
    currentExecution: currentExecution.slice(0, 80),
    collisions,
    occupancy,
    applications: applications.slice(0, 150),
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
    recent: applications.slice(0, 40),
    sectionErrors,
  };
}
