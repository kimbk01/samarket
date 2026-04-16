import webpush from "web-push";
import { getSiteOrigin } from "@/lib/env/runtime";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { ensureWebPushVapidConfigured } from "@/lib/push/web-push-config";

const MAX_BYTES = 3500;

type PushRow = {
  id: string;
  endpoint: string;
  key_p256dh: string;
  key_auth: string;
};

function buildPayload(out: NotificationSideEffectPayloadOut): string {
  const origin = getSiteOrigin();
  const icon = origin ? `${origin}/icon` : "/icon";
  const url = out.link_url_absolute ?? (origin ? `${origin}/` : "/");
  const tag = `kasama-${out.user_id.slice(0, 8)}-${out.occurred_at}`;
  const body: Record<string, unknown> = {
    title: out.title,
    body: out.body ?? "",
    url,
    icon,
    tag,
    notification_type: out.notification_type,
  };
  const metaObj = out.meta && typeof out.meta === "object" ? (out.meta as Record<string, unknown>) : null;
  if (
    out.notification_type === "chat" &&
    metaObj &&
    metaObj.kind === "community_chat" &&
    typeof metaObj.room_id === "string" &&
    metaObj.room_id.trim()
  ) {
    const rid = metaObj.room_id.trim();
    body.notification_type = "community_messenger_message";
    body.roomId = rid;
    body.tag = `samarket-message-room-${rid}`;
  }
  if (out.meta && typeof out.meta === "object") {
    const sid = (out.meta as Record<string, unknown>).session_id ?? (out.meta as Record<string, unknown>).sessionId;
    if (typeof sid === "string" && sid.trim()) body.sessionId = sid.trim();
    const kind = (out.meta as Record<string, unknown>).kind ?? (out.meta as Record<string, unknown>).call_kind;
    if (typeof kind === "string" && kind.trim()) body.kind = kind.trim();
  }
  if (
    out.notification_type === "community_messenger_incoming_call" &&
    typeof body.sessionId === "string" &&
    body.sessionId.trim()
  ) {
    const sid = body.sessionId.trim();
    body.tag = `samarket-incoming-call-${sid}`;
    body.call_push_kind = "incoming_call";
  }
  let s = JSON.stringify(body);
  if (s.length <= MAX_BYTES) return s;
  const trim = { ...body, title: String(out.title).slice(0, 80), body: (out.body ?? "").slice(0, 160) };
  s = JSON.stringify(trim);
  if (s.length <= MAX_BYTES) return s;
  return JSON.stringify({
    title: String(out.title).slice(0, 40),
    body: "",
    url,
    icon,
    tag,
    notification_type: out.notification_type,
  });
}

function webPushErrorStatus(e: unknown): number | undefined {
  if (e && typeof e === "object" && "statusCode" in e) {
    const n = (e as { statusCode?: unknown }).statusCode;
    return typeof n === "number" ? n : undefined;
  }
  return undefined;
}

/**
 * 인앱 알림 저장 직후 — 해당 사용자의 등록된 브라우저로 Web Push 전송.
 * service_role 로 구독 목록 조회·만료 행 삭제.
 */
export async function sendWebPushNotificationsForUser(out: NotificationSideEffectPayloadOut): Promise<void> {
  if (process.env.WEB_PUSH_ENABLED !== "1") return;
  if (!ensureWebPushVapidConfigured()) return;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) return;

  const { data: rows, error } = await svc
    .from("web_push_subscriptions")
    .select("id, endpoint, key_p256dh, key_auth")
    .eq("user_id", out.user_id);

  if (error) {
    if (error.message?.includes("does not exist") || error.code === "42P01") {
      return;
    }
    console.error("[sendWebPushNotificationsForUser] select", error.message);
    return;
  }

  const list = (rows ?? []) as PushRow[];
  if (!list.length) return;

  const payload = buildPayload(out);

  for (const row of list) {
    const subscription = {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.key_p256dh,
        auth: row.key_auth,
      },
    };
    try {
      await webpush.sendNotification(subscription, payload, {
        TTL: 86_400,
        urgency: "high",
      });
    } catch (e: unknown) {
      const status = webPushErrorStatus(e);
      if (status === 404 || status === 410) {
        await svc.from("web_push_subscriptions").delete().eq("id", row.id);
      } else {
        console.error("[sendWebPushNotificationsForUser] send", status ?? e);
      }
    }
  }
}
