import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateNotificationEventInput,
  NotificationEventRow,
} from "@/lib/notifications/core/notification-event-schema";
import type { NotificationBadgeCount } from "@/lib/notifications/core/notification-event-types";
import { categoryForEventType } from "@/lib/notifications/core/notification-policy";

const EMPTY_BADGE: NotificationBadgeCount = {
  total: 0,
  chatMessage: 0,
  groupMessage: 0,
  tradeMessage: 0,
  tradeStatus: 0,
  orderStatus: 0,
  deliveryStatus: 0,
  communityActivity: 0,
  adminMarketingBanner: 0,
  adminNotice: 0,
  chat: 0,
  group: 0,
  trade: 0,
  store: 0,
  missedCall: 0,
};

function payloadFlag(payload: unknown, keys: string[]): boolean | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
  }
  return null;
}

function payloadTime(payload: unknown, keys: string[]): number | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value !== "string" || !value.trim()) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isBadgeEligibleNotificationEvent(row: {
  display_payload?: unknown;
  muted_snapshot?: boolean | null;
}): boolean {
  const payload = row.display_payload;
  if (payloadFlag(payload, ["badge_enabled", "badgeEnabled"]) === false) return false;
  if (payloadFlag(payload, ["exclude_from_badge", "excludeFromBadge", "mute_badge", "muteBadge"]) === true) {
    return false;
  }
  if (payloadFlag(payload, ["deleted", "isDeleted"]) === true) return false;
  if (payloadTime(payload, ["deleted_at", "deletedAt"]) != null) return false;
  const expiredAt = payloadTime(payload, ["expired_at", "expiredAt", "expires_at", "expiresAt"]);
  if (expiredAt != null && expiredAt <= Date.now()) return false;
  // muted_snapshot is sound suppression only. Badge mute must be explicit.
  return true;
}

function mapBadgeRpc(raw: Record<string, unknown> | null): NotificationBadgeCount {
  if (!raw) return EMPTY_BADGE;
  const chatMessage = Math.max(
    0,
    Math.floor(Number(raw.chat_message ?? raw.chat) || 0)
  );
  const groupMessage = Math.max(
    0,
    Math.floor(Number(raw.group_message ?? raw.group) || 0)
  );
  const tradeMessage = Math.max(
    0,
    Math.floor(Number(raw.trade_message ?? raw.trade) || 0)
  );
  const tradeStatus = Math.max(0, Math.floor(Number(raw.trade_status) || 0));
  const orderStatus = Math.max(
    0,
    Math.floor(Number(raw.order_status ?? raw.store) || 0)
  );
  const deliveryStatus = Math.max(0, Math.floor(Number(raw.delivery_status) || 0));
  const communityActivity = Math.max(
    0,
    Math.floor(Number(raw.community_activity) || 0)
  );
  const adminMarketingBanner = Math.max(
    0,
    Math.floor(Number(raw.admin_marketing_banner) || 0)
  );
  const adminNotice = Math.max(0, Math.floor(Number(raw.admin_notice) || 0));
  const missedCall = Math.max(0, Math.floor(Number(raw.missed_call) || 0));
  const chat = chatMessage;
  const group = groupMessage;
  const trade = tradeMessage + tradeStatus;
  const store = orderStatus + deliveryStatus;
  return {
    chatMessage,
    groupMessage,
    tradeMessage,
    tradeStatus,
    orderStatus,
    deliveryStatus,
    communityActivity,
    adminMarketingBanner,
    adminNotice,
    chat,
    group,
    trade,
    store,
    missedCall,
    total:
      chatMessage +
      groupMessage +
      tradeMessage +
      tradeStatus +
      orderStatus +
      deliveryStatus +
      communityActivity +
      adminNotice +
      missedCall,
  };
}

export async function createNotificationEvent(
  sb: SupabaseClient<any>,
  input: CreateNotificationEventInput
): Promise<{ ok: true; row: NotificationEventRow } | { ok: false; error: string; duplicate?: boolean }> {
  const userId = input.userId.trim();
  const dedupeKey = input.dedupeKey.trim();
  if (!userId || !dedupeKey) return { ok: false, error: "invalid_input" };

  const category = input.category ?? categoryForEventType(input.type);
  const chatDomain = typeof input.chatDomain === "string" ? input.chatDomain.trim() : "";
  const domainIdentityKey =
    typeof input.domainIdentityKey === "string" ? input.domainIdentityKey.trim() : "";
  const insert = {
    user_id: userId,
    type: input.type,
    category,
    room_id: input.roomId?.trim() || null,
    call_session_id: input.callSessionId?.trim() || null,
    actor_user_id: input.actorUserId?.trim() || null,
    message_id: input.messageId?.trim() || null,
    title: input.title,
    body: input.body ?? "",
    display_payload: input.displayPayload ?? {},
    unread: input.unread !== false,
    muted_snapshot: input.mutedSnapshot === true,
    push_suppressed_reason: input.pushSuppressedReason ?? null,
    sound_suppressed_reason: input.soundSuppressedReason ?? null,
    delivered_at: input.deliveredAt ?? new Date().toISOString(),
    dedupe_key: dedupeKey,
    ...(chatDomain && domainIdentityKey
      ? { chat_domain: chatDomain, domain_identity_key: domainIdentityKey }
      : {}),
  };

  const { data, error } = await sb.from("notification_events").insert(insert).select("*").single();
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return { ok: false, error: "duplicate", duplicate: true };
    return { ok: false, error: String(error.message ?? "insert_failed") };
  }
  return { ok: true, row: data as NotificationEventRow };
}

/** Modern taxonomy keys the SQL COUNT RPC must return before we trust it (vs legacy 5-key RPC). */
function isModernBadgeRpcShape(raw: Record<string, unknown> | null): boolean {
  if (!raw) return false;
  return "trade_status" in raw || "delivery_status" in raw || "admin_notice" in raw;
}

export async function countNotificationEventsBadge(
  sb: SupabaseClient<any>,
  userId: string
): Promise<NotificationBadgeCount> {
  const uid = userId.trim();
  if (!uid) return EMPTY_BADGE;

  // Boot/IO Authority: aggregate in DB (COUNT) instead of transferring every unread row.
  // Only trust the RPC once the modern-taxonomy migration is applied; otherwise fall back
  // to the row-scan path so meaning stays identical during a code-before-migration window.
  try {
    const { data, error } = await sb.rpc("count_notification_events_badge", { p_user_id: uid });
    if (!error && data && typeof data === "object") {
      const raw = data as Record<string, unknown>;
      if (isModernBadgeRpcShape(raw)) return mapBadgeRpc(raw);
    }
  } catch {
    /* fall through to row-scan fallback */
  }
  return countNotificationEventsBadgeFallback(sb, uid);
}

async function countNotificationEventsBadgeFallback(
  sb: SupabaseClient<any>,
  userId: string
): Promise<NotificationBadgeCount> {
  const { data, error } = await sb
    .from("notification_events")
    .select("category, muted_snapshot, display_payload")
    .eq("user_id", userId)
    .eq("unread", true)
    .is("read_at", null);
  if (error || !data) return EMPTY_BADGE;
  const counts: Record<string, number> = {
    chat_message: 0,
    group_message: 0,
    trade_message: 0,
    trade_status: 0,
    order_status: 0,
    delivery_status: 0,
    community_activity: 0,
    admin_marketing_banner: 0,
    admin_notice: 0,
    missed_call: 0,
    // Legacy
    chat: 0,
    group: 0,
    trade: 0,
    store: 0,
  };
  for (const row of data as { category?: string; muted_snapshot?: boolean | null; display_payload?: unknown }[]) {
    if (!isBadgeEligibleNotificationEvent(row)) continue;
    const c = String(row.category ?? "");
    if (c in counts) counts[c] += 1;
  }
  return mapBadgeRpc({
    chat_message: counts.chat_message + counts.chat,
    group_message: counts.group_message + counts.group,
    trade_message: counts.trade_message + counts.trade,
    trade_status: counts.trade_status,
    order_status: counts.order_status + counts.store,
    delivery_status: counts.delivery_status,
    community_activity: counts.community_activity,
    admin_marketing_banner: counts.admin_marketing_banner,
    admin_notice: counts.admin_notice,
    missed_call: counts.missed_call,
  });
}

export async function markNotificationEventRead(
  sb: SupabaseClient<any>,
  userId: string,
  eventId: string,
  opts?: { openedAt?: boolean }
): Promise<boolean> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { unread: false, read_at: now };
  if (opts?.openedAt) patch.opened_at = now;
  const { error } = await sb
    .from("notification_events")
    .update(patch)
    .eq("id", eventId.trim())
    .eq("user_id", userId.trim());
  return !error;
}

export async function markRoomNotificationEventsRead(
  sb: SupabaseClient<any>,
  userId: string,
  roomId: string
): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("notification_events")
    .update({ unread: false, read_at: now })
    .eq("user_id", userId.trim())
    .eq("room_id", roomId.trim())
    .eq("unread", true)
    .is("read_at", null)
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

export async function markMissedCallEventsRead(
  sb: SupabaseClient<any>,
  userId: string,
  opts: { roomId?: string; callSessionId?: string }
): Promise<number> {
  const uid = userId.trim();
  const now = new Date().toISOString();
  let q = sb
    .from("notification_events")
    .update({ unread: false, read_at: now, opened_at: now })
    .eq("user_id", uid)
    .eq("type", "missed_call")
    .eq("unread", true)
    .is("read_at", null);
  const callSessionId = opts.callSessionId?.trim();
  const roomId = opts.roomId?.trim();
  if (callSessionId) q = q.eq("call_session_id", callSessionId);
  else if (roomId) q = q.eq("room_id", roomId);
  else return 0;
  const { data, error } = await q.select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

/** 통화목록(`call_logs`) 진입 — 미읽음 부재중 알림 전체 읽음 */
export async function markAllMissedCallEventsRead(
  sb: SupabaseClient<any>,
  userId: string
): Promise<number> {
  const uid = userId.trim();
  if (!uid) return 0;
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("notification_events")
    .update({ unread: false, read_at: now, opened_at: now })
    .eq("user_id", uid)
    .eq("type", "missed_call")
    .eq("unread", true)
    .is("read_at", null)
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

export async function markNotificationEventsReadByCategory(
  sb: SupabaseClient<any>,
  userId: string,
  category: string
): Promise<number> {
  const uid = userId.trim();
  const cat = category.trim();
  if (!uid || !cat) return 0;
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("notification_events")
    .update({ unread: false, read_at: now, opened_at: now })
    .eq("user_id", uid)
    .eq("category", cat)
    .eq("unread", true)
    .is("read_at", null)
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

function displayPayloadRouteUrlContainsId(routeUrlPattern: string): string {
  const escaped = routeUrlPattern.replace(/[%_\\]/g, "\\$&");
  return `display_payload->>routeUrl.ilike.%${escaped}%`;
}

export async function markCommunityPostNotificationEventsRead(
  sb: SupabaseClient<any>,
  userId: string,
  postId: string
): Promise<number> {
  const uid = userId.trim();
  const pid = postId.trim();
  if (!uid || !pid) return 0;
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("notification_events")
    .update({ unread: false, read_at: now, opened_at: now })
    .eq("user_id", uid)
    .in("category", ["community_activity"])
    .eq("unread", true)
    .is("read_at", null)
    .or(
      [
        `display_payload->>legacyRefId.eq.${pid}`,
        `display_payload->legacyMeta->>post_id.eq.${pid}`,
        `display_payload->legacyMeta->>community_post_id.eq.${pid}`,
        displayPayloadRouteUrlContainsId(pid),
        displayPayloadRouteUrlContainsId(`/philife/${pid}`),
        displayPayloadRouteUrlContainsId(`/philife/posts/${pid}`),
      ].join(",")
    )
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

export async function markTradeStatusNotificationEventsReadByProductId(
  sb: SupabaseClient<any>,
  userId: string,
  productId: string
): Promise<number> {
  const uid = userId.trim();
  const product = productId.trim();
  if (!uid || !product) return 0;
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("notification_events")
    .update({ unread: false, read_at: now, opened_at: now })
    .eq("user_id", uid)
    .in("category", ["trade_status"])
    .eq("unread", true)
    .is("read_at", null)
    .or(
      [
        `display_payload->legacyMeta->>product_id.eq.${product}`,
        `display_payload->>legacyRefId.eq.${product}`,
        displayPayloadRouteUrlContainsId(`/post/${product}`),
        displayPayloadRouteUrlContainsId(`/post/${encodeURIComponent(product)}`),
      ].join(",")
    )
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

export async function markOrderNotificationEventsRead(
  sb: SupabaseClient<any>,
  userId: string,
  orderId: string
): Promise<number> {
  const uid = userId.trim();
  const oid = orderId.trim();
  if (!uid || !oid) return 0;
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("notification_events")
    .update({ unread: false, read_at: now, opened_at: now })
    .eq("user_id", uid)
    .in("category", ["order_status", "delivery_status"])
    .eq("unread", true)
    .is("read_at", null)
    .or(
      [
        `display_payload->>legacyRefId.eq.${oid}`,
        `display_payload->legacyMeta->>order_id.eq.${oid}`,
        `display_payload->legacyMeta->>store_order_id.eq.${oid}`,
        `display_payload->>orderId.eq.${oid}`,
        `display_payload->>order_id.eq.${oid}`,
      ].join(",")
    )
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

export async function markNotificationEventsReadByThread(
  sb: SupabaseClient<any>,
  userId: string,
  threadId: string,
  opts?: { categories?: string[] }
): Promise<number> {
  const uid = userId.trim();
  const tid = threadId.trim();
  if (!uid || !tid) return 0;
  const now = new Date().toISOString();
  let q = sb
    .from("notification_events")
    .update({ unread: false, read_at: now, opened_at: now })
    .eq("user_id", uid)
    .or(
      [
        `room_id.eq.${tid}`,
        `call_session_id.eq.${tid}`,
        `display_payload->>legacyRefId.eq.${tid}`,
        `display_payload->legacyMeta->>room_id.eq.${tid}`,
        `display_payload->legacyMeta->>chat_room_id.eq.${tid}`,
        `display_payload->legacyMeta->>product_chat_id.eq.${tid}`,
      ].join(",")
    )
    .eq("unread", true)
    .is("read_at", null);
  const categories = [...new Set((opts?.categories ?? []).map((c) => c.trim()).filter(Boolean))];
  if (categories.length > 0) q = q.in("category", categories);
  const { data, error } = await q.select("id");
  if (error) return 0;
  return data?.length ?? 0;
}
