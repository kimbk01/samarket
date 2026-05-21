/**
 * GET /api/me/store-owner-hub-badge 및 세그먼트 라우트 공통 — 응답 필드 의미·합산은 기존 route.ts 와 동일.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { countPendingAcceptForStore } from "@/lib/stores/owner-store-pending-counts";
import { countRefundRequestedForStore } from "@/lib/stores/owner-store-refund-count";
import { countOpenStoreInquiriesForStore } from "@/lib/stores/count-open-store-inquiries";
import {
  getOwnerHubStoreAttentionCounts,
  type OwnerHubStoreAttentionCounts,
} from "@/lib/stores/get-owner-hub-store-attention-counts";
import {
  hubStoreAttentionMemoryTtlMs,
  invalidateHubStoreAttentionMemory,
  readHubStoreAttentionMemory,
} from "@/lib/stores/hub-store-attention-memory-cache";
import { invalidateHubBadgeUnreadPartsMemory } from "@/lib/chat/hub-badge-unread-parts-memory-cache";
import {
  getCachedUserChatUnreadParts,
  sumSocialChatUnread,
  sumTradeChatUnread,
  zeroUnreadPartsForNoHubStore,
} from "@/lib/chat/user-chat-unread-parts";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { ORDER_CHAT_MESSENGER_LIST_HREF } from "@/lib/chats/surfaces/order-chat-surface";
import {
  invalidateCommunityMessengerUnreadTotalCache,
  sumCommunityMessengerParticipantUnread,
} from "@/lib/community-messenger/community-messenger-unread-total";
import { invalidateHubStoreOrderUnreadMemory } from "@/lib/community-messenger/hub-store-order-unread-memory-cache";
import {
  countOwnerStoreOrderMessengerUnreadForHubStore,
} from "@/lib/community-messenger/store-order-chat-service";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { peekLastUnreadPartsComputeMeta } from "@/lib/chat/user-chat-unread-parts";
import {
  hubBadgeBreakdownForUser,
  logHubBadgeBreakdown,
  pickWorstStage,
  storeIdShort,
  type HubBadgeBreakdown,
} from "@/lib/chats/hub-badge-breakdown";
import {
  emptyFindOwnerHubStoreTiming,
  logFindHubStorePerf,
  type FindOwnerHubStoreTiming,
} from "@/lib/chats/find-owner-hub-store-perf";
import {
  invalidateOwnerHubStoreLookupCache,
  ownerHubStoreLookupMemoryTtlMs,
  readOwnerHubStoreLookupMemory,
  writeOwnerHubStoreLookupMemory,
} from "@/lib/chats/owner-hub-store-lookup-cache";
import {
  CM_UNREAD_HUB_FILTERS,
  CM_UNREAD_HUB_SELECT,
  emptyCmUnreadTiming,
  emptyStoreOrderUnreadTiming,
  logHubBadgeWave2Perf,
  STORE_ORDER_UNREAD_HUB_ORDERS_FILTERS,
  STORE_ORDER_UNREAD_HUB_ORDERS_SELECT,
  STORE_ORDER_UNREAD_HUB_PARTS_FILTERS,
  STORE_ORDER_UNREAD_HUB_PARTS_SELECT,
} from "@/lib/chats/hub-badge-wave2-perf";

export type OwnerHubBadgeBuildMeta = {
  queryType: "owner_hub_badge_light";
  aggregateFallbackUsed: 0;
  aggregateRemovedSuccess: 1;
  /** 1 = cold DB path ran store lookup; 0 = process TTL cache served */
  existsQueryUsed: 0 | 1;
};

export type OwnerHubBadgeApiPayload = {
  ok: true;
  total: number;
  chatUnread: number;
  communityMessengerUnread: number;
  philifeChatUnread: number;
  socialChatUnread: number;
  storeOrderChatUnread: number;
  orderAttention: number;
  inquiryAttention: number;
  storesTabAttention: number;
  storeDeepLink: string | null;
};

type HubStoreLiteRow = { id: string; slug?: string | null };

/** 점주 매장 1건 존재 여부 — 허브 카운트·주문 채팅 unread 생략 판단용 */
async function ownerHasAnyStore(
  storesSb: SupabaseClient<any> | null,
  userId: string
): Promise<boolean> {
  if (!storesSb) return false;
  const { data, error } = await storesSb
    .from("stores")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1);
  if (error || !Array.isArray(data) || data.length === 0) return false;
  return typeof (data[0] as { id?: unknown }).id === "string" && !!(data[0] as { id: string }).id.trim();
}

export type OwnerHubBadgeUnreadPartial = {
  chatUnread: number;
  communityMessengerUnread: number;
  philifeChatUnread: number;
  socialChatUnread: number;
  storeOrderChatUnread: number;
};

export type OwnerHubBadgeStorePartial = {
  orderAttention: number;
  inquiryAttention: number;
  storeDeepLink: string | null;
};

/** 1차: 채팅 미읽음·메신저 unread (스토어 목록·문의·접수 카운트 없음) */
export async function buildOwnerHubBadgeUnreadSegment(
  sbAny: SupabaseClient<any>,
  storesSb: SupabaseClient<any> | null,
  userId: string
): Promise<OwnerHubBadgeUnreadPartial> {
  const hubStore = await findOwnerHubStore(storesSb, userId);
  const hasOwnerStore = hubStore != null;
  const unreadParts = hasOwnerStore
    ? await getCachedUserChatUnreadParts(sbAny, userId)
    : zeroUnreadPartsForNoHubStore();
  const [communityMessengerUnread, storeOrderChatUnread] = await Promise.all([
    sumCommunityMessengerParticipantUnread(sbAny, userId).catch(() => 0),
    hasOwnerStore && storesSb && hubStore
      ? countOwnerStoreOrderMessengerUnreadForHubStore(storesSb as any, userId, hubStore.id).catch(() => 0)
      : Promise.resolve(0),
  ]);
  return {
    chatUnread: sumTradeChatUnread(unreadParts),
    communityMessengerUnread: Math.max(0, communityMessengerUnread),
    philifeChatUnread: Math.max(0, unreadParts.communityParticipantUnread),
    socialChatUnread: sumSocialChatUnread(unreadParts),
    storeOrderChatUnread: Math.max(0, storeOrderChatUnread),
  };
}

async function findOwnerHubStoreViaPostgrest(
  storesSb: SupabaseClient<any>,
  userId: string
): Promise<{ hubStore: HubStoreLiteRow | null; rows: number; error?: string }> {
  const { data, error } = await storesSb
    .from("stores")
    .select("id,slug,store_sales_permissions!inner(allowed_to_sell,sales_status)")
    .eq("owner_user_id", userId)
    .eq("approval_status", "approved")
    .eq("is_visible", true)
    .eq("store_sales_permissions.allowed_to_sell", true)
    .eq("store_sales_permissions.sales_status", "approved")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return { hubStore: null, rows: 0, error: error.message };
  const rows = Array.isArray(data) ? data.length : 0;
  if (rows <= 0) return { hubStore: null, rows: 0 };
  const row = data![0] as { id?: unknown; slug?: unknown };
  if (typeof row.id !== "string" || !row.id.trim()) return { hubStore: null, rows: 0 };
  return {
    hubStore: {
      id: row.id.trim(),
      slug: typeof row.slug === "string" ? row.slug : null,
    },
    rows: 1,
  };
}

/** empty/postgrest 동시 요청 — 동일 userId 단일 RTT (empty TTL 120s write 공유) */
const findOwnerHubStoreInflight = new Map<string, Promise<HubStoreLiteRow | null>>();

async function findOwnerHubStore(
  storesSb: SupabaseClient<any> | null,
  userId: string,
  timingOut?: FindOwnerHubStoreTiming
): Promise<HubStoreLiteRow | null> {
  if (!storesSb) {
    if (timingOut) Object.assign(timingOut, emptyFindOwnerHubStoreTiming());
    return null;
  }
  const uid = userId.trim();
  const total0 = devPerfNow();

  const mem = readOwnerHubStoreLookupMemory(uid);
  if (mem.hit) {
    const totalMs = devPerfNow() - total0;
    if (timingOut) {
      timingOut.find_hub_store_ms = Math.round(totalMs);
      timingOut.find_hub_store_query_ms = 0;
      timingOut.find_hub_store_permission_join_ms = 0;
      timingOut.find_hub_store_rows = mem.hubStore ? 1 : 0;
      timingOut.find_hub_store_via = "memory";
      timingOut.find_hub_store_cache_hit = 1;
      timingOut.find_hub_store_cache_age_ms = Math.round(mem.ageMs);
      logFindHubStorePerf(timingOut, uid.slice(0, 8));
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console -- TTL 내 스냅샷 지연 허용(관리자 매장·권한 변경 직후)
        console.info("[find-hub-store-memory-hit]", {
          user_id_short: uid.slice(0, 8),
          find_hub_store_cache_age_ms: Math.round(mem.ageMs),
          ttl_ms: ownerHubStoreLookupMemoryTtlMs(),
          stale_snapshot_within_ttl: true,
        });
      }
    }
    return mem.hubStore;
  }

  const existing = findOwnerHubStoreInflight.get(uid);
  if (existing) {
    const hubStore = await existing;
    const totalMs = devPerfNow() - total0;
    if (timingOut) {
      timingOut.find_hub_store_ms = Math.round(totalMs);
      timingOut.find_hub_store_query_ms = 0;
      timingOut.find_hub_store_permission_join_ms = 0;
      timingOut.find_hub_store_rows = hubStore ? 1 : 0;
      timingOut.find_hub_store_via = "memory";
      timingOut.find_hub_store_cache_hit = 1;
      timingOut.find_hub_store_cache_age_ms = 0;
    }
    return hubStore;
  }

  const flight = (async (): Promise<HubStoreLiteRow | null> => {
    const query0 = devPerfNow();
    const { hubStore, rows, error } = await findOwnerHubStoreViaPostgrest(storesSb, uid);
    const queryMs = devPerfNow() - query0;
    writeOwnerHubStoreLookupMemory(uid, hubStore);
    const totalMs = devPerfNow() - total0;
    if (timingOut) {
      timingOut.find_hub_store_ms = Math.round(totalMs);
      timingOut.find_hub_store_query_ms = Math.round(queryMs);
      timingOut.find_hub_store_permission_join_ms = 0;
      timingOut.find_hub_store_rows = rows;
      timingOut.find_hub_store_via = error ? "error" : rows > 0 ? "postgrest" : "empty";
      timingOut.find_hub_store_cache_hit = 0;
      timingOut.find_hub_store_cache_age_ms = 0;
      if (error) timingOut.find_hub_store_error = error.slice(0, 120);
      logFindHubStorePerf(timingOut, uid.slice(0, 8));
    }
    return hubStore;
  })().finally(() => {
    if (findOwnerHubStoreInflight.get(uid) === flight) {
      findOwnerHubStoreInflight.delete(uid);
    }
  });

  findOwnerHubStoreInflight.set(uid, flight);
  return flight;
}

export type OwnerHubBadgeStoreAttentionTiming = {
  refund_pending_ms: number;
  order_pending_ms: number;
  inquiry_pending_ms: number;
  store_attention_total_ms: number;
  store_attention_via?: "memory" | "rpc" | "legacy";
  store_attention_memory_hit?: 0 | 1;
  store_attention_memory_age_ms?: number;
  store_attention_rpc_ms?: number;
  store_attention_legacy_ms?: number;
};

/** 허브 매장 1건 기준 접수/환불·문의·딥링크 계산 */
export async function resolveOwnerHubBadgeStoreAttentionFromHubStore(
  storesSb: SupabaseClient<any> | null,
  hubStore: HubStoreLiteRow | null,
  storeOrderChatUnread: number,
  timingOut?: OwnerHubBadgeStoreAttentionTiming,
  prefetchedCounts?: Promise<OwnerHubStoreAttentionCounts | null> | null,
  prefetchStartedAt?: number
): Promise<OwnerHubBadgeStorePartial> {
  let orderAttention = 0;
  let inquiryAttention = 0;
  let storeDeepLink: string | null = null;

  if (!storesSb || !hubStore) {
    if (timingOut) {
      timingOut.refund_pending_ms = 0;
      timingOut.order_pending_ms = 0;
      timingOut.inquiry_pending_ms = 0;
      timingOut.store_attention_total_ms = 0;
    }
    return { orderAttention, inquiryAttention, storeDeepLink };
  }
  const attention0 = devPerfNow();
  let refund = 0;
  let pending = 0;
  let openInq = 0;

  const mem = readHubStoreAttentionMemory(hubStore.id);
  if (mem.hit) {
    refund = mem.counts.refundPendingCount;
    pending = mem.counts.orderPendingCount;
    openInq = mem.counts.inquiryPendingCount;
    const totalMs = devPerfNow() - attention0;
    if (timingOut) {
      timingOut.store_attention_via = "memory";
      timingOut.store_attention_memory_hit = 1;
      timingOut.store_attention_memory_age_ms = Math.round(mem.ageMs);
      timingOut.store_attention_rpc_ms = 0;
      timingOut.store_attention_legacy_ms = 0;
      timingOut.refund_pending_ms = 0;
      timingOut.order_pending_ms = 0;
      timingOut.inquiry_pending_ms = 0;
      timingOut.store_attention_total_ms = Math.round(totalMs);
    }
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- TTL 내 attention RPC 생략
      console.info("[store-attention-memory-hit]", {
        hub_store_id_short: hubStore.id.slice(0, 8),
        store_attention_memory_age_ms: Math.round(mem.ageMs),
        ttl_ms: hubStoreAttentionMemoryTtlMs(),
        stale_snapshot_within_ttl: true,
      });
    }
    orderAttention = Math.max(0, refund) + Math.max(0, pending);
    inquiryAttention = Math.max(0, openInq);
    if (inquiryAttention > 0) {
      storeDeepLink = `/stores/owner/inquiries?storeId=${encodeURIComponent(hubStore.id)}`;
    } else if (orderAttention > 0) {
      storeDeepLink = buildStoreOrdersHref({ storeId: hubStore.id });
    } else if (storeOrderChatUnread > 0) {
      storeDeepLink = ORDER_CHAT_MESSENGER_LIST_HREF;
    }
    return { orderAttention, inquiryAttention, storeDeepLink };
  }

  const rpc0 = devPerfNow();
  const rpcCounts = prefetchedCounts
    ? await prefetchedCounts
    : await getOwnerHubStoreAttentionCounts(storesSb, hubStore.id);
  const rpcMs =
    prefetchedCounts && prefetchStartedAt != null
      ? devPerfNow() - prefetchStartedAt
      : devPerfNow() - rpc0;

  if (rpcCounts) {
    refund = rpcCounts.refundPendingCount;
    pending = rpcCounts.orderPendingCount;
    openInq = rpcCounts.inquiryPendingCount;
    if (timingOut) {
      timingOut.store_attention_via = "rpc";
      timingOut.store_attention_memory_hit = 0;
      timingOut.store_attention_rpc_ms = Math.round(rpcMs);
      timingOut.store_attention_legacy_ms = 0;
      timingOut.refund_pending_ms = 0;
      timingOut.order_pending_ms = 0;
      timingOut.inquiry_pending_ms = 0;
      timingOut.store_attention_total_ms = Math.round(devPerfNow() - attention0);
    }
  } else {
    const legacy0 = devPerfNow();
    let refundMs = 0;
    let pendingMs = 0;
    let inquiryMs = 0;
    const [refundLegacy, pendingLegacy, openInqLegacy] = await Promise.all([
      (async () => {
        const t0 = devPerfNow();
        try {
          return await countRefundRequestedForStore(storesSb, hubStore.id);
        } finally {
          refundMs = devPerfNow() - t0;
        }
      })(),
      (async () => {
        const t0 = devPerfNow();
        try {
          return await countPendingAcceptForStore(storesSb, hubStore.id);
        } finally {
          pendingMs = devPerfNow() - t0;
        }
      })(),
      (async () => {
        const t0 = devPerfNow();
        try {
          return await countOpenStoreInquiriesForStore(storesSb, hubStore.id);
        } finally {
          inquiryMs = devPerfNow() - t0;
        }
      })(),
    ]);
    refund = refundLegacy;
    pending = pendingLegacy;
    openInq = openInqLegacy;
    if (timingOut) {
      timingOut.store_attention_via = "legacy";
      timingOut.store_attention_memory_hit = 0;
      timingOut.store_attention_rpc_ms = Math.round(rpcMs);
      timingOut.store_attention_legacy_ms = Math.round(devPerfNow() - legacy0);
      timingOut.refund_pending_ms = Math.round(refundMs);
      timingOut.order_pending_ms = Math.round(pendingMs);
      timingOut.inquiry_pending_ms = Math.round(inquiryMs);
      timingOut.store_attention_total_ms = Math.round(devPerfNow() - attention0);
    }
  }

  orderAttention = Math.max(0, refund) + Math.max(0, pending);
  inquiryAttention = Math.max(0, openInq);
  if (inquiryAttention > 0) {
    storeDeepLink = `/stores/owner/inquiries?storeId=${encodeURIComponent(hubStore.id)}`;
  } else if (orderAttention > 0) {
    storeDeepLink = buildStoreOrdersHref({ storeId: hubStore.id });
  } else if (storeOrderChatUnread > 0) {
    storeDeepLink = ORDER_CHAT_MESSENGER_LIST_HREF;
  }

  return { orderAttention, inquiryAttention, storeDeepLink };
}

/** 2차 단독 라우트: 스토어 목록부터 조회 */
export async function buildOwnerHubBadgeStoreAttentionSegment(
  storesSb: SupabaseClient<any> | null,
  userId: string,
  storeOrderChatUnread: number
): Promise<OwnerHubBadgeStorePartial> {
  const hubStore = await findOwnerHubStore(storesSb, userId);
  return resolveOwnerHubBadgeStoreAttentionFromHubStore(storesSb, hubStore, storeOrderChatUnread);
}

export function mergeOwnerHubBadgeUnreadAndStore(
  unread: OwnerHubBadgeUnreadPartial,
  store: OwnerHubBadgeStorePartial
): OwnerHubBadgeApiPayload {
  const { chatUnread, communityMessengerUnread, philifeChatUnread, socialChatUnread, storeOrderChatUnread } = unread;
  const { orderAttention, inquiryAttention } = store;
  let storeDeepLink = store.storeDeepLink;
  /** 배달 채팅 unread 는 `communityMessengerUnread`·`storeOrderChatUnread` 필드로만 — `total`·매장 탭 합산에 이중 포함하지 않음 */
  const storesTabAttention = Math.max(0, orderAttention) + Math.max(0, inquiryAttention);
  const total = socialChatUnread + storesTabAttention + Math.max(0, communityMessengerUnread);
  return {
    ok: true,
    total,
    chatUnread,
    communityMessengerUnread,
    philifeChatUnread,
    socialChatUnread,
    storeOrderChatUnread,
    orderAttention,
    inquiryAttention,
    storesTabAttention,
    storeDeepLink,
  };
}

/**
 * 메인 라우트·캐시 팩토리 — 기존 route 와 동일한 병렬도:
 * wave1: unread parts + store 목록, wave2: 메신저 unread, 이후 허브 카운트.
 */
export async function buildOwnerHubBadgePayloadMerged(
  sbAny: SupabaseClient<any>,
  storesSb: SupabaseClient<any> | null,
  userId: string
): Promise<OwnerHubBadgeApiPayload> {
  return (await buildOwnerHubBadgePayloadWithMeta(sbAny, storesSb, userId)).payload;
}

export type OwnerHubBadgeBuildOptions = {
  /** dev 측정(`findHubFresh=1`): find_hub process memory 만 무효화 — JSON·hub route TTL 불변 */
  findHubStoreFresh?: boolean;
  /** dev 측정(`unreadPartsFresh=1`): unread_parts process memory 만 무효화 */
  unreadPartsFresh?: boolean;
  /** dev 측정(`cmUnreadFresh=1`): cm_unread process memory 만 무효화 */
  cmUnreadFresh?: boolean;
  /** dev 측정(`storeOrderUnreadFresh=1`): store_order_unread process memory 만 무효화 */
  storeOrderUnreadFresh?: boolean;
  /** dev 측정(`storeAttentionFresh=1`): store_attention process memory 만 무효화 */
  storeAttentionFresh?: boolean;
};

/** 경량 배지 빌드 — head count·limit(1)·허브 매장 scoped 주문 채팅 unread (full aggregate 스캔 없음) */
export async function buildOwnerHubBadgePayloadWithMeta(
  sbAny: SupabaseClient<any>,
  storesSb: SupabaseClient<any> | null,
  userId: string,
  opts?: OwnerHubBadgeBuildOptions
): Promise<{ payload: OwnerHubBadgeApiPayload; meta: OwnerHubBadgeBuildMeta; breakdown: HubBadgeBreakdown }> {
  if (opts?.findHubStoreFresh) {
    invalidateOwnerHubStoreLookupCache(userId);
  }
  if (opts?.unreadPartsFresh) {
    invalidateHubBadgeUnreadPartsMemory(userId);
  }
  if (opts?.cmUnreadFresh) {
    invalidateCommunityMessengerUnreadTotalCache(userId);
  }
  if (opts?.storeOrderUnreadFresh) {
    invalidateHubStoreOrderUnreadMemory(userId);
  }
  if (opts?.storeAttentionFresh) {
    invalidateHubStoreAttentionMemory();
  }
  const build0 = devPerfNow();
  const meta: OwnerHubBadgeBuildMeta = {
    queryType: "owner_hub_badge_light",
    aggregateFallbackUsed: 0,
    aggregateRemovedSuccess: 1,
    existsQueryUsed: 1,
  };

  const findHubStoreTiming = emptyFindOwnerHubStoreTiming();
  let findHubStoreError = false;
  const wave1Start = devPerfNow();
  const cmUnreadTiming = emptyCmUnreadTiming();
  const storeOrderUnreadTiming = emptyStoreOrderUnreadTiming();
  let cmUnreadFallback = false;
  let storeOrderUnreadFallback = false;

  /**
   * wave1: find_hub_store 선행 → no_hub 이면 unread_parts·store_order 경로 RPC 생략(cm_unread만).
   * cm_unread 는 community_messenger_participants — unread_parts(philife/trade chat_rooms)와 소스 분리(이중 집계 없음).
   */
  const cmUnreadPromise = (async () => {
    try {
      return await sumCommunityMessengerParticipantUnread(sbAny, userId, cmUnreadTiming);
    } catch {
      cmUnreadFallback = true;
      cmUnreadTiming.cm_unread_via = "error";
      return 0;
    }
  })();

  let hubStore: HubStoreLiteRow | null = null;
  try {
    /** find_hub 선행(병렬 cm_unread 와 RTT 겹침) — no_hub 판정 후 unread_parts 만 생략 */
    hubStore = await findOwnerHubStore(storesSb, userId, findHubStoreTiming);
  } catch {
    findHubStoreError = true;
    findHubStoreTiming.find_hub_store_via = "error";
    hubStore = null;
  }

  const hasOwnerStoreEarly = hubStore != null;
  const noHubFastPath = !hasOwnerStoreEarly;

  let unreadParts: Awaited<ReturnType<typeof getCachedUserChatUnreadParts>>;
  let communityMessengerUnread: number;
  if (hasOwnerStoreEarly) {
    [unreadParts, communityMessengerUnread] = await Promise.all([
      getCachedUserChatUnreadParts(sbAny, userId),
      cmUnreadPromise,
    ]);
  } else {
    unreadParts = zeroUnreadPartsForNoHubStore();
    communityMessengerUnread = await cmUnreadPromise;
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- no-hub fast path verify
      console.info("[hub-badge-no-hub-fast-path]", {
        user_id_short: userId.slice(0, 8),
        find_hub_store_rows: findHubStoreTiming.find_hub_store_rows ?? 0,
        unread_parts_skipped: 1,
      });
    }
  }
  const queryWave1Ms = devPerfNow() - wave1Start;
  const unreadPartsMeta = peekLastUnreadPartsComputeMeta();
  const unreadPartsMs = Math.round(unreadPartsMeta?.total_ms ?? 0);
  const unreadPartsVia = unreadPartsMeta?.via;
  const findHubStoreMs = findHubStoreTiming.find_hub_store_ms;
  const cmUnreadMsEarly = cmUnreadTiming.cm_unread_ms;
  const wave1ParallelSlackMs = Math.max(
    0,
    Math.round(queryWave1Ms - Math.max(unreadPartsMs, findHubStoreMs, cmUnreadMsEarly))
  );
  const hasOwnerStore = hasOwnerStoreEarly;

  const storeAttentionPrefetchStartedAt =
    hasOwnerStore && storesSb && hubStore ? devPerfNow() : undefined;
  const storeAttentionCountsPromise =
    storeAttentionPrefetchStartedAt != null && hubStore
      ? getOwnerHubStoreAttentionCounts(storesSb!, hubStore.id)
      : null;

  const wave2Start = devPerfNow();
  const storeOrderChatUnread =
    hasOwnerStore && storesSb && hubStore
      ? await (async () => {
          try {
            return await countOwnerStoreOrderMessengerUnreadForHubStore(
              storesSb as SupabaseClient<any>,
              userId,
              hubStore.id,
              storeOrderUnreadTiming
            );
          } catch {
            storeOrderUnreadFallback = true;
            storeOrderUnreadTiming.store_order_unread_via = "error";
            return 0;
          }
        })()
      : await (async () => {
          storeOrderUnreadTiming.store_order_unread_via = "skipped_no_hub";
          return 0;
        })();
  const queryWave2Ms = devPerfNow() - wave2Start;
  const cmUnreadMs = cmUnreadTiming.cm_unread_ms;
  const storeOrderUnreadMs = storeOrderUnreadTiming.store_order_unread_ms;
  const wave2ParallelSlackMs = Math.max(
    0,
    Math.round(queryWave2Ms - Math.max(cmUnreadMs, storeOrderUnreadMs))
  );
  const wave2Worst =
    cmUnreadMs >= storeOrderUnreadMs ?
      { stage: "cm_unread" as const, ms: cmUnreadMs }
    : { stage: "store_order_unread" as const, ms: storeOrderUnreadMs };

  const unread: OwnerHubBadgeUnreadPartial = {
    chatUnread: sumTradeChatUnread(unreadParts),
    communityMessengerUnread: Math.max(0, communityMessengerUnread),
    philifeChatUnread: Math.max(0, unreadParts.communityParticipantUnread),
    socialChatUnread: sumSocialChatUnread(unreadParts),
    storeOrderChatUnread: Math.max(0, storeOrderChatUnread),
  };

  const attentionTiming: OwnerHubBadgeStoreAttentionTiming = {
    refund_pending_ms: 0,
    order_pending_ms: 0,
    inquiry_pending_ms: 0,
    store_attention_total_ms: 0,
  };
  const wave3Start = devPerfNow();
  const store = hasOwnerStore
    ? await resolveOwnerHubBadgeStoreAttentionFromHubStore(
        storesSb,
        hubStore,
        unread.storeOrderChatUnread,
        attentionTiming,
        storeAttentionCountsPromise,
        storeAttentionPrefetchStartedAt
      )
    : { orderAttention: 0, inquiryAttention: 0, storeDeepLink: null };
  const queryWave3Ms = devPerfNow() - wave3Start;

  const merge0 = devPerfNow();
  const payload = mergeOwnerHubBadgeUnreadAndStore(unread, store);
  const payloadBuildMs = devPerfNow() - merge0;
  const payloadBuildTotalMs = devPerfNow() - build0;

  const wave1WorstMs = Math.max(unreadPartsMs, findHubStoreMs, cmUnreadMsEarly);
  const wave1Worst =
    wave1WorstMs === unreadPartsMs
      ? { stage: "unread_parts" as const, ms: unreadPartsMs }
      : wave1WorstMs === findHubStoreMs
        ? { stage: "find_hub_store" as const, ms: findHubStoreMs }
        : { stage: "cm_unread" as const, ms: cmUnreadMsEarly };

  const { worst_stage, worst_stage_ms } = pickWorstStage([
    { stage: "unread_parts", ms: unreadPartsMs },
    { stage: "find_hub_store", ms: findHubStoreMs },
    { stage: "cm_unread", ms: cmUnreadMs },
    { stage: "store_order_unread", ms: storeOrderUnreadMs },
    { stage: "store_attention", ms: attentionTiming.store_attention_total_ms },
    { stage: "refund_pending", ms: attentionTiming.refund_pending_ms },
    { stage: "order_pending", ms: attentionTiming.order_pending_ms },
    { stage: "inquiry_pending", ms: attentionTiming.inquiry_pending_ms },
    { stage: "query_wave_1", ms: queryWave1Ms },
    { stage: "query_wave_2", ms: queryWave2Ms },
    { stage: "query_wave_3", ms: queryWave3Ms },
  ]);

  const breakdown: HubBadgeBreakdown = {
    total_ms: Math.round(payloadBuildTotalMs),
    find_hub_store_ms: Math.round(findHubStoreMs),
    unread_parts_ms: unreadPartsMs,
    ...(unreadPartsVia ? { unread_parts_via: unreadPartsVia } : {}),
    ...(noHubFastPath ? { no_hub_fast_path: 1 as const } : {}),
    ...(unreadPartsMeta?.unread_memory_hit != null
      ? { unread_memory_hit: unreadPartsMeta.unread_memory_hit }
      : {}),
    ...(unreadPartsMeta?.unread_memory_age_ms != null
      ? { unread_memory_age_ms: unreadPartsMeta.unread_memory_age_ms }
      : {}),
    ...(unreadPartsMeta?.unread_counter_hit != null
      ? { unread_counter_hit: unreadPartsMeta.unread_counter_hit }
      : {}),
    ...(unreadPartsMeta?.unread_counter_age_ms != null
      ? { unread_counter_age_ms: unreadPartsMeta.unread_counter_age_ms }
      : {}),
    ...(unreadPartsMeta?.unread_counter_refresh_ms != null
      ? { unread_counter_refresh_ms: unreadPartsMeta.unread_counter_refresh_ms }
      : {}),
    ...(unreadPartsMeta?.unread_parts_rpc_ms != null
      ? { unread_parts_rpc_ms: unreadPartsMeta.unread_parts_rpc_ms }
      : {}),
    find_hub_store_via: findHubStoreTiming.find_hub_store_via,
    find_hub_store_query_ms: findHubStoreTiming.find_hub_store_query_ms,
    find_hub_store_permission_join_ms: findHubStoreTiming.find_hub_store_permission_join_ms,
    find_hub_store_rows: findHubStoreTiming.find_hub_store_rows,
    ...(findHubStoreTiming.find_hub_store_cache_hit != null
      ? { find_hub_store_cache_hit: findHubStoreTiming.find_hub_store_cache_hit }
      : {}),
    ...(findHubStoreTiming.find_hub_store_cache_age_ms != null
      ? { find_hub_store_cache_age_ms: findHubStoreTiming.find_hub_store_cache_age_ms }
      : {}),
    query_wave_1_parallel_slack_ms: wave1ParallelSlackMs,
    cm_unread_ms: Math.round(cmUnreadMs),
    cm_unread_via: cmUnreadTiming.cm_unread_via,
    cm_unread_rows: cmUnreadTiming.cm_unread_rows,
    cm_unread_query_ms: cmUnreadTiming.cm_unread_query_ms,
    ...(cmUnreadTiming.cm_unread_rpc_ms != null
      ? { cm_unread_rpc_ms: cmUnreadTiming.cm_unread_rpc_ms }
      : {}),
    ...(cmUnreadTiming.cm_unread_legacy_ms != null
      ? { cm_unread_legacy_ms: cmUnreadTiming.cm_unread_legacy_ms }
      : {}),
    ...(cmUnreadTiming.cm_unread_memory_hit != null
      ? { cm_unread_memory_hit: cmUnreadTiming.cm_unread_memory_hit }
      : {}),
    ...(cmUnreadTiming.cm_unread_memory_age_ms != null
      ? { cm_unread_memory_age_ms: cmUnreadTiming.cm_unread_memory_age_ms }
      : {}),
    store_order_unread_ms: Math.round(storeOrderUnreadMs),
    store_order_unread_via: storeOrderUnreadTiming.store_order_unread_via,
    store_order_unread_rows: storeOrderUnreadTiming.store_order_unread_rows,
    store_order_unread_query_ms: storeOrderUnreadTiming.store_order_unread_query_ms,
    ...(storeOrderUnreadTiming.store_order_unread_memory_hit != null
      ? { store_order_unread_memory_hit: storeOrderUnreadTiming.store_order_unread_memory_hit }
      : {}),
    ...(storeOrderUnreadTiming.store_order_unread_memory_age_ms != null
      ? { store_order_unread_memory_age_ms: storeOrderUnreadTiming.store_order_unread_memory_age_ms }
      : {}),
    query_wave_2_parallel_slack_ms: wave2ParallelSlackMs,
    store_attention_total_ms: attentionTiming.store_attention_total_ms,
    refund_pending_ms: attentionTiming.refund_pending_ms,
    order_pending_ms: attentionTiming.order_pending_ms,
    inquiry_pending_ms: attentionTiming.inquiry_pending_ms,
    ...(attentionTiming.store_attention_via
      ? { store_attention_via: attentionTiming.store_attention_via }
      : {}),
    ...(attentionTiming.store_attention_rpc_ms != null
      ? { store_attention_rpc_ms: attentionTiming.store_attention_rpc_ms }
      : {}),
    ...(attentionTiming.store_attention_legacy_ms != null
      ? { store_attention_legacy_ms: attentionTiming.store_attention_legacy_ms }
      : {}),
    ...(attentionTiming.store_attention_memory_hit != null
      ? { store_attention_memory_hit: attentionTiming.store_attention_memory_hit }
      : {}),
    ...(attentionTiming.store_attention_memory_age_ms != null
      ? { store_attention_memory_age_ms: attentionTiming.store_attention_memory_age_ms }
      : {}),
    payload_build_ms: Math.round(payloadBuildMs),
    cache_hit: 0,
    cache_hit_reason: "hub_badge_build_cold",
    has_hub_store: hasOwnerStore ? 1 : 0,
    store_id_short: storeIdShort(hubStore?.id),
    query_wave_1_ms: Math.round(queryWave1Ms),
    query_wave_2_ms: Math.round(queryWave2Ms),
    query_wave_3_ms: Math.round(queryWave3Ms),
    worst_stage,
    worst_stage_ms,
    ...(cmUnreadFallback ? { cm_unread_fallback: 1 as const } : {}),
    ...(storeOrderUnreadFallback ? { store_order_unread_fallback: 1 as const } : {}),
    ...(findHubStoreError ? { find_hub_store_error: 1 as const } : {}),
    ...hubBadgeBreakdownForUser(userId),
  };
  logHubBadgeBreakdown(breakdown);

  logHubBadgeWave2Perf({
    query_wave_2_ms: Math.round(queryWave2Ms),
    cm_unread_ms: cmUnreadMs,
    cm_unread_via: cmUnreadTiming.cm_unread_via,
    cm_unread_rows: cmUnreadTiming.cm_unread_rows,
    cm_unread_query_ms: cmUnreadTiming.cm_unread_query_ms,
    cm_unread_rpc_ms: cmUnreadTiming.cm_unread_rpc_ms ?? 0,
    cm_unread_legacy_ms: cmUnreadTiming.cm_unread_legacy_ms ?? 0,
    ...(cmUnreadTiming.cm_unread_memory_hit != null
      ? { cm_unread_memory_hit: cmUnreadTiming.cm_unread_memory_hit }
      : {}),
    ...(cmUnreadTiming.cm_unread_memory_age_ms != null
      ? { cm_unread_memory_age_ms: cmUnreadTiming.cm_unread_memory_age_ms }
      : {}),
    cm_select: CM_UNREAD_HUB_SELECT,
    cm_filters: CM_UNREAD_HUB_FILTERS,
    store_order_unread_ms: storeOrderUnreadMs,
    store_order_unread_via: storeOrderUnreadTiming.store_order_unread_via,
    store_order_unread_rows: storeOrderUnreadTiming.store_order_unread_rows,
    store_order_unread_query_ms: storeOrderUnreadTiming.store_order_unread_query_ms,
    ...(storeOrderUnreadTiming.store_order_unread_memory_hit != null
      ? { store_order_unread_memory_hit: storeOrderUnreadTiming.store_order_unread_memory_hit }
      : {}),
    ...(storeOrderUnreadTiming.store_order_unread_memory_age_ms != null
      ? { store_order_unread_memory_age_ms: storeOrderUnreadTiming.store_order_unread_memory_age_ms }
      : {}),
    store_order_orders_ms: storeOrderUnreadTiming.store_order_unread_orders_ms,
    store_order_parts_ms: storeOrderUnreadTiming.store_order_unread_parts_ms,
    store_order_parts_rows: storeOrderUnreadTiming.store_order_unread_parts_rows,
    orders_select: STORE_ORDER_UNREAD_HUB_ORDERS_SELECT,
    orders_filters: STORE_ORDER_UNREAD_HUB_ORDERS_FILTERS,
    parts_select: STORE_ORDER_UNREAD_HUB_PARTS_SELECT,
    parts_filters: STORE_ORDER_UNREAD_HUB_PARTS_FILTERS,
    query_wave_2_parallel_slack_ms: wave2ParallelSlackMs,
    wave2_worst: wave2Worst.stage,
    wave2_worst_ms: wave2Worst.ms,
    worst_stage,
    worst_stage_ms,
  });

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- wave1 cold breakdown
    console.info("[hub-badge-wave1]", {
      query_wave_1_ms: breakdown.query_wave_1_ms,
      unread_parts_ms: unreadPartsMs,
      unread_parts_via: unreadPartsVia,
      find_hub_store_ms: findHubStoreMs,
      find_hub_store_via: findHubStoreTiming.find_hub_store_via,
      find_hub_store_rows: findHubStoreTiming.find_hub_store_rows,
      query_wave_1_parallel_slack_ms: wave1ParallelSlackMs,
      wave1_worst: wave1Worst.stage,
      wave1_worst_ms: wave1Worst.ms,
    });
  }

  return { payload, meta, breakdown };
}
