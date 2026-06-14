import { DIBAY_APP_ICON_512_PATH, dibayBrandAssetUrl } from "@/lib/brand/brand-asset-paths";
import { getSiteOrigin } from "@/lib/env/runtime";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import type { BuiltPushPayload, DispatchPushOptions } from "@/lib/push/dispatch/push-payload-types";

const MAX_BYTES = 3500;

export function buildWebPushJsonPayload(
  out: NotificationSideEffectPayloadOut,
  opts?: DispatchPushOptions
): BuiltPushPayload {
  const origin = getSiteOrigin();
  const iconPath = dibayBrandAssetUrl(DIBAY_APP_ICON_512_PATH);
  const icon = origin ? `${origin}${iconPath}` : iconPath;
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
    body.call_push_kind = opts?.call_push_kind ?? "incoming_call";
  }

  if (
    out.notification_type === "community_messenger_missed_call" &&
    typeof body.sessionId === "string" &&
    body.sessionId.trim()
  ) {
    const sid = body.sessionId.trim();
    body.tag = `samarket-missed-call-${sid}`;
    body.call_push_kind = opts?.call_push_kind ?? "missed_call";
  }

  if (opts?.call_push_kind === "call_canceled" && typeof body.sessionId === "string" && body.sessionId.trim()) {
    body.call_push_kind = "call_canceled";
    body.tag = `samarket-incoming-call-${body.sessionId.trim()}`;
    body.title = body.title ?? "통화";
    body.body = "";
  }

  const isIncomingCall = body.call_push_kind === "incoming_call";

  let s = JSON.stringify(body);
  if (s.length <= MAX_BYTES) {
    return { json: s, data: body, is_call: isIncomingCall };
  }
  const trim: Record<string, unknown> = {
    ...body,
    title: String(out.title).slice(0, 80),
    body: (out.body ?? "").slice(0, 160),
  };
  s = JSON.stringify(trim);
  if (s.length <= MAX_BYTES) {
    return { json: s, data: trim, is_call: trim.call_push_kind === "incoming_call" };
  }
  const minimal = {
    title: String(out.title).slice(0, 40),
    body: "",
    url,
    icon,
    tag,
    notification_type: out.notification_type,
    ...(opts?.call_push_kind ? { call_push_kind: opts.call_push_kind } : {}),
  };
  return {
    json: JSON.stringify(minimal),
    data: minimal,
    is_call: opts?.call_push_kind === "incoming_call",
  };
}
