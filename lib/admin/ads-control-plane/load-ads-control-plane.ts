/**
 * ARO-OPS-UX-002-B5 — Ads / Exposure Control Plane loader.
 * Composes Delivery / Feed / Popup / Trade-promote sources. No new ads tables.
 *
 * R7 — 목록(`applications`)은 DB RPC `admin_ads_workspace_page` 한 번으로 원천 합치기·화면 모드·종류·상태 탭·
 * 정렬·페이지·전체 건수(total)·모드별 상태 탭 개수(summaryCounts)를 받는다 (원천별 120건 상한·메모리 합치기 없음).
 * 페이지 행만 원천별 id 로 읽어 기존 projector 로 그린다. 점유·충돌·종료 임박은 노출 일정 lifecycle 전체(상한 없음).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listDeliveryAdAdminActionQueue } from "@/lib/stores/advertising/delivery-ad-operations-action-queue";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import {
  loadAdminDeliveryAdCampaignsByIds,
  loadAdminDeliveryAdCampaignsByLifecycles,
} from "@/lib/stores/advertising/admin-delivery-ad-loader";
import { DELIVERY_BANNER_CREATIVE_READINESS } from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import { HERO_OCCUPYING_LIFECYCLES } from "@/lib/admin/ads-exposure/capacity-gate";
import { listAllPlacementMapRows, placementMapFocusHref } from "@/lib/admin/placement-map-read-model";
import { listFeedAdCampaignsByIdsForAdmin } from "@/lib/ads/feed-ad-campaigns-db";
import { listPlatformPopupAdminCampaignsByIds } from "@/lib/platform-popup/admin-campaign-loader";
import type {
  AdsActionItem,
  AdsCollisionCard,
  AdsControlPlaneModel,
  AdsExecutionRow,
  AdsWorkspacePageMeta,
  AdsWorkspacePopupSurfaceGroup,
} from "@/lib/admin/ads-control-plane/types";
import { mapRawToAdsOpsStatus } from "@/lib/admin/ads-exposure/ops-status";
import { computePopupWinnerOccupancy } from "@/lib/admin/ads-exposure/popup-runtime-display";
import { popupOperationalDisplayTitle } from "@/lib/admin/ads-exposure/untitled-display-title";
import { adminDeliveryAdInventoryHumanLabel } from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import { detectPlacementCollisions } from "@/lib/admin/ads-collision/detect-placement-collisions";
import { computePlacementOccupancy } from "@/lib/admin/ads-operator/placement-occupancy";
import {
  isAdsShellActionRequired,
  projectDeliveryCampaignToActionItem,
  projectDeliveryCampaignToExecutionRow,
  projectFeedCampaignToActionItem,
  projectFeedCampaignToExecutionRow,
  projectFeedRequestToActionItem,
  projectPopupCampaignToActionItem,
  projectPopupCampaignToExecutionRow,
  projectPromoteOrderToActionItem,
  promoteOrderOpsStatus,
  type FeedRequestRow,
  type PromoteOrderRow,
} from "@/lib/admin/ads-control-plane/project-family-rows";
import type { PlatformPopupAdminListItem } from "@/lib/platform-popup/admin-campaign-loader";
import type { FeedAdCampaignView } from "@/lib/ads/feed-ad-placement";
import { pinEnsuredBoostOrderInApplications } from "@/lib/admin/ads-exposure/boost-order-deep-link";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";

function isMissing(err: { message?: string } | null | undefined, re: RegExp): boolean {
  return !!err && re.test(String(err.message ?? ""));
}

function formatPeriod(startAt: string | null | undefined, endAt: string | null | undefined): string | null {
  if (!startAt && !endAt) return null;
  const a = startAt ? formatAdminManilaDate(startAt) : "?";
  const b = endAt ? formatAdminManilaDate(endAt) : "?";
  return `${a} → ${b}`;
}

export const ADS_WORKSPACE_PAGE_RPC = "admin_ads_workspace_page";

/** 화면 페이지 크기 상한 (AdminPagination 20/50/100). */
export const ADS_WORKSPACE_PAGE_MAX_LIMIT = 100;
/** 페이지 조건 없이 부를 때(대시보드·위치 점유 패널) 미리보기 행 수. */
const ADS_WORKSPACE_DEFAULT_LIMIT = 20;

/** 노출 일정 계산(점유·충돌·종료 임박)에 쓰는 배달 광고 lifecycle — HERO 점유 + 노출 겹침 후보. */
const DELIVERY_SCHEDULE_LIFECYCLES = [...new Set([...HERO_OCCUPYING_LIFECYCLES, "ACTIVE", "SCHEDULED"])];

const BOOST_ORDER_SELECT =
  "id, user_id, domain, order_status, created_at, target_id, target_title, product_id, point_cost, start_at, end_at, duration_days";

const FEED_REQUEST_SELECT =
  "id, user_id, status, start_at, end_at, created_at, placement, domain, product_id, destination_type, destination_id, target_topic_slug";

const BOOST_ORDER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdsWorkspacePageQuery = {
  mode?: AdsWorkspacePageMeta["mode"];
  /** 상태 탭 — "all" 또는 비움 = 전체 */
  status?: string | null;
  /** 종류 탭 — "all" 또는 비움 = 전체 */
  family?: string | null;
  limit?: number;
  offset?: number;
};

export type LoadAdsControlPlaneOptions = {
  /**
   * When set (valid uuid), that `point_promotion_orders` row is loaded and pinned to the top of
   * `applications` even when it is not on the current page — Admin Boost deep-link.
   */
  ensureBoostOrderId?: string;
  /**
   * LNK-1 — optional store scope (uuid text; the route validates it).
   *
   * - Delivery / popup campaign rows: matched on their store (`store_id` / `owner_store_id`) in the DB.
   * - Rows with **no store association** (feed requests/campaigns, promote orders — member-owned) are
   *   **excluded** while the filter is on; they are not "unknown store" matches.
   * - Placement occupancy stays computed over the global delivery schedule
   *   (capacity is a placement-wide fact); collision cards are then narrowed to the store's campaigns.
   */
  storeId?: string;
  /** R7 서버 페이지 조건 — 없으면 화면 기본(전체·첫 페이지 20건). */
  page?: AdsWorkspacePageQuery;
};

type WorkspaceRef = { family: string; sourceId: string; itemId: string };

type WorkspaceRpcPayload = {
  total?: unknown;
  rows?: unknown;
  summary_counts?: unknown;
  queue_counts?: { feed_pending?: unknown; trade_pending?: unknown; community_pending?: unknown } | null;
  popup_surfaces?: unknown;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * 페이지 행(원천별 id) → 화면 행. 원천별로 id 목록만 읽어 기존 projector 로 그린다 (입력 순서 유지).
 */
async function hydrateWorkspaceRefs(
  sb: SupabaseClient,
  refs: readonly WorkspaceRef[],
  popupWinner: {
    winnerIds: ReadonlySet<string>;
    winnerById: ReadonlyMap<string, { displayName: string; priority: number; periodLabel: string }>;
  },
  sectionErrors: string[]
): Promise<{ items: Map<string, AdsActionItem>; execution: Map<string, AdsExecutionRow> }> {
  const idsOf = (family: string) => [...new Set(refs.filter((r) => r.family === family).map((r) => r.sourceId))];
  const deliveryIds = idsOf("delivery");
  const feedReqIds = idsOf("feed_request");
  const feedCampIds = idsOf("feed_campaign");
  const popupIds = idsOf("popup_campaign");
  const promoteIds = idsOf("promote");

  const [deliveryRes, feedRes, feedCampsSettled, popupRes, boostRes] = await Promise.all([
    deliveryIds.length
      ? loadAdminDeliveryAdCampaignsByIds(
          sb,
          deliveryIds.flatMap((id) => [
            { productKind: "store_sponsored" as const, id },
            { productKind: "banner" as const, id },
          ])
        )
      : Promise.resolve({ items: [] as Awaited<ReturnType<typeof loadAdminDeliveryAdCampaignsByIds>>["items"] }),
    feedReqIds.length
      ? sb.from("feed_ad_requests").select(FEED_REQUEST_SELECT).in("id", feedReqIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    feedCampIds.length
      ? listFeedAdCampaignsByIdsForAdmin(sb, feedCampIds)
          .then((items) => ({ ok: true as const, items }))
          .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }))
      : Promise.resolve({ ok: true as const, items: [] as FeedAdCampaignView[] }),
    popupIds.length
      ? listPlatformPopupAdminCampaignsByIds(sb, popupIds)
      : Promise.resolve({ ok: true as const, items: [] as PlatformPopupAdminListItem[] }),
    promoteIds.length
      ? sb.from("point_promotion_orders").select(BOOST_ORDER_SELECT).in("id", promoteIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  const items = new Map<string, AdsActionItem>();
  const execution = new Map<string, AdsExecutionRow>();

  if ("error" in deliveryRes && deliveryRes.error) sectionErrors.push(`delivery_list:${deliveryRes.error}`);
  for (const c of deliveryRes.items) {
    const item = projectDeliveryCampaignToActionItem(c);
    if (items.has(item.id)) continue;
    items.set(item.id, item);
    const exec = projectDeliveryCampaignToExecutionRow(c);
    if (exec) execution.set(exec.id, exec);
  }

  if (feedRes.error && !isMissing(feedRes.error, /feed_ad_requests|schema cache|does not exist/i)) {
    sectionErrors.push(`feed:${feedRes.error.message}`);
  }
  const feedRows = (feedRes.error ? [] : (feedRes.data ?? [])) as unknown as FeedRequestRow[];
  const feedCreativeByRequest = new Map<string, string>();
  if (feedRows.length > 0) {
    const creativeRes = await sb
      .from("feed_ad_request_creatives")
      .select("request_id, image_url, sort_order")
      .in("request_id", feedRows.map((r) => String(r.id ?? "")).filter(Boolean))
      .order("sort_order", { ascending: true });
    if (
      creativeRes.error &&
      !isMissing(creativeRes.error, /feed_ad_request_creatives|schema cache|does not exist/i)
    ) {
      sectionErrors.push(`feed_creatives:${creativeRes.error.message}`);
    } else {
      for (const row of creativeRes.data ?? []) {
        const rid = String((row as { request_id?: unknown }).request_id ?? "").trim();
        const url = String((row as { image_url?: unknown }).image_url ?? "").trim();
        if (!rid || !url || feedCreativeByRequest.has(rid)) continue;
        feedCreativeByRequest.set(rid, url);
      }
    }
  }
  for (const r of feedRows) {
    const id = String(r.id ?? "").trim();
    const item = projectFeedRequestToActionItem({ ...r, creative_image_url: feedCreativeByRequest.get(id) ?? null });
    items.set(item.id, item);
  }

  if (!feedCampsSettled.ok) {
    if (!/feed_ad_campaigns|schema cache|does not exist/i.test(feedCampsSettled.error)) {
      sectionErrors.push(`feed_campaigns:${feedCampsSettled.error}`);
    }
  } else {
    for (const c of feedCampsSettled.items) {
      const item = projectFeedCampaignToActionItem(c);
      items.set(item.id, item);
      const exec = projectFeedCampaignToExecutionRow(c);
      if (exec) execution.set(exec.id, exec);
    }
  }

  if (!popupRes.ok) {
    if (!/platform_popup_campaigns|schema cache|does not exist/i.test(popupRes.error)) {
      sectionErrors.push(`popup_campaigns:${popupRes.error}`);
    }
  } else {
    for (const c of popupRes.items) {
      const item = projectPopupCampaignToActionItem(c, popupWinner);
      items.set(item.id, item);
      const exec = projectPopupCampaignToExecutionRow(c);
      if (exec) execution.set(exec.id, exec);
    }
  }

  if (boostRes.error && !isMissing(boostRes.error, /point_promotion_orders|schema cache|does not exist/i)) {
    sectionErrors.push(`boost_promo:${boostRes.error.message}`);
  }
  for (const r of (boostRes.error ? [] : (boostRes.data ?? [])) as unknown as PromoteOrderRow[]) {
    const item = projectPromoteOrderToActionItem(r);
    items.set(item.id, item);
    const exec = promoteExecutionRow(r);
    if (exec) execution.set(exec.id, exec);
  }

  return { items, execution };
}

function promoteExecutionRow(r: PromoteOrderRow): AdsExecutionRow | null {
  const ops = promoteOrderOpsStatus(r);
  if (ops !== "live" && ops !== "scheduled" && ops !== "paused") return null;
  const item = projectPromoteOrderToActionItem(r);
  return {
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
  };
}

const WORKSPACE_MODES = new Set(["all", "applications", "operations", "history", "boosts"]);

export async function loadAdsControlPlane(
  sb: SupabaseClient,
  options?: LoadAdsControlPlaneOptions
): Promise<AdsControlPlaneModel> {
  const sectionErrors: string[] = [];
  const ensureBoostOrderId = String(options?.ensureBoostOrderId ?? "").trim();
  const storeId = String(options?.storeId ?? "").trim();
  const pageQuery = options?.page ?? {};
  const mode = (WORKSPACE_MODES.has(String(pageQuery.mode ?? "")) ? pageQuery.mode : "all") as AdsWorkspacePageMeta["mode"];
  const statusTab = String(pageQuery.status ?? "").trim() || "all";
  const familyTab = String(pageQuery.family ?? "").trim() || "all";
  const limit = Math.min(
    ADS_WORKSPACE_PAGE_MAX_LIMIT,
    Math.max(1, Math.floor(Number(pageQuery.limit) || ADS_WORKSPACE_DEFAULT_LIMIT))
  );
  const offset = Math.max(0, Math.min(100_000, Math.floor(Number(pageQuery.offset) || 0)));

  // 실제 노출 1위 팝업 (런타임 사실) — 노출 중/노출 대기 탭 구분에 RPC 로 넘긴다.
  let popupWinnerIds = new Set<string>();
  try {
    const occupancy = await computePopupWinnerOccupancy(sb);
    popupWinnerIds = occupancy.winnerIds;
  } catch (cause) {
    sectionErrors.push(
      `popup_runtime_display:${cause instanceof Error ? cause.message : String(cause)}`
    );
  }

  // 레거시 팝업 오너 신청 처리 대기 (queues.popup) — 목록 행에는 기존 동작대로 포함하지 않는다.
  const popupOwnerPendingQ = (() => {
    let q = sb
      .from("platform_popup_owner_requests")
      .select("id", { count: "exact", head: true })
      .in("request_status", ["submitted", "under_review"]);
    if (storeId) q = q.eq("store_id", storeId);
    return q;
  })();

  const [rpcRes, deliveryQueue, popupOwnerPending, globalSchedule, scopedSchedule] = await Promise.all([
    sb.rpc(ADS_WORKSPACE_PAGE_RPC, {
      p_mode: mode,
      p_status: statusTab === "all" ? null : statusTab,
      p_family: familyTab === "all" ? null : familyTab,
      p_store_id: storeId || null,
      p_popup_winner_ids: [...popupWinnerIds],
      p_pending_asset: DELIVERY_BANNER_CREATIVE_READINESS.pendingAssetPath,
      p_limit: limit,
      p_offset: offset,
    }),
    listDeliveryAdAdminActionQueue(sb, { limit: 1 }),
    popupOwnerPendingQ,
    loadAdminDeliveryAdCampaignsByLifecycles(sb, DELIVERY_SCHEDULE_LIFECYCLES),
    storeId
      ? loadAdminDeliveryAdCampaignsByLifecycles(sb, DELIVERY_SCHEDULE_LIFECYCLES, { storeId })
      : Promise.resolve(null),
  ]);
  if (rpcRes.error) throw new Error(rpcRes.error.message);
  const payload = (rpcRes.data ?? {}) as WorkspaceRpcPayload;

  const refs: WorkspaceRef[] = (Array.isArray(payload.rows) ? (payload.rows as Record<string, unknown>[]) : []).map(
    (r) => ({
      family: String(r.family ?? ""),
      sourceId: String(r.source_id ?? ""),
      itemId: String(r.item_id ?? ""),
    })
  );
  const popupGroupsRaw = (Array.isArray(payload.popup_surfaces) ? payload.popup_surfaces : []) as Array<{
    surfaces?: unknown;
    live_ids?: unknown;
    waiting_ids?: unknown;
    incomplete?: unknown;
    scheduled?: unknown;
  }>;
  const idList = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)) : []);
  const popupPanelRefs: WorkspaceRef[] = popupGroupsRaw.flatMap((g) =>
    [...idList(g.live_ids), ...idList(g.waiting_ids)].map((id) => ({
      family: "popup_campaign",
      sourceId: id,
      itemId: `popup_campaign:${id}`,
    }))
  );
  const ensureRef: WorkspaceRef[] =
    !storeId && ensureBoostOrderId && BOOST_ORDER_UUID_RE.test(ensureBoostOrderId)
      ? [{ family: "promote", sourceId: ensureBoostOrderId, itemId: "" }]
      : [];

  // 실제 노출 1위 팝업 표시 이름 (노출 대기 사유 문구)
  const winnerById = new Map<string, { displayName: string; priority: number; periodLabel: string }>();
  if (popupWinnerIds.size > 0) {
    const winners = await listPlatformPopupAdminCampaignsByIds(sb, [...popupWinnerIds]);
    if (winners.ok) {
      for (const c of winners.items) {
        winnerById.set(c.id, {
          displayName: popupOperationalDisplayTitle({ name: c.name, id: c.id, updatedAt: c.updatedAt, ko: true }),
          priority: c.priority,
          periodLabel:
            c.startAt || c.endAt
              ? `${c.startAt?.slice(0, 10) ?? "?"} → ${c.endAt?.slice(0, 10) ?? "?"}`
              : "—",
        });
      }
    }
  }

  const hydrated = await hydrateWorkspaceRefs(
    sb,
    [...refs, ...popupPanelRefs, ...ensureRef],
    { winnerIds: popupWinnerIds, winnerById },
    sectionErrors
  );

  // RPC 순서 유지 — 읽는 사이 지워진 행은 건너뛴다.
  const pageItems = refs
    .map((r) => hydrated.items.get(r.itemId))
    .filter((i): i is AdsActionItem => i != null);
  const pinned = ensureBoostOrderId
    ? [...hydrated.items.values()].filter(
        (i) =>
          (i.domain === "community_promote" || i.domain === "trade_promote") &&
          i.id.endsWith(`:${ensureBoostOrderId}`)
      )
    : [];

  const popupSurfaces: AdsWorkspacePopupSurfaceGroup[] = popupGroupsRaw.map((g) => ({
    surfaces: String(g.surfaces ?? "GLOBAL"),
    live: idList(g.live_ids)
      .map((id) => hydrated.items.get(`popup_campaign:${id}`))
      .filter((i): i is AdsActionItem => i != null),
    waiting: idList(g.waiting_ids)
      .map((id) => hydrated.items.get(`popup_campaign:${id}`))
      .filter((i): i is AdsActionItem => i != null),
    incomplete: num(g.incomplete),
    scheduled: num(g.scheduled),
  }));

  const actionRequired = pageItems.filter((row) =>
    isAdsShellActionRequired(mapRawToAdsOpsStatus(row.status))
  );

  const currentExecution: AdsExecutionRow[] = [
    ...refs
      .map((r) => hydrated.execution.get(r.itemId))
      .filter((row): row is AdsExecutionRow => row != null),
  ];

  if (!deliveryQueue.ok) sectionErrors.push(`delivery_queue:${deliveryQueue.error}`);
  if (globalSchedule.error) sectionErrors.push(`delivery_list:${globalSchedule.error}`);
  if (scopedSchedule?.error) sectionErrors.push(`delivery_list_store:${scopedSchedule.error}`);
  const popupOwnerUnavailable =
    !!popupOwnerPending.error &&
    !isMissing(popupOwnerPending.error, /platform_popup_owner_requests|schema cache|does not exist/i);
  if (popupOwnerUnavailable) sectionErrors.push(`popup:${popupOwnerPending.error?.message}`);

  const deliveryUnavailable = !deliveryQueue.ok;
  const queueCounts: NonNullable<WorkspaceRpcPayload["queue_counts"]> = payload.queue_counts ?? {};

  /** Global delivery schedule for occupancy/collisions; store-scoped schedule for collision cards / ending soon. */
  const scheduleError = globalSchedule.error ?? scopedSchedule?.error;
  const globalDeliveryItems = globalSchedule.error ? [] : globalSchedule.items;
  const deliveryItems = storeId ? (scopedSchedule?.items ?? []) : globalDeliveryItems;
  const scopedDeliveryIds = new Set(deliveryItems.map((c) => String(c.id ?? "")));
  const collisionFindings = detectPlacementCollisions(
    globalDeliveryItems.map((c) => ({
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
    .filter(
      (f) =>
        !storeId ||
        scopedDeliveryIds.has(f.campaignId) ||
        f.peers.some((p) => scopedDeliveryIds.has(p.id))
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

  const occupancyUnavailable = !!globalSchedule.error;
  const occupancyRows = occupancyUnavailable
    ? []
    : computePlacementOccupancy(
        globalDeliveryItems.map((c) => ({
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

  const pageMeta: AdsWorkspacePageMeta = {
    mode,
    status: statusTab,
    family: familyTab,
    total: num(payload.total),
    limit,
    offset,
  };
  const summaryCounts =
    payload.summary_counts && typeof payload.summary_counts === "object"
      ? (payload.summary_counts as AdsControlPlaneModel["summaryCounts"])
      : undefined;

  return {
    generatedAt: new Date().toISOString(),
    page: pageMeta,
    summaryCounts,
    popupSurfaces,
    actionRequired: actionRequired.slice(0, 60),
    queues: {
      delivery: {
        count: deliveryQueue.ok ? deliveryQueue.total : null,
        unavailable: deliveryUnavailable,
        href: `${DELIVERY_AD_ADMIN_ROUTES.hub}?view=actionable`,
        source: "delivery_ad_operations_cases WAITING_ADMIN",
      },
      feed: {
        count: num(queueCounts.feed_pending),
        unavailable: false,
        href: "/admin/ad-applications?domain=feed",
        source: "feed_ad_requests pending_review",
      },
      popup: {
        count: popupOwnerUnavailable ? null : (popupOwnerPending.count ?? 0),
        unavailable: popupOwnerUnavailable,
        href: "/admin/platform-popup",
        source: "platform_popup_owner_requests submitted|under_review",
      },
      tradePromote: {
        count: num(queueCounts.trade_pending),
        unavailable: false,
        href: "/admin/ad-applications?domain=trade",
        source: "point_promotion_orders trade pending_review",
      },
      communityPromote: {
        count: num(queueCounts.community_pending),
        unavailable: false,
        href: "/admin/ad-applications?domain=community",
        source: "point_promotion_orders community pending_review HOLD",
      },
      collisionBlocking: {
        count: scheduleError ? null : blockingCount,
        unavailable: !!scheduleError,
        href: `${DELIVERY_AD_ADMIN_ROUTES.hub}#collision`,
        source: "presentation detectPlacementCollisions BLOCKING",
      },
      collisionWarning: {
        count: scheduleError ? null : warningCount,
        unavailable: !!scheduleError,
        href: `${DELIVERY_AD_ADMIN_ROUTES.hub}#collision`,
        source: "presentation detectPlacementCollisions WARNING",
      },
      endingSoon: {
        count: scheduleError ? null : endingSoonCount,
        unavailable: !!scheduleError,
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
    currentExecution,
    collisions,
    occupancy,
    // 서버 페이지 행 (+ 딥링크 상위노출 행은 페이지 밖이어도 맨 위에 고정)
    applications: pinEnsuredBoostOrderInApplications(pageItems, [...pinned, ...pageItems], ensureBoostOrderId),
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
    recent: pageItems.slice(0, 40),
    sectionErrors,
  };
}
