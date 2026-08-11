/**
 * Admin Member Control Center — overview lightweight aggregates.
 * CONTRACT: source counts only; error ≠ 0; no chat body; D-Point = ledger sum.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_DOMAINS, type ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import { sumUserPointLedger } from "@/lib/points/user-point-ledger";
import { readMemberMannerBattery } from "@/lib/trust/member-trust-read";

export type OverviewMetric<T> = { ok: true; value: T } | { ok: false; error: string };

export type MemberOverviewAggregates = {
  community: {
    posts: OverviewMetric<number>;
    comments: OverviewMetric<number>;
    reportsFiled: OverviewMetric<number>;
    lastPostAt: OverviewMetric<string | null>;
  };
  trade: {
    listings: OverviewMetric<number>;
    selling: OverviewMetric<number>;
    reserved: OverviewMetric<number>;
    completed: OverviewMetric<number>;
    lastListingAt: OverviewMetric<string | null>;
  };
  delivery: {
    total: OverviewMetric<number>;
    inProgress: OverviewMetric<number>;
    completed: OverviewMetric<number>;
    cancelled: OverviewMetric<number>;
    lastOrderAt: OverviewMetric<string | null>;
  };
  store: {
    owned: OverviewMetric<number>;
  };
  chat: {
    byDomain: Record<ChatDomain, OverviewMetric<number>>;
    lastMessageAt: OverviewMetric<string | null>;
  };
  points: OverviewMetric<number> | { ok: false; unavailable: true };
  trust: OverviewMetric<{ percent: number; source: string }>;
};

const DELIVERY_IN_PROGRESS = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "cancel_requested",
  "refund_requested",
] as const;

const CHAT_PARTICIPANT_CAP = 1000;

type CountResult = PromiseLike<{ count: number | null; error: { message?: string } | null }>;
type LatestResult = PromiseLike<{ data: Array<Record<string, unknown>> | null; error: { message?: string } | null }>;

async function asCount(q: CountResult): Promise<OverviewMetric<number>> {
  const { count, error } = await q;
  if (error) return { ok: false, error: error.message ?? "count_failed" };
  return { ok: true, value: count ?? 0 };
}

async function asLatest(q: LatestResult, column: string): Promise<OverviewMetric<string | null>> {
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message ?? "latest_failed" };
  const row = data?.[0];
  const value = row ? String(row[column] ?? "").trim() : "";
  return { ok: true, value: value || null };
}

function emptyChatCounts(): Record<ChatDomain, OverviewMetric<number>> {
  return {
    general_direct: { ok: true, value: 0 },
    group: { ok: true, value: 0 },
    trade: { ok: true, value: 0 },
    store_order: { ok: true, value: 0 },
  };
}

async function loadChatMetrics(
  sb: SupabaseClient,
  userId: string,
): Promise<MemberOverviewAggregates["chat"]> {
  const failed = (error: string): MemberOverviewAggregates["chat"] => ({
    byDomain: {
      general_direct: { ok: false, error },
      group: { ok: false, error },
      trade: { ok: false, error },
      store_order: { ok: false, error },
    },
    lastMessageAt: { ok: false, error },
  });

  const { data: parts, error: partErr } = await sb
    .from("community_messenger_participants")
    .select("room_id")
    .eq("user_id", userId)
    .is("left_at", null)
    .limit(CHAT_PARTICIPANT_CAP);
  if (partErr) return failed(partErr.message);

  const roomIds = [
    ...new Set(
      (parts ?? [])
        .map((row) => String((row as { room_id?: string }).room_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (roomIds.length === 0) {
    return { byDomain: emptyChatCounts(), lastMessageAt: { ok: true, value: null } };
  }

  const rooms: Array<{ chat_domain?: string | null; last_message_at?: string | null }> = [];
  for (let i = 0; i < roomIds.length; i += 200) {
    const chunk = roomIds.slice(i, i + 200);
    const { data, error } = await sb
      .from("community_messenger_rooms")
      .select("id, chat_domain, last_message_at")
      .in("id", chunk);
    if (error) return failed(error.message);
    if (Array.isArray(data)) rooms.push(...data);
  }

  const counts: Record<ChatDomain, number> = {
    general_direct: 0,
    group: 0,
    trade: 0,
    store_order: 0,
  };
  let latest: string | null = null;
  for (const room of rooms) {
    const domain = String(room.chat_domain ?? "").trim();
    if ((CHAT_DOMAINS as readonly string[]).includes(domain)) {
      counts[domain as ChatDomain] += 1;
    }
    const at = String(room.last_message_at ?? "").trim();
    if (at && (!latest || at > latest)) latest = at;
  }

  return {
    byDomain: {
      general_direct: { ok: true, value: counts.general_direct },
      group: { ok: true, value: counts.group },
      trade: { ok: true, value: counts.trade },
      store_order: { ok: true, value: counts.store_order },
    },
    lastMessageAt: { ok: true, value: latest },
  };
}

export async function loadMemberOverviewAggregates(
  sb: SupabaseClient,
  userId: string,
  opts?: { includePoints?: boolean },
): Promise<MemberOverviewAggregates> {
  const uid = userId.trim();

  const [
    posts,
    comments,
    reportsFiled,
    lastPostAt,
    listings,
    selling,
    reserved,
    completedListings,
    lastListingAt,
    ordersTotal,
    ordersInProgress,
    ordersCompleted,
    ordersCancelled,
    lastOrderAt,
    storesOwned,
    chat,
    pointsRes,
    trustRes,
  ] = await Promise.all([
    asCount(sb.from("community_posts").select("id", { count: "exact", head: true }).eq("user_id", uid)),
    asCount(sb.from("community_comments").select("id", { count: "exact", head: true }).eq("user_id", uid)),
    asCount(sb.from("community_reports").select("id", { count: "exact", head: true }).eq("reporter_id", uid)).then(
      async (metric) => {
        if (metric.ok || !/reporter_id/i.test(metric.error)) return metric;
        return asCount(sb.from("community_reports").select("id", { count: "exact", head: true }).eq("user_id", uid));
      },
    ),
    asLatest(
      sb.from("community_posts").select("created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
      "created_at",
    ),
    asCount(sb.from("posts").select("id", { count: "exact", head: true }).eq("user_id", uid)),
    asCount(
      sb.from("posts").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("seller_listing_state", "inquiry"),
    ),
    asCount(
      sb.from("posts").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("seller_listing_state", "reserved"),
    ),
    asCount(
      sb
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .or("seller_listing_state.eq.completed,status.eq.sold"),
    ),
    asLatest(
      sb.from("posts").select("created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
      "created_at",
    ),
    asCount(sb.from("store_orders").select("id", { count: "exact", head: true }).eq("buyer_user_id", uid)),
    asCount(
      sb
        .from("store_orders")
        .select("id", { count: "exact", head: true })
        .eq("buyer_user_id", uid)
        .in("order_status", [...DELIVERY_IN_PROGRESS]),
    ),
    asCount(
      sb.from("store_orders").select("id", { count: "exact", head: true }).eq("buyer_user_id", uid).eq("order_status", "completed"),
    ),
    asCount(
      sb
        .from("store_orders")
        .select("id", { count: "exact", head: true })
        .eq("buyer_user_id", uid)
        .in("order_status", ["cancelled", "refunded"]),
    ),
    asLatest(
      sb
        .from("store_orders")
        .select("created_at")
        .eq("buyer_user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1),
      "created_at",
    ),
    asCount(sb.from("stores").select("id", { count: "exact", head: true }).eq("owner_user_id", uid)),
    loadChatMetrics(sb, uid),
    opts?.includePoints === false
      ? Promise.resolve({ ok: false as const, unavailable: true as const })
      : sumUserPointLedger(sb, uid).then((sum) =>
          sum.ok
            ? ({ ok: true as const, value: sum.sum } satisfies OverviewMetric<number>)
            : { ok: false as const, error: sum.error },
        ),
    readMemberMannerBattery(sb, uid)
      .then((row) => ({
        ok: true as const,
        value: { percent: row.manner_battery_percent, source: row.source },
      }))
      .catch((err: unknown) => ({
        ok: false as const,
        error: err instanceof Error ? err.message : "trust_read_failed",
      })),
  ]);

  return {
    community: { posts, comments, reportsFiled, lastPostAt },
    trade: { listings, selling, reserved, completed: completedListings, lastListingAt },
    delivery: {
      total: ordersTotal,
      inProgress: ordersInProgress,
      completed: ordersCompleted,
      cancelled: ordersCancelled,
      lastOrderAt,
    },
    store: { owned: storesOwned },
    chat,
    points: pointsRes,
    trust: trustRes,
  };
}
