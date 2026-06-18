import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateNotificationEventInput,
  NotificationEventRow,
} from "@/lib/notifications/core/notification-event-schema";
import type { NotificationBadgeCount } from "@/lib/notifications/core/notification-event-types";
import { categoryForEventType } from "@/lib/notifications/core/notification-policy";

const EMPTY_BADGE: NotificationBadgeCount = {
  total: 0,
  chat: 0,
  group: 0,
  trade: 0,
  store: 0,
  missedCall: 0,
};

function mapBadgeRpc(raw: Record<string, unknown> | null): NotificationBadgeCount {
  if (!raw) return EMPTY_BADGE;
  const chat = Math.max(0, Math.floor(Number(raw.chat) || 0));
  const group = Math.max(0, Math.floor(Number(raw.group) || 0));
  const trade = Math.max(0, Math.floor(Number(raw.trade) || 0));
  const store = Math.max(0, Math.floor(Number(raw.store) || 0));
  const missedCall = Math.max(0, Math.floor(Number(raw.missed_call) || 0));
  return {
    chat,
    group,
    trade,
    store,
    missedCall,
    total: chat + group + trade + store + missedCall,
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
    unread: input.unread !== false,
    muted_snapshot: input.mutedSnapshot === true,
    push_suppressed_reason: input.pushSuppressedReason ?? null,
    sound_suppressed_reason: input.soundSuppressedReason ?? null,
    delivered_at: input.deliveredAt ?? new Date().toISOString(),
    dedupe_key: dedupeKey,
  };

  const { data, error } = await sb.from("notification_events").insert(insert).select("*").single();
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return { ok: false, error: "duplicate", duplicate: true };
    return { ok: false, error: String(error.message ?? "insert_failed") };
  }
  return { ok: true, row: data as NotificationEventRow };
}

export async function countNotificationEventsBadge(
  sb: SupabaseClient<any>,
  userId: string
): Promise<NotificationBadgeCount> {
  const uid = userId.trim();
  if (!uid) return EMPTY_BADGE;
  const { data, error } = await sb.rpc("count_notification_events_badge", { p_user_id: uid });
  if (error) {
    return countNotificationEventsBadgeFallback(sb, uid);
  }
  return mapBadgeRpc(data as Record<string, unknown> | null);
}

async function countNotificationEventsBadgeFallback(
  sb: SupabaseClient<any>,
  userId: string
): Promise<NotificationBadgeCount> {
  const { data, error } = await sb
    .from("notification_events")
    .select("category")
    .eq("user_id", userId)
    .eq("unread", true)
    .is("read_at", null);
  if (error || !data) return EMPTY_BADGE;
  const counts: Record<string, number> = { chat: 0, group: 0, trade: 0, store: 0, missed_call: 0 };
  for (const row of data as { category?: string }[]) {
    const c = String(row.category ?? "");
    if (c in counts) counts[c] += 1;
  }
  return mapBadgeRpc(counts);
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
