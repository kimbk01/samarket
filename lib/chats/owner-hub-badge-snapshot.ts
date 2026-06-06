/**
 * Owner hub badge snapshot — read-only assembly (counter row → unified RPC fallback).
 * Route must not multi-wave aggregate when snapshot path succeeds (1 RTT max cold).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HUB_BADGE_UNREAD_COUNTERS_TABLE,
  hubBadgeUnreadCounterTtlMs,
  userChatUnreadPartsFromCounterRow,
} from "@/lib/chat/hub-badge-unread-counter";
import {
  zeroUnreadPartsForNoHubStore,
  type UserChatUnreadParts,
} from "@/lib/chat/user-chat-unread-parts";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { ORDER_CHAT_MESSENGER_LIST_HREF } from "@/lib/chats/surfaces/order-chat-surface";
import {
  hubBadgeBreakdownForUser,
  logHubBadgeBreakdown,
  logHubBadgeCacheAnalysis,
  pickWorstStage,
  storeIdShort,
  type HubBadgeBreakdown,
  type HubBadgeCacheAnalysis,
} from "@/lib/chats/hub-badge-breakdown";
import { evaluateHubBadgeRegressionGuards } from "@/lib/chats/hub-badge-regression-guard";
import {
  logHubBadgeDeepBreakdown,
  measureJsonUtf8Bytes,
  scheduleHubBadgeCounterExplainIfEnabled,
  type HubBadgeDeepBreakdown,
  type HubBadgeDeepBreakdownPath,
} from "@/lib/chats/hub-badge-deep-breakdown";
import { scheduleOwnerHubBadgeSnapshotRefresh } from "@/lib/chats/hub-badge-snapshot-refresh";
import { writeOwnerHubStoreLookupMemory } from "@/lib/chats/owner-hub-store-lookup-cache";
import type {
  OwnerHubBadgeApiPayload,
  OwnerHubBadgeBuildMeta,
} from "@/lib/chats/build-owner-hub-badge-payload";
import {
  mergeOwnerHubBadgeUnreadAndStore,
} from "@/lib/chats/build-owner-hub-badge-payload";
import {
  countNotificationTargetsHubBundle,
} from "@/lib/notifications/notification-targets";
import {
  ownerHubUnreadPartialFromTargetBundle,
} from "@/lib/chats/build-owner-hub-badge-from-targets";
import { writeCmUnreadRoomCountMemory } from "@/lib/community-messenger/cm-unread-room-count-memory-cache";
import { writeHubStoreOrderUnreadMemory } from "@/lib/community-messenger/hub-store-order-unread-memory-cache";
import { writeHubStoreAttentionMemory } from "@/lib/stores/hub-store-attention-memory-cache";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export const OWNER_HUB_BADGE_SNAPSHOT_RPC = "get_owner_hub_badge_snapshot";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "owner-hub-badge-snapshot:";

export type OwnerHubBadgeSnapshotRow = {
  has_hub_store: boolean;
  hub_store_id: string | null;
  hub_store_slug: string | null;
  store_order_participant_unread: number;
  item_trade_participant_unread: number;
  community_participant_unread: number;
  product_chat_unread_deduped: number;
  community_messenger_unread_room_count: number;
  store_order_chat_unread: number;
  refund_pending_count: number;
  order_pending_count: number;
  inquiry_pending_count: number;
  updated_at: string;
};

type SnapshotReadVia = "counter_row" | "unified_rpc";

function parseSnapshotRpcData(data: unknown): Omit<OwnerHubBadgeSnapshotRow, "updated_at"> | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const hubId = typeof d.hub_store_id === "string" ? d.hub_store_id.trim() : null;
  return {
    has_hub_store: Boolean(d.has_hub_store),
    hub_store_id: hubId || null,
    hub_store_slug: typeof d.hub_store_slug === "string" ? d.hub_store_slug : null,
    store_order_participant_unread: Math.max(
      0,
      Math.floor(Number(d.store_order_participant_unread) || 0)
    ),
    item_trade_participant_unread: Math.max(
      0,
      Math.floor(Number(d.item_trade_participant_unread) || 0)
    ),
    community_participant_unread: Math.max(
      0,
      Math.floor(Number(d.community_participant_unread) || 0)
    ),
    product_chat_unread_deduped: Math.max(
      0,
      Math.floor(Number(d.product_chat_unread_deduped) || 0)
    ),
    community_messenger_unread_room_count: Math.max(
      0,
      Math.floor(Number(d.community_messenger_unread_room_count) || 0)
    ),
    store_order_chat_unread: Math.max(0, Math.floor(Number(d.store_order_chat_unread) || 0)),
    refund_pending_count: Math.max(0, Math.floor(Number(d.refund_pending_count) || 0)),
    order_pending_count: Math.max(0, Math.floor(Number(d.order_pending_count) || 0)),
    inquiry_pending_count: Math.max(0, Math.floor(Number(d.inquiry_pending_count) || 0)),
  };
}

function counterSelectFields(): string {
  return [
    "user_id",
    "store_order_participant_unread",
    "item_trade_participant_unread",
    "community_participant_unread",
    "product_chat_unread_deduped",
    "community_messenger_unread_room_count",
    "has_hub_store",
    "hub_store_id",
    "hub_store_slug",
    "store_order_chat_unread",
    "refund_pending_count",
    "order_pending_count",
    "inquiry_pending_count",
    "updated_at",
  ].join(",");
}

function rowFromDb(data: Record<string, unknown>): OwnerHubBadgeSnapshotRow | null {
  if (!data.updated_at || typeof data.updated_at !== "string") return null;
  const hubId =
    typeof data.hub_store_id === "string" && data.hub_store_id.trim()
      ? data.hub_store_id.trim()
      : null;
  return {
    has_hub_store: Boolean(data.has_hub_store),
    hub_store_id: hubId,
    hub_store_slug: typeof data.hub_store_slug === "string" ? data.hub_store_slug : null,
    store_order_participant_unread: Math.max(
      0,
      Math.floor(Number(data.store_order_participant_unread) || 0)
    ),
    item_trade_participant_unread: Math.max(
      0,
      Math.floor(Number(data.item_trade_participant_unread) || 0)
    ),
    community_participant_unread: Math.max(
      0,
      Math.floor(Number(data.community_participant_unread) || 0)
    ),
    product_chat_unread_deduped: Math.max(
      0,
      Math.floor(Number(data.product_chat_unread_deduped) || 0)
    ),
    community_messenger_unread_room_count: Math.max(
      0,
      Math.floor(Number(data.community_messenger_unread_room_count) || 0)
    ),
    store_order_chat_unread: Math.max(0, Math.floor(Number(data.store_order_chat_unread) || 0)),
    refund_pending_count: Math.max(0, Math.floor(Number(data.refund_pending_count) || 0)),
    order_pending_count: Math.max(0, Math.floor(Number(data.order_pending_count) || 0)),
    inquiry_pending_count: Math.max(0, Math.floor(Number(data.inquiry_pending_count) || 0)),
    updated_at: data.updated_at,
  };
}

type SnapshotCounterReadTiming = {
  db_fetch_ms: number;
  snapshot_deserialize_ms: number;
  query_row_bytes: number;
};

export async function readOwnerHubBadgeSnapshotCounter(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<
  | { hit: false; reason: "missing" | "stale" | "no_column" | "error"; timing: SnapshotCounterReadTiming }
  | {
      hit: true;
      row: OwnerHubBadgeSnapshotRow;
      ageMs: number;
      stale: boolean;
      raw: Record<string, unknown> | null;
      timing: SnapshotCounterReadTiming;
    }
> {
  const uid = userId.trim();
  const db0 = devPerfNow();
  const { data, error } = await sbAny
    .from(HUB_BADGE_UNREAD_COUNTERS_TABLE)
    .select(counterSelectFields())
    .eq("user_id", uid)
    .maybeSingle();
  const db_fetch_ms = Math.round(devPerfNow() - db0);

  const query_row_bytes = measureJsonUtf8Bytes(data);
  let snapshot_deserialize_ms = 0;

  if (error) {
    const msg = error.message ?? "";
    const timing: SnapshotCounterReadTiming = {
      db_fetch_ms,
      snapshot_deserialize_ms: 0,
      query_row_bytes,
    };
    if (
      msg.includes("has_hub_store") ||
      msg.includes("hub_store_id") ||
      msg.includes("store_order_chat_unread") ||
      error.code === "42703"
    ) {
      return { hit: false, reason: "no_column", timing };
    }
    if (msg.includes("does not exist") || error.code === "42P01") {
      return { hit: false, reason: "missing", timing };
    }
    return { hit: false, reason: "error", timing };
  }

  const des0 = devPerfNow();
  const row = data ? rowFromDb(data as unknown as Record<string, unknown>) : null;
  snapshot_deserialize_ms = Math.round(devPerfNow() - des0);
  const timing: SnapshotCounterReadTiming = {
    db_fetch_ms,
    snapshot_deserialize_ms,
    query_row_bytes,
  };

  if (!row) return { hit: false, reason: "missing", timing };

  const ageMs = Math.max(0, Date.now() - new Date(row.updated_at).getTime());
  const stale = ageMs > hubBadgeUnreadCounterTtlMs();
  return {
    hit: true,
    row,
    ageMs,
    stale,
    raw: data ? (data as unknown as Record<string, unknown>) : null,
    timing,
  };
}

export async function upsertOwnerHubBadgeSnapshotCounter(
  sbAny: SupabaseClient<any>,
  userId: string,
  snapshot: Omit<OwnerHubBadgeSnapshotRow, "updated_at">
): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  const now = new Date().toISOString();
  const { error } = await sbAny.from(HUB_BADGE_UNREAD_COUNTERS_TABLE).upsert(
    {
      user_id: uid,
      store_order_participant_unread: snapshot.store_order_participant_unread,
      item_trade_participant_unread: snapshot.item_trade_participant_unread,
      community_participant_unread: snapshot.community_participant_unread,
      product_chat_unread_deduped: snapshot.product_chat_unread_deduped,
      community_messenger_unread_room_count: snapshot.community_messenger_unread_room_count,
      has_hub_store: snapshot.has_hub_store,
      hub_store_id: snapshot.hub_store_id,
      hub_store_slug: snapshot.hub_store_slug,
      store_order_chat_unread: snapshot.store_order_chat_unread,
      refund_pending_count: snapshot.refund_pending_count,
      order_pending_count: snapshot.order_pending_count,
      inquiry_pending_count: snapshot.inquiry_pending_count,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  if (error && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot upsert probe
    console.warn("[owner-hub-badge-snapshot-upsert]", error.message);
  }
}

export async function fetchOwnerHubBadgeSnapshotViaRpc(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<{ snapshot: Omit<OwnerHubBadgeSnapshotRow, "updated_at"> | null; rpcMs: number }> {
  const rpc0 = devPerfNow();
  const { data, error } = await sbAny.rpc(OWNER_HUB_BADGE_SNAPSHOT_RPC, {
    p_user_id: userId.trim(),
  });
  const rpcMs = devPerfNow() - rpc0;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- unified RPC deploy probe
      console.warn("[owner-hub-badge-snapshot-rpc-miss]", error.message);
    }
    return { snapshot: null, rpcMs };
  }
  return { snapshot: parseSnapshotRpcData(data), rpcMs };
}

export async function refreshOwnerHubBadgeSnapshotFromRpc(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<OwnerHubBadgeSnapshotRow | null> {
  const { snapshot } = await fetchOwnerHubBadgeSnapshotViaRpc(sbAny, userId);
  if (!snapshot) return null;
  await upsertOwnerHubBadgeSnapshotCounter(sbAny, userId, snapshot);
  syncProcessMemoryLayersFromSnapshot(userId, snapshot);
  return { ...snapshot, updated_at: new Date().toISOString() };
}

/** Counter / RPC snapshot → process memory layers (read path warm without extra RTT). */
export function syncProcessMemoryLayersFromSnapshot(
  userId: string,
  snapshot: Omit<OwnerHubBadgeSnapshotRow, "updated_at">
): void {
  const uid = userId.trim();
  if (!uid) return;
  writeCmUnreadRoomCountMemory(uid, snapshot.community_messenger_unread_room_count);
  if (snapshot.has_hub_store && snapshot.hub_store_id) {
    writeOwnerHubStoreLookupMemory(uid, {
      id: snapshot.hub_store_id,
      slug: snapshot.hub_store_slug,
      allowed_to_sell: true,
      sales_status: "approved",
    });
    writeHubStoreOrderUnreadMemory(uid, snapshot.hub_store_id, snapshot.store_order_chat_unread);
    writeHubStoreAttentionMemory(snapshot.hub_store_id, {
      refundPendingCount: snapshot.refund_pending_count,
      orderPendingCount: snapshot.order_pending_count,
      inquiryPendingCount: snapshot.inquiry_pending_count,
    });
  } else {
    writeOwnerHubStoreLookupMemory(uid, null);
  }
}

function unreadPartsFromSnapshot(snapshot: OwnerHubBadgeSnapshotRow): UserChatUnreadParts {
  if (!snapshot.has_hub_store) return zeroUnreadPartsForNoHubStore();
  return userChatUnreadPartsFromCounterRow({
    user_id: "",
    store_order_participant_unread: snapshot.store_order_participant_unread,
    item_trade_participant_unread: snapshot.item_trade_participant_unread,
    community_participant_unread: snapshot.community_participant_unread,
    product_chat_unread_deduped: snapshot.product_chat_unread_deduped,
    updated_at: snapshot.updated_at,
  });
}

function payloadFromSnapshot(
  snapshot: OwnerHubBadgeSnapshotRow,
  bundle: import("@/lib/notifications/notification-targets").NotificationTargetHubBundle
): OwnerHubBadgeApiPayload {
  const unread = ownerHubUnreadPartialFromTargetBundle(bundle);
  const orderAttention = snapshot.refund_pending_count + snapshot.order_pending_count;
  const inquiryAttention = snapshot.inquiry_pending_count;
  const ownerReviewAttention = Math.max(0, bundle.fab_owner_store - inquiryAttention);
  let storeDeepLink: string | null = null;
  if (snapshot.has_hub_store && snapshot.hub_store_id) {
    if (inquiryAttention > 0) {
      storeDeepLink = `/stores/owner/inquiries?storeId=${encodeURIComponent(snapshot.hub_store_id)}`;
    } else if (orderAttention > 0) {
      storeDeepLink = buildStoreOrdersHref({ storeId: snapshot.hub_store_id });
    } else if (unread.storeOrderChatUnread > 0) {
      storeDeepLink = ORDER_CHAT_MESSENGER_LIST_HREF;
    }
  }
  return mergeOwnerHubBadgeUnreadAndStore(unread, {
    orderAttention: Math.max(orderAttention, bundle.fab_owner_orders),
    inquiryAttention,
    ownerReviewAttention,
    buyerOrderAttention: Math.max(0, bundle.bottom_nav_delivery),
    storeDeepLink,
  });
}

function participantUnreadTotal(snapshot: OwnerHubBadgeSnapshotRow): number {
  return (
    snapshot.store_order_participant_unread +
    snapshot.item_trade_participant_unread +
    snapshot.community_participant_unread +
    snapshot.product_chat_unread_deduped
  );
}

function buildAndLogSnapshotDeepBreakdown(input: {
  path: HubBadgeDeepBreakdownPath;
  snapshot: OwnerHubBadgeSnapshotRow;
  timing: SnapshotCounterReadTiming;
  participant_merge_ms: number;
  payload_build_ms: number;
  aggregate_compute_ms: number;
  memory_snapshot_hit: 0 | 1;
  stale?: boolean;
  aggregate_inside_rpc?: 0 | 1;
  userId?: string;
}): HubBadgeDeepBreakdown {
  const snapshot_json_bytes = measureJsonUtf8Bytes(input.snapshot);
  const deep: HubBadgeDeepBreakdown = {
    path: input.path,
    db_fetch_ms: input.timing.db_fetch_ms,
    snapshot_deserialize_ms: input.timing.snapshot_deserialize_ms,
    aggregate_compute_ms: Math.round(input.aggregate_compute_ms),
    participant_merge_ms: Math.round(input.participant_merge_ms),
    payload_build_ms: Math.round(input.payload_build_ms),
    json_serialize_ms: 0,
    transport_ms: 0,
    cache_lookup_ms: 0,
    cache_store_ms: 0,
    memory_snapshot_hit: input.memory_snapshot_hit,
    query_row_bytes: input.timing.query_row_bytes,
    response_bytes: 0,
    snapshot_json_bytes,
    cm_unread_room_count: input.snapshot.community_messenger_unread_room_count,
    participant_unread_total: participantUnreadTotal(input.snapshot),
    ...(input.aggregate_inside_rpc ? { aggregate_inside_rpc: input.aggregate_inside_rpc } : {}),
    ...(input.stale ? { stale: 1 as const } : {}),
  };
  logHubBadgeDeepBreakdown(deep);
  if (input.userId && input.path.startsWith("counter_row")) {
    scheduleHubBadgeCounterExplainIfEnabled(input.userId);
  }
  return deep;
}

function buildSnapshotBreakdown(input: {
  userId: string;
  totalMs: number;
  readMs: number;
  via: SnapshotReadVia;
  snapshot: OwnerHubBadgeSnapshotRow;
  rpcMs?: number;
  stale?: boolean;
}): HubBadgeBreakdown {
  const { snapshot, via, totalMs, readMs, rpcMs = 0, stale } = input;
  const snapshotMs = Math.round(via === "counter_row" ? readMs : rpcMs || readMs);
  const breakdown: HubBadgeBreakdown = {
    total_ms: Math.round(totalMs),
    find_hub_store_ms: 0,
    unread_parts_ms: 0,
    cm_unread_ms: snapshotMs,
    cm_unread_via: via === "counter_row" ? "aggregate" : "rpc",
    cm_unread_rows: snapshot.community_messenger_unread_room_count,
    cm_unread_query_ms: snapshotMs,
    cm_unread_rpc_ms: via === "unified_rpc" ? snapshotMs : 0,
    cm_unread_memory_hit: via === "counter_row" ? 1 : 0,
    store_order_unread_ms: 0,
    store_order_unread_via: snapshot.has_hub_store ? "memory" : "skipped_no_hub",
    store_attention_total_ms: 0,
    store_attention_via: "memory",
    store_attention_memory_hit: 1,
    refund_pending_ms: 0,
    order_pending_ms: 0,
    inquiry_pending_ms: 0,
    payload_build_ms: 0,
    cache_hit: 0,
    cache_hit_reason: via === "counter_row" ? "owner_hub_badge_snapshot_row" : "owner_hub_badge_unified_rpc",
    has_hub_store: snapshot.has_hub_store ? 1 : 0,
    store_id_short: storeIdShort(snapshot.hub_store_id),
    query_wave_1_ms: snapshotMs,
    query_wave_2_ms: 0,
    query_wave_3_ms: 0,
    query_wave_1_parallel_slack_ms: 0,
    query_wave_2_parallel_slack_ms: 0,
    find_hub_store_via: "memory",
    find_hub_store_cache_hit: 1,
    ...(snapshot.has_hub_store ? {} : { no_hub_fast_path: 1 as const }),
    worst_stage: via === "counter_row" ? "owner_hub_badge_snapshot_row" : "owner_hub_badge_unified_rpc",
    worst_stage_ms: snapshotMs,
    hub_store_memory_hit: 1,
    unread_snapshot_hit: 1,
    order_roomids_hit: 0,
    transport_saved_ms: via === "counter_row" ? snapshotMs : 0,
    rpc_removed: via === "counter_row" ? 1 : 0,
    wave_parallelized: 1,
    ...hubBadgeBreakdownForUser(input.userId),
  };
  const { worst_stage, worst_stage_ms } = pickWorstStage([
    { stage: breakdown.worst_stage, ms: breakdown.worst_stage_ms },
    { stage: "payload_build", ms: breakdown.payload_build_ms },
  ]);
  breakdown.worst_stage = worst_stage;
  breakdown.worst_stage_ms = worst_stage_ms;

  if (stale) {
    evaluateHubBadgeRegressionGuards({
      breakdown,
      dbRoundTrips: 1,
      snapshotVia: via === "counter_row" ? "counter_row" : "unified_rpc",
      staleSnapshot: true,
      snapshotMissReason: "counter_row_stale_swr",
    });
  }

  return breakdown;
}

export type SnapshotBuildResult = {
  payload: OwnerHubBadgeApiPayload;
  meta: OwnerHubBadgeBuildMeta;
  breakdown: HubBadgeBreakdown;
};

/** Snapshot-first build — null = unified RPC unavailable, caller may legacy fallback. */
export async function tryBuildOwnerHubBadgeFromSnapshot(
  sbAny: SupabaseClient<any>,
  userId: string,
  opts?: { forceRpc?: boolean }
): Promise<SnapshotBuildResult | null> {
  const uid = userId.trim();
  if (!uid) return null;

  return runSingleFlight(`${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${uid}`, async () => {
    const build0 = devPerfNow();
    const meta: OwnerHubBadgeBuildMeta = {
      queryType: "owner_hub_badge_light",
      aggregateFallbackUsed: 0,
      aggregateRemovedSuccess: 1,
      existsQueryUsed: opts?.forceRpc ? 1 : 0,
    };

    if (!opts?.forceRpc) {
      const counter = await readOwnerHubBadgeSnapshotCounter(sbAny, uid);
      const readMs = counter.timing.db_fetch_ms;

      if (counter.hit && !counter.stale) {
        const merge0 = devPerfNow();
        syncProcessMemoryLayersFromSnapshot(uid, counter.row);
        const participant_merge_ms = devPerfNow() - merge0;
        const payload0 = devPerfNow();
        const targetBundle = await countNotificationTargetsHubBundle(
          sbAny,
          uid,
          counter.row.hub_store_id
        );
        const payload = payloadFromSnapshot(counter.row, targetBundle);
        const payload_build_ms = devPerfNow() - payload0;
        const breakdown = buildSnapshotBreakdown({
          userId: uid,
          totalMs: devPerfNow() - build0,
          readMs,
          via: "counter_row",
          snapshot: counter.row,
        });
        breakdown.payload_build_ms = Math.round(payload_build_ms);
        logHubBadgeBreakdown(breakdown);
        buildAndLogSnapshotDeepBreakdown({
          path: "counter_row",
          snapshot: counter.row,
          timing: counter.timing,
          participant_merge_ms,
          payload_build_ms,
          aggregate_compute_ms: 0,
          memory_snapshot_hit: 1,
          userId: uid,
        });
        logHubBadgeCacheAnalysis({
          hub_store_memory_hit: 1,
          unread_snapshot_hit: 1,
          order_roomids_hit: 0,
          transport_saved_ms: Math.round(readMs),
          rpc_removed: 1,
          wave_parallelized: 1,
        });
        evaluateHubBadgeRegressionGuards({
          breakdown,
          dbRoundTrips: 2,
          snapshotVia: "counter_row",
        });
        return { payload, meta: { ...meta, existsQueryUsed: 0 }, breakdown };
      }

      if (counter.hit && counter.stale) {
        scheduleOwnerHubBadgeSnapshotRefresh(uid);
        const merge0 = devPerfNow();
        syncProcessMemoryLayersFromSnapshot(uid, counter.row);
        const participant_merge_ms = devPerfNow() - merge0;
        const payload0 = devPerfNow();
        const targetBundle = await countNotificationTargetsHubBundle(
          sbAny,
          uid,
          counter.row.hub_store_id
        );
        const payload = payloadFromSnapshot(counter.row, targetBundle);
        const payload_build_ms = devPerfNow() - payload0;
        const breakdown = buildSnapshotBreakdown({
          userId: uid,
          totalMs: devPerfNow() - build0,
          readMs,
          via: "counter_row",
          snapshot: counter.row,
          stale: true,
        });
        breakdown.payload_build_ms = Math.round(payload_build_ms);
        logHubBadgeBreakdown(breakdown);
        buildAndLogSnapshotDeepBreakdown({
          path: "counter_row_stale_swr",
          snapshot: counter.row,
          timing: counter.timing,
          participant_merge_ms,
          payload_build_ms,
          aggregate_compute_ms: 0,
          memory_snapshot_hit: 1,
          stale: true,
          userId: uid,
        });
        return { payload, meta: { ...meta, existsQueryUsed: 0 }, breakdown };
      }
    }

    const rpc0 = devPerfNow();
    const { snapshot, rpcMs } = await fetchOwnerHubBadgeSnapshotViaRpc(sbAny, uid);
    const rpcWallMs = Math.round(devPerfNow() - rpc0);
    if (!snapshot) return null;

    void upsertOwnerHubBadgeSnapshotCounter(sbAny, uid, snapshot);
    const merge0 = devPerfNow();
    syncProcessMemoryLayersFromSnapshot(uid, snapshot);
    const participant_merge_ms = devPerfNow() - merge0;
    const fullRow: OwnerHubBadgeSnapshotRow = {
      ...snapshot,
      updated_at: new Date().toISOString(),
    };
    const payload0 = devPerfNow();
    const targetBundle = await countNotificationTargetsHubBundle(sbAny, uid, fullRow.hub_store_id);
    const payload = payloadFromSnapshot(fullRow, targetBundle);
    const payload_build_ms = devPerfNow() - payload0;
    const rpcTiming: SnapshotCounterReadTiming = {
      db_fetch_ms: Math.round(rpcMs || rpcWallMs),
      snapshot_deserialize_ms: 0,
      query_row_bytes: measureJsonUtf8Bytes(snapshot),
    };
    const breakdown = buildSnapshotBreakdown({
      userId: uid,
      totalMs: devPerfNow() - build0,
      readMs: rpcMs,
      via: "unified_rpc",
      snapshot: fullRow,
      rpcMs,
    });
    breakdown.payload_build_ms = Math.round(payload_build_ms);
    logHubBadgeBreakdown(breakdown);
    buildAndLogSnapshotDeepBreakdown({
      path: "unified_rpc",
      snapshot: fullRow,
      timing: rpcTiming,
      participant_merge_ms,
      payload_build_ms,
      aggregate_compute_ms: Math.round(rpcMs || rpcWallMs),
      memory_snapshot_hit: 0,
      aggregate_inside_rpc: 1,
      userId: uid,
    });
    logHubBadgeCacheAnalysis({
      hub_store_memory_hit: 1,
      unread_snapshot_hit: 1,
      order_roomids_hit: 0,
      transport_saved_ms: 0,
      rpc_removed: 0,
      wave_parallelized: 1,
    });
    evaluateHubBadgeRegressionGuards({
      breakdown,
      dbRoundTrips: 1,
      snapshotVia: "unified_rpc",
    });
    return { payload, meta, breakdown };
  });
}
