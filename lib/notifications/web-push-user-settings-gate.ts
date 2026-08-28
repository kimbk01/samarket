import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { resolveEffectiveNotificationPreference } from "@/lib/notifications/policy/effective-notification-preference";
import type { NormalizedNotificationPreferenceSnapshot } from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import { getNotificationPreferencePolicy } from "@/lib/notifications/policy/notification-preference-policy-registry";
import type { NotificationPreferenceRecipientRole } from "@/lib/notifications/policy/notification-preference-policy-types";
import { readNormalizedNotificationPreferenceSnapshot } from "@/lib/notifications/policy/notification-preference-storage-reader.server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 인박스·푸시 라우팅용 (DB notifications.push_kind 와 정렬) */
export type WebPushKind = "chat" | "trade" | "delivery" | "community" | "notice" | "marketing" | "system";

type UserNotifRow = {
  service_enabled?: boolean | null;
  trade_chat_enabled?: boolean | null;
  community_chat_enabled?: boolean | null;
  order_enabled?: boolean | null;
  store_enabled?: boolean | null;
  trade_events_enabled?: boolean | null;
  community_social_enabled?: boolean | null;
  notice_enabled?: boolean | null;
  marketing_enabled?: boolean | null;
  quiet_hours_enabled?: boolean | null;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
};

type UserSettingsPushRow = {
  push_enabled?: boolean | null;
  chat_push_enabled?: boolean | null;
  marketing_push_enabled?: boolean | null;
  do_not_disturb_enabled?: boolean | null;
  do_not_disturb_start?: string | null;
  do_not_disturb_end?: string | null;
};

function resolvePushKind(out: NotificationSideEffectPayloadOut): WebPushKind {
  const meta =
    out.meta && typeof out.meta === "object" ? (out.meta as Record<string, unknown>) : null;
  const explicit = meta?.push_kind;
  if (
    typeof explicit === "string" &&
    ["chat", "trade", "delivery", "community", "notice", "marketing", "system"].includes(explicit)
  ) {
    return explicit as WebPushKind;
  }
  const nt = String(out.notification_type ?? "").toLowerCase();
  if (nt === "community_messenger_incoming_call") return "chat";
  if (nt === "community_messenger_missed_call") return "chat";
  if (nt === "chat") return "chat";
  if (nt === "commerce") return "delivery";
  if (nt === "system") return "system";
  if (nt === "report") return "community";
  return "trade";
}

const QUIET_TZ = process.env.NOTIFICATION_QUIET_TZ?.trim() || "Asia/Manila";

function minutesAtInTz(d: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

function parseHHMM(s: string | null | undefined): number | null {
  if (!s || typeof s !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function inQuietWindow(now: Date, startMin: number | null, endMin: number | null): boolean {
  if (startMin == null || endMin == null) return false;
  const cur = minutesAtInTz(now, QUIET_TZ);
  if (startMin === endMin) return false;
  if (startMin < endMin) {
    return cur >= startMin && cur < endMin;
  }
  return cur >= startMin || cur < endMin;
}

function metaRecord(out: NotificationSideEffectPayloadOut): Record<string, unknown> | null {
  return out.meta && typeof out.meta === "object" ? (out.meta as Record<string, unknown>) : null;
}

function metaKindFromOut(out: NotificationSideEffectPayloadOut): string | null {
  const meta = metaRecord(out);
  const kind = typeof meta?.kind === "string" ? meta.kind.trim() : "";
  return kind.length > 0 ? kind : null;
}

function receiverRoleFromOut(out: NotificationSideEffectPayloadOut): string | null {
  const meta = metaRecord(out);
  const raw = meta?.receiverRole ?? meta?.recipientRole;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** Maps side-effect payload to canonical event type for P2-A2 lookup. */
export function resolveWebPushPreferenceEventType(out: NotificationSideEffectPayloadOut): string | null {
  const meta = metaRecord(out);
  if (typeof meta?.event_type === "string" && meta.event_type.trim()) {
    return meta.event_type.trim();
  }
  if (typeof meta?.notification_event_type === "string" && meta.notification_event_type.trim()) {
    return meta.notification_event_type.trim();
  }

  const nt = String(out.notification_type ?? "").trim().toLowerCase();
  if (nt === "community_messenger_missed_call") return "missed_call";
  if (nt === "community_messenger_incoming_call") return "incoming_call_signal";
  if (nt === "commerce") return "order_status";
  if (nt === "marketing") return "admin_marketing_banner";
  if (nt === "report") return "community_activity";
  if (nt === "trade") return "trade_status";
  if (nt === "chat") {
    const kind = metaKindFromOut(out);
    if (kind === "trade_chat") return "trade_message";
    if (kind === "group_chat") return "group_message";
    if (kind === "store_order_message") return "store_order_message";
    return "chat_message";
  }
  if (nt === "system") {
    const kind = metaKindFromOut(out);
    if (kind === "notice_published" || kind === "inquiry_answered" || kind === "admin_notice") {
      return kind;
    }
    return "admin_notice";
  }
  return nt || null;
}

/**
 * Owner push remains on legacy path until a dedicated Owner cutover.
 * Member is the default when role cannot be proven owner-scoped.
 */
export function resolveWebPushPreferenceRecipientRole(
  out: NotificationSideEffectPayloadOut
): NotificationPreferenceRecipientRole {
  const receiverRole = receiverRoleFromOut(out);
  if (receiverRole === "owner") return "owner";

  const metaKind = metaKindFromOut(out);
  const eventType = resolveWebPushPreferenceEventType(out);

  if (metaKind) {
    if (receiverRole === "user" || receiverRole === "member" || receiverRole === "customer") {
      return "member";
    }

    const withOwnerRole = getNotificationPreferencePolicy({
      metaKind,
      eventType,
      recipientRole: "owner",
    });
    if (withOwnerRole.resolutionSource === "meta_kind_recipient_override") {
      return "owner";
    }

    const policy = getNotificationPreferencePolicy({ metaKind, eventType });
    if (policy.resolutionSource === "meta_kind_override" && policy.recipientRole === "owner") {
      return "owner";
    }
  }

  if (eventType) {
    const ownerScoped = getNotificationPreferencePolicy({
      eventType,
      recipientRole: "owner",
    });
    if (
      ownerScoped.resolutionSource === "event_recipient_override" &&
      ownerScoped.recipientRole === "owner" &&
      receiverRole === "owner"
    ) {
      return "owner";
    }
  }

  return "member";
}

export function deriveWebPushKind(out: NotificationSideEffectPayloadOut): WebPushKind {
  return resolvePushKind(out);
}

/** Pure member push decision — P2-A4 snapshot + P2-A3 resolver. */
export function resolveMemberWebPushFromPreferences(
  out: NotificationSideEffectPayloadOut,
  preferences: NormalizedNotificationPreferenceSnapshot,
  now: Date = new Date()
): boolean {
  return resolveEffectiveNotificationPreference({
    eventType: resolveWebPushPreferenceEventType(out),
    metaKind: metaKindFromOut(out),
    recipientRole: "member",
    pushKind: deriveWebPushKind(out),
    preferences,
    now,
  }).sendPush;
}

/** Legacy owner push gate — preserved verbatim semantics (incl. system bypass). */
async function shouldSendLegacyWebPushForUser(
  svc: SupabaseClient,
  userId: string,
  out: NotificationSideEffectPayloadOut
): Promise<boolean> {
  const kind = resolvePushKind(out);
  if (kind === "system") return true;

  const [{ data: ns }, { data: us }] = await Promise.all([
    svc
      .from("user_notification_settings")
      .select(
        "service_enabled, trade_chat_enabled, community_chat_enabled, order_enabled, store_enabled, trade_events_enabled, community_social_enabled, notice_enabled, marketing_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end"
      )
      .eq("user_id", userId)
      .maybeSingle(),
    svc
      .from("user_settings")
      .select(
        "push_enabled, chat_push_enabled, marketing_push_enabled, do_not_disturb_enabled, do_not_disturb_start, do_not_disturb_end"
      )
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const n = (ns ?? {}) as UserNotifRow;
  const u = (us ?? {}) as UserSettingsPushRow;

  const masterPush = u.push_enabled !== false;
  const serviceOn = n.service_enabled !== false;
  if (!masterPush || !serviceOn) {
    return false;
  }

  const qhDb =
    n.quiet_hours_enabled === true &&
    inQuietWindow(new Date(), parseHHMM(n.quiet_hours_start ?? null), parseHHMM(n.quiet_hours_end ?? null));
  const qhUs =
    u.do_not_disturb_enabled === true &&
    inQuietWindow(new Date(), parseHHMM(u.do_not_disturb_start ?? null), parseHHMM(u.do_not_disturb_end ?? null));
  if (qhDb || qhUs) {
    return false;
  }

  const meta = metaRecord(out);
  const chatKind = typeof meta?.kind === "string" ? meta.kind : "";

  switch (kind) {
    case "marketing":
      return u.marketing_push_enabled === true && n.marketing_enabled === true;
    case "chat": {
      const chatMaster = u.chat_push_enabled !== false;
      if (!chatMaster) return false;
      if (chatKind === "community_chat" || chatKind === "community_messenger") {
        return n.community_chat_enabled !== false;
      }
      return n.trade_chat_enabled !== false;
    }
    case "delivery":
      return n.order_enabled !== false;
    case "community":
      return n.community_social_enabled !== false;
    case "notice":
      return n.notice_enabled !== false;
    case "trade":
      return n.trade_events_enabled !== false;
    default:
      return true;
  }
}

async function shouldSendMemberWebPushForUser(
  svc: SupabaseClient,
  userId: string,
  out: NotificationSideEffectPayloadOut
): Promise<boolean> {
  const now = new Date();
  const preferences = await readNormalizedNotificationPreferenceSnapshot(userId, { now }, svc);
  return resolveMemberWebPushFromPreferences(out, preferences, now);
}

/**
 * Web Push 발송 전 사용자 설정·방해금지·마케팅 동의를 적용한다.
 * Member: P2-A4 read authority → P2-A3 resolver → P2-A2 policy.
 * Owner: legacy path unchanged until dedicated Owner cutover.
 */
export async function shouldSendWebPushForUser(
  svc: SupabaseClient,
  userId: string,
  out: NotificationSideEffectPayloadOut
): Promise<boolean> {
  const recipientRole = resolveWebPushPreferenceRecipientRole(out);
  if (recipientRole === "owner") {
    return shouldSendLegacyWebPushForUser(svc, userId, out);
  }
  return shouldSendMemberWebPushForUser(svc, userId, out);
}
