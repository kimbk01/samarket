/**
 * Owner hub badge snapshot — read-only assembly (counter row → unified RPC fallback).
 * Cold path: counter row + notification_targets bundle (parallel → embedded 1 RTT).
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
  cStoreOwnerReviewAttentionBlocked,
  resolveCStoreInquiryActionCount,
  resolveCStoreOrderActionCount,
} from "@/lib/notifications/badge-authority-rebuild/store-operation-c-projection";
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
import {
  readOwnerHubStoreLookupMemory,
  writeOwnerHubStoreLookupMemory,
} from "@/lib/chats/owner-hub-store-lookup-cache";
import type {
  OwnerHubBadgeApiPayload,
  OwnerHubBadgeBuildMeta,
} from "@/lib/chats/build-owner-hub-badge-payload";
import { mergeOwnerHubBadgeUnreadAndStore } from "@/lib/chats/build-owner-hub-badge-payload";
import {
  countNotificationTargetsHubBundle,
  type NotificationTargetHubBundle,
} from "@/lib/notifications/notification-targets";
import { ownerHubUnreadPartialFromTargetBundle } from "@/lib/chats/build-owner-hub-badge-from-targets";
import { writeCmUnreadRoomCountMemory } from "@/lib/community-messenger/cm-unread-room-count-memory-cache";
import {
  invalidateHubStoreOrderUnreadMemory,
  writeHubStoreOrderUnreadMemory,
} from "@/lib/community-messenger/hub-store-order-unread-memory-cache";
import { writeHubStoreAttentionMemory } from "@/lib/stores/hub-store-attention-memory-cache";
import { countOwnerStoreOrderMessengerUnreadForHubStore } from "@/lib/community-messenger/store-order-chat-service";
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
  /** Slice 2-5 C_store — cancel_requested (0 when column/RPC older) */
  cancel_pending_count: number;
  inquiry_pending_count: number;
  nt_bottom_nav_chat?: number;
  nt_bottom_nav_community?: number;
  nt_bottom_nav_delivery?: number;
  nt_fab_owner_orders?: number;
  nt_fab_owner_store?: number;
  nt_fab_owner_order_chat?: number;
  nt_owner_commerce_inbox?: number;
  nt_bundle_at?: string | null;
  updated_at: string;
};

type SnapshotReadVia = "counter_row" | "unified_rpc";

type SnapshotCounterReadTiming = {
  db_fetch_ms: number;
  snapshot_deserialize_ms: number;
  query_row_bytes: number;
};

type SnapshotCounterRead =
  | {
      hit: false;
      reason: "missing" | "stale" | "no_column" | "error";
      timing: SnapshotCounterReadTiming;
      bundleColumnsAvailable: boolean;
    }
  | {
      hit: true;
      row: OwnerHubBadgeSnapshotRow;
      ageMs: number;
      stale: boolean;
      raw: Record<string, unknown> | null;
      timing: SnapshotCounterReadTiming;
      bundleColumnsAvailable: boolean;
    };

type SnapshotTargetBundleTiming = {
  counterRowMs: number;
  targetBundleMs: number;
  targetBundleRpcSkipped: 0 | 1;
  targetBundleRefetchMs: number;
};

function counterBareSelectFields(): string {
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
    "cancel_pending_count",
    "inquiry_pending_count",
    "updated_at",
  ].join(",");
}

function counterBundleSelectFields(): string {
  return [
    counterBareSelectFields(),
    "nt_bottom_nav_chat",
    "nt_bottom_nav_community",
    "nt_bottom_nav_delivery",
    "nt_fab_owner_orders",
    "nt_fab_owner_store",
    "nt_fab_owner_order_chat",
    "nt_owner_commerce_inbox",
    "nt_bundle_at",
  ].join(",");
}

function isNtBundleColumnError(error: { message?: string; code?: string }): boolean {
  const msg = error.message ?? "";
  return (
    msg.includes("nt_bundle_at") ||
    msg.includes("nt_bottom_nav_chat") ||
    msg.includes("nt_fab_owner_orders") ||
    error.code === "42703"
  );
}

function floorCount(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function embeddedBundleFromSnapshotRow(row: OwnerHubBadgeSnapshotRow): NotificationTargetHubBundle | null {
  if (!row.nt_bundle_at || typeof row.nt_bundle_at !== "string") return null;
  return {
    bottom_nav_chat: floorCount(row.nt_bottom_nav_chat),
    bottom_nav_community: floorCount(row.nt_bottom_nav_community),
    bottom_nav_delivery: floorCount(row.nt_bottom_nav_delivery),
    fab_owner_orders: floorCount(row.nt_fab_owner_orders),
    fab_owner_store: floorCount(row.nt_fab_owner_store),
    fab_owner_order_chat: floorCount(row.nt_fab_owner_order_chat),
    owner_commerce_inbox: floorCount(row.nt_owner_commerce_inbox),
  };
}

function bundleFieldsFromRpcData(d: Record<string, unknown>): Partial<OwnerHubBadgeSnapshotRow> {
  return {
    nt_bottom_nav_chat: floorCount(d.nt_bottom_nav_chat),
    nt_bottom_nav_community: floorCount(d.nt_bottom_nav_community),
    nt_bottom_nav_delivery: floorCount(d.nt_bottom_nav_delivery),
    nt_fab_owner_orders: floorCount(d.nt_fab_owner_orders),
    nt_fab_owner_store: floorCount(d.nt_fab_owner_store),
    nt_fab_owner_order_chat: floorCount(d.nt_fab_owner_order_chat),
    nt_owner_commerce_inbox: floorCount(d.nt_owner_commerce_inbox),
    nt_bundle_at: new Date().toISOString(),
  };
}

function parseSnapshotRpcData(data: unknown): Omit<OwnerHubBadgeSnapshotRow, "updated_at"> | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const hubId = typeof d.hub_store_id === "string" ? d.hub_store_id.trim() : null;
  const base = {
    has_hub_store: Boolean(d.has_hub_store),
    hub_store_id: hubId || null,
    hub_store_slug: typeof d.hub_store_slug === "string" ? d.hub_store_slug : null,
    store_order_participant_unread: floorCount(d.store_order_participant_unread),
    item_trade_participant_unread: floorCount(d.item_trade_participant_unread),
    community_participant_unread: floorCount(d.community_participant_unread),
    product_chat_unread_deduped: floorCount(d.product_chat_unread_deduped),
    community_messenger_unread_room_count: floorCount(d.community_messenger_unread_room_count),
    store_order_chat_unread: floorCount(d.store_order_chat_unread),
    refund_pending_count: floorCount(d.refund_pending_count),
    order_pending_count: floorCount(d.order_pending_count),
    cancel_pending_count: floorCount(d.cancel_pending_count),
    inquiry_pending_count: floorCount(d.inquiry_pending_count),
  };
  if ("nt_bottom_nav_chat" in d) {
    return { ...base, ...bundleFieldsFromRpcData(d) };
  }
  return base;
}

function rowFromDb(
  data: Record<string, unknown>,
  bundleColumnsAvailable: boolean
): OwnerHubBadgeSnapshotRow | null {
  if (!data.updated_at || typeof data.updated_at !== "string") return null;
  const hubId =
    typeof data.hub_store_id === "string" && data.hub_store_id.trim()
      ? data.hub_store_id.trim()
      : null;
  const row: OwnerHubBadgeSnapshotRow = {
    has_hub_store: Boolean(data.has_hub_store),
    hub_store_id: hubId,
    hub_store_slug: typeof data.hub_store_slug === "string" ? data.hub_store_slug : null,
    store_order_participant_unread: floorCount(data.store_order_participant_unread),
    item_trade_participant_unread: floorCount(data.item_trade_participant_unread),
    community_participant_unread: floorCount(data.community_participant_unread),
    product_chat_unread_deduped: floorCount(data.product_chat_unread_deduped),
    community_messenger_unread_room_count: floorCount(data.community_messenger_unread_room_count),
    store_order_chat_unread: floorCount(data.store_order_chat_unread),
    refund_pending_count: floorCount(data.refund_pending_count),
    order_pending_count: floorCount(data.order_pending_count),
    cancel_pending_count: floorCount(data.cancel_pending_count),
    inquiry_pending_count: floorCount(data.inquiry_pending_count),
    updated_at: data.updated_at,
  };
  if (bundleColumnsAvailable) {
    row.nt_bottom_nav_chat = floorCount(data.nt_bottom_nav_chat);
    row.nt_bottom_nav_community = floorCount(data.nt_bottom_nav_community);
    row.nt_bottom_nav_delivery = floorCount(data.nt_bottom_nav_delivery);
    row.nt_fab_owner_orders = floorCount(data.nt_fab_owner_orders);
    row.nt_fab_owner_store = floorCount(data.nt_fab_owner_store);
    row.nt_fab_owner_order_chat = floorCount(data.nt_fab_owner_order_chat);
    row.nt_owner_commerce_inbox = floorCount(data.nt_owner_commerce_inbox);
    row.nt_bundle_at =
      typeof data.nt_bundle_at === "string" && data.nt_bundle_at.trim()
        ? data.nt_bundle_at
        : null;
  }
  return row;
}

export async function readOwnerHubBadgeSnapshotCounter(
  sbAny: SupabaseClient<any>,
  userId: string,
  opts?: { bare?: boolean }
): Promise<SnapshotCounterRead> {
  const uid = userId.trim();
  const bundleColumnsAvailable = opts?.bare !== true;
  const select = bundleColumnsAvailable ? counterBundleSelectFields() : counterBareSelectFields();
  const db0 = devPerfNow();
  const { data, error } = await sbAny
    .from(HUB_BADGE_UNREAD_COUNTERS_TABLE)
    .select(select)
    .eq("user_id", uid)
    .maybeSingle();
  const db_fetch_ms = Math.round(devPerfNow() - db0);

  const query_row_bytes = measureJsonUtf8Bytes(data);
  let snapshot_deserialize_ms = 0;

  if (error) {
    const timing: SnapshotCounterReadTiming = {
      db_fetch_ms,
      snapshot_deserialize_ms: 0,
      query_row_bytes,
    };
    if (isNtBundleColumnError(error) && bundleColumnsAvailable) {
      return readOwnerHubBadgeSnapshotCounter(sbAny, userId, { bare: true });
    }
    if (
      error.message?.includes("has_hub_store") ||
      error.message?.includes("hub_store_id") ||
      error.message?.includes("store_order_chat_unread") ||
      error.code === "42703"
    ) {
      return { hit: false, reason: "no_column", timing, bundleColumnsAvailable: false };
    }
    if (error.message?.includes("does not exist") || error.code === "42P01") {
      return { hit: false, reason: "missing", timing, bundleColumnsAvailable: false };
    }
    return { hit: false, reason: "error", timing, bundleColumnsAvailable: false };
  }

  const des0 = devPerfNow();
  const row = data ? rowFromDb(data as unknown as Record<string, unknown>, bundleColumnsAvailable) : null;
  snapshot_deserialize_ms = Math.round(devPerfNow() - des0);
  const timing: SnapshotCounterReadTiming = {
    db_fetch_ms,
    snapshot_deserialize_ms,
    query_row_bytes,
  };

  if (!row) return { hit: false, reason: "missing", timing, bundleColumnsAvailable };

  const ageMs = Math.max(0, Date.now() - new Date(row.updated_at).getTime());
  const stale = ageMs > hubBadgeUnreadCounterTtlMs();
  return {
    hit: true,
    row,
    ageMs,
    stale,
    raw: data ? (data as unknown as Record<string, unknown>) : null,
    timing,
    bundleColumnsAvailable,
  };
}

async function fetchSnapshotCounterAndTargetBundle(
  sbAny: SupabaseClient<any>,
  uid: string
): Promise<
  | {
      counter: SnapshotCounterRead & { hit: true };
      bundle: NotificationTargetHubBundle;
      timing: SnapshotTargetBundleTiming;
    }
  | {
      counter: SnapshotCounterRead;
      bundle: NotificationTargetHubBundle | null;
      timing: SnapshotTargetBundleTiming;
    }
> {
  const mem = readOwnerHubStoreLookupMemory(uid);
  const storeIdHint = mem.hit ? (mem.hubStore?.id ?? null) : null;

  const counter = await readOwnerHubBadgeSnapshotCounter(sbAny, uid);
  const counterRowMs = counter.timing.db_fetch_ms;

  if (counter.hit) {
    const embedded = embeddedBundleFromSnapshotRow(counter.row);
    if (embedded) {
      return {
        counter,
        bundle: embedded,
        timing: {
          counterRowMs,
          targetBundleMs: 0,
          targetBundleRpcSkipped: 1,
          targetBundleRefetchMs: 0,
        },
      };
    }
  }

  if (!counter.hit && counter.reason !== "missing" && counter.reason !== "stale") {
    return {
      counter,
      bundle: null,
      timing: {
        counterRowMs,
        targetBundleMs: 0,
        targetBundleRpcSkipped: 0,
        targetBundleRefetchMs: 0,
      },
    };
  }

  if (counter.bundleColumnsAvailable && counter.hit) {
    const bundleT0 = devPerfNow();
    const bundle = await countNotificationTargetsHubBundle(sbAny, uid, counter.row.hub_store_id);
    return {
      counter,
      bundle,
      timing: {
        counterRowMs,
        targetBundleMs: Math.round(devPerfNow() - bundleT0),
        targetBundleRpcSkipped: 0,
        targetBundleRefetchMs: 0,
      },
    };
  }

  // Phase 1 fallback (nt columns absent): counter + bundle RPC in parallel.
  const counterPromise =
    counter.hit || counter.reason === "missing" || counter.reason === "stale"
      ? Promise.resolve(counter)
      : readOwnerHubBadgeSnapshotCounter(sbAny, uid, { bare: true });
  const bundleT0 = devPerfNow();
  const bundlePromise = countNotificationTargetsHubBundle(sbAny, uid, storeIdHint);
  const [counterFinal, bundleParallel] = await Promise.all([counterPromise, bundlePromise]);
  const parallelBundleMs = Math.round(devPerfNow() - bundleT0);
  const finalCounterRowMs = counterFinal.timing.db_fetch_ms;

  if (counterFinal.hit) {
    const embedded = embeddedBundleFromSnapshotRow(counterFinal.row);
    if (embedded) {
      return {
        counter: counterFinal,
        bundle: embedded,
        timing: {
          counterRowMs: finalCounterRowMs,
          targetBundleMs: 0,
          targetBundleRpcSkipped: 1,
          targetBundleRefetchMs: 0,
        },
      };
    }
  }

  let bundle = bundleParallel;
  let targetBundleRefetchMs = 0;
  if (counterFinal.hit && counterFinal.row.hub_store_id !== storeIdHint) {
    const refetch0 = devPerfNow();
    bundle = await countNotificationTargetsHubBundle(sbAny, uid, counterFinal.row.hub_store_id);
    targetBundleRefetchMs = Math.round(devPerfNow() - refetch0);
  }

  return {
    counter: counterFinal,
    bundle,
    timing: {
      counterRowMs: finalCounterRowMs,
      targetBundleMs: parallelBundleMs + targetBundleRefetchMs,
      targetBundleRpcSkipped: 0,
      targetBundleRefetchMs,
    },
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
  const row: Record<string, unknown> = {
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
    cancel_pending_count: snapshot.cancel_pending_count,
    inquiry_pending_count: snapshot.inquiry_pending_count,
    updated_at: now,
  };
  if (snapshot.nt_bundle_at) {
    row.nt_bottom_nav_chat = floorCount(snapshot.nt_bottom_nav_chat);
    row.nt_bottom_nav_community = floorCount(snapshot.nt_bottom_nav_community);
    row.nt_bottom_nav_delivery = floorCount(snapshot.nt_bottom_nav_delivery);
    row.nt_fab_owner_orders = floorCount(snapshot.nt_fab_owner_orders);
    row.nt_fab_owner_store = floorCount(snapshot.nt_fab_owner_store);
    row.nt_fab_owner_order_chat = floorCount(snapshot.nt_fab_owner_order_chat);
    row.nt_owner_commerce_inbox = floorCount(snapshot.nt_owner_commerce_inbox);
    row.nt_bundle_at = snapshot.nt_bundle_at;
  }
  const { error } = await sbAny.from(HUB_BADGE_UNREAD_COUNTERS_TABLE).upsert(row, {
    onConflict: "user_id",
  });
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
      cancelPendingCount: snapshot.cancel_pending_count,
      inquiryPendingCount: snapshot.inquiry_pending_count,
    });
  } else {
    writeOwnerHubStoreLookupMemory(uid, null);
  }
}

function payloadFromSnapshot(
  snapshot: OwnerHubBadgeSnapshotRow,
  bundle: NotificationTargetHubBundle,
  /**
   * Slice 2-4 — active-store owner chat unread **room** count.
   * Prefer this over notification_targets fab_owner_order_chat / RPC message-sum.
   */
  storeOrderChatUnreadRooms?: number
): OwnerHubBadgeApiPayload {
  const unread = ownerHubUnreadPartialFromTargetBundle(bundle);
  const storeOrderChatUnread =
    storeOrderChatUnreadRooms != null
      ? Math.max(0, Math.floor(Number(storeOrderChatUnreadRooms) || 0))
      : snapshot.has_hub_store
        ? 0
        : 0;
  const orderAttention = resolveCStoreOrderActionCount({
    pendingOrderActions: snapshot.order_pending_count,
    refundActions: snapshot.refund_pending_count,
    cancelActions: snapshot.cancel_pending_count,
    openInquiryActions: snapshot.inquiry_pending_count,
  });
  const inquiryAttention = resolveCStoreInquiryActionCount({
    pendingOrderActions: snapshot.order_pending_count,
    refundActions: snapshot.refund_pending_count,
    cancelActions: snapshot.cancel_pending_count,
    openInquiryActions: snapshot.inquiry_pending_count,
  });
  const ownerReviewAttention = cStoreOwnerReviewAttentionBlocked();
  let storeDeepLink: string | null = null;
  if (snapshot.has_hub_store && snapshot.hub_store_id) {
    if (inquiryAttention > 0) {
      storeDeepLink = `/stores/owner/inquiries?storeId=${encodeURIComponent(snapshot.hub_store_id)}`;
    } else if (orderAttention > 0) {
      storeDeepLink = buildStoreOrdersHref({
        storeId: snapshot.hub_store_id,
        freshList: true,
        opsAttention: true,
      });
    } else if (storeOrderChatUnread > 0) {
      storeDeepLink = ORDER_CHAT_MESSENGER_LIST_HREF;
    }
  }
  return mergeOwnerHubBadgeUnreadAndStore(
    { ...unread, storeOrderChatUnread },
    {
      // Slice 2-5 — state Action Required only; never max(fab_owner_orders).
      orderAttention,
      inquiryAttention,
      ownerReviewAttention,
      buyerOrderAttention: Math.max(0, bundle.bottom_nav_delivery),
      storeDeepLink,
    }
  );
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
  bundleTiming: SnapshotTargetBundleTiming;
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
    counter_row_ms: input.bundleTiming.counterRowMs,
    target_bundle_ms: input.bundleTiming.targetBundleMs,
    target_bundle_rpc_skipped: input.bundleTiming.targetBundleRpcSkipped,
    target_bundle_refetch_ms: input.bundleTiming.targetBundleRefetchMs,
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
  bundleTiming: SnapshotTargetBundleTiming;
  rpcMs?: number;
  stale?: boolean;
}): HubBadgeBreakdown {
  const { snapshot, via, totalMs, readMs, rpcMs = 0, stale, bundleTiming } = input;
  const snapshotMs = Math.round(via === "counter_row" ? readMs : rpcMs || readMs);
  const payloadBuildMs = Math.round(
    bundleTiming.targetBundleRpcSkipped ? 0 : bundleTiming.targetBundleMs
  );
  const worstCandidates = [
    { stage: via === "counter_row" ? "owner_hub_badge_snapshot_row" : "owner_hub_badge_unified_rpc", ms: snapshotMs },
    { stage: "target_bundle", ms: bundleTiming.targetBundleMs },
    { stage: "payload_build", ms: payloadBuildMs },
  ];
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
    payload_build_ms: payloadBuildMs,
    cache_hit: 0,
    cache_hit_reason: via === "counter_row" ? "owner_hub_badge_snapshot_row" : "owner_hub_badge_unified_rpc",
    has_hub_store: snapshot.has_hub_store ? 1 : 0,
    store_id_short: storeIdShort(snapshot.hub_store_id),
    query_wave_1_ms: Math.max(snapshotMs, bundleTiming.targetBundleMs),
    query_wave_2_ms: 0,
    query_wave_3_ms: 0,
    query_wave_1_parallel_slack_ms: Math.max(
      0,
      Math.round(snapshotMs + bundleTiming.targetBundleMs - Math.max(snapshotMs, bundleTiming.targetBundleMs))
    ),
    query_wave_2_parallel_slack_ms: 0,
    find_hub_store_via: "memory",
    find_hub_store_cache_hit: 1,
    ...(snapshot.has_hub_store ? {} : { no_hub_fast_path: 1 as const }),
    worst_stage: worstCandidates[0].stage,
    worst_stage_ms: worstCandidates[0].ms,
    hub_store_memory_hit: 1,
    unread_snapshot_hit: 1,
    order_roomids_hit: 0,
    transport_saved_ms: via === "counter_row" ? snapshotMs : 0,
    rpc_removed: via === "counter_row" ? 1 : 0,
    wave_parallelized: bundleTiming.targetBundleRpcSkipped ? 0 : 1,
    ...hubBadgeBreakdownForUser(input.userId),
  };
  const { worst_stage, worst_stage_ms } = pickWorstStage(worstCandidates);
  breakdown.worst_stage = worst_stage;
  breakdown.worst_stage_ms = worst_stage_ms;

  if (stale) {
    evaluateHubBadgeRegressionGuards({
      breakdown,
      dbRoundTrips: bundleTiming.targetBundleRpcSkipped ? 1 : 2,
      snapshotVia: via === "counter_row" ? "counter_row" : "unified_rpc",
      staleSnapshot: true,
      snapshotMissReason: "counter_row_stale_swr",
    });
  }

  return breakdown;
}

async function resolveActiveStoreOwnerChatRoomCount(
  sbAny: SupabaseClient<any>,
  userId: string,
  hubStoreId: string | null | undefined
): Promise<number> {
  const sid = typeof hubStoreId === "string" ? hubStoreId.trim() : "";
  if (!sid) return 0;
  // Drop stale message-sum cache entries from pre–Slice-2-4 writers.
  invalidateHubStoreOrderUnreadMemory(userId, sid);
  return countOwnerStoreOrderMessengerUnreadForHubStore(sbAny, userId, sid);
}

async function buildSnapshotFromCounterHit(input: {
  userId: string;
  build0: number;
  counter: SnapshotCounterRead & { hit: true };
  bundle: NotificationTargetHubBundle;
  bundleTiming: SnapshotTargetBundleTiming;
  stale?: boolean;
  meta: OwnerHubBadgeBuildMeta;
  sbAny: SupabaseClient<any>;
}): Promise<SnapshotBuildResult> {
  const { userId: uid, counter, bundle, bundleTiming, stale, meta, build0, sbAny } = input;
  const readMs = counter.timing.db_fetch_ms;
  const merge0 = devPerfNow();
  syncProcessMemoryLayersFromSnapshot(uid, counter.row);
  const participant_merge_ms = devPerfNow() - merge0;
  const payload0 = devPerfNow();
  const storeOrderChatUnreadRooms = await resolveActiveStoreOwnerChatRoomCount(
    sbAny,
    uid,
    counter.row.hub_store_id
  );
  const payload = payloadFromSnapshot(counter.row, bundle, storeOrderChatUnreadRooms);
  const payload_build_ms = devPerfNow() - payload0;
  const breakdown = buildSnapshotBreakdown({
    userId: uid,
    totalMs: devPerfNow() - build0,
    readMs,
    via: "counter_row",
    snapshot: counter.row,
    bundleTiming,
    stale,
  });
  breakdown.payload_build_ms = Math.round(payload_build_ms);
  logHubBadgeBreakdown(breakdown);
  buildAndLogSnapshotDeepBreakdown({
    path: stale ? "counter_row_stale_swr" : "counter_row",
    snapshot: counter.row,
    timing: counter.timing,
    bundleTiming,
    participant_merge_ms,
    payload_build_ms,
    aggregate_compute_ms: 0,
    memory_snapshot_hit: 1,
    stale,
    userId: uid,
  });
  if (!stale) {
    logHubBadgeCacheAnalysis({
      hub_store_memory_hit: 1,
      unread_snapshot_hit: 1,
      order_roomids_hit: 0,
      transport_saved_ms: Math.round(readMs),
      rpc_removed: 1,
      wave_parallelized: bundleTiming.targetBundleRpcSkipped ? 0 : 1,
    });
    evaluateHubBadgeRegressionGuards({
      breakdown,
      dbRoundTrips: bundleTiming.targetBundleRpcSkipped ? 1 : 2,
      snapshotVia: "counter_row",
    });
  }
  return { payload, meta: { ...meta, existsQueryUsed: 0 }, breakdown };
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
      const fetched = await fetchSnapshotCounterAndTargetBundle(sbAny, uid);

      if (fetched.counter.hit && !fetched.counter.stale && fetched.bundle) {
        return await buildSnapshotFromCounterHit({
          userId: uid,
          build0,
          counter: fetched.counter,
          bundle: fetched.bundle,
          bundleTiming: fetched.timing,
          meta,
          sbAny,
        });
      }

      if (fetched.counter.hit && fetched.counter.stale && fetched.bundle) {
        scheduleOwnerHubBadgeSnapshotRefresh(uid);
        return await buildSnapshotFromCounterHit({
          userId: uid,
          build0,
          counter: fetched.counter,
          bundle: fetched.bundle,
          bundleTiming: fetched.timing,
          stale: true,
          meta,
          sbAny,
        });
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
    const embedded = embeddedBundleFromSnapshotRow(fullRow);
    let bundle: NotificationTargetHubBundle;
    let bundleTiming: SnapshotTargetBundleTiming;
    if (embedded) {
      bundle = embedded;
      bundleTiming = {
        counterRowMs: 0,
        targetBundleMs: 0,
        targetBundleRpcSkipped: 1,
        targetBundleRefetchMs: 0,
      };
    } else {
      const bundleT0 = devPerfNow();
      bundle = await countNotificationTargetsHubBundle(sbAny, uid, fullRow.hub_store_id);
      bundleTiming = {
        counterRowMs: 0,
        targetBundleMs: Math.round(devPerfNow() - bundleT0),
        targetBundleRpcSkipped: 0,
        targetBundleRefetchMs: 0,
      };
    }
    const payload0 = devPerfNow();
    const storeOrderChatUnreadRooms = await resolveActiveStoreOwnerChatRoomCount(
      sbAny,
      uid,
      fullRow.hub_store_id
    );
    const payload = payloadFromSnapshot(fullRow, bundle, storeOrderChatUnreadRooms);
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
      bundleTiming,
      rpcMs,
    });
    breakdown.payload_build_ms = Math.round(payload_build_ms);
    logHubBadgeBreakdown(breakdown);
    buildAndLogSnapshotDeepBreakdown({
      path: "unified_rpc",
      snapshot: fullRow,
      timing: rpcTiming,
      bundleTiming,
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
      dbRoundTrips: bundleTiming.targetBundleRpcSkipped ? 1 : 2,
      snapshotVia: "unified_rpc",
    });
    return { payload, meta, breakdown };
  });
}
