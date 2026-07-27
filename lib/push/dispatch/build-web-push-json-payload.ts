import { DIBAY_APP_ICON_512_PATH, dibayBrandAssetUrl } from "@/lib/brand/brand-asset-paths";
import { getSiteOrigin } from "@/lib/env/runtime";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { buildFcmDataFields } from "@/lib/push/dispatch/fcm-data-payload-contract";
import type { BuiltPushPayload, DispatchPushOptions } from "@/lib/push/dispatch/push-payload-types";

const MAX_BYTES = 3500;

function isCallTerminalDismissKind(kind: unknown): kind is "call_canceled" | "call_rejected" | "call_ended" | "missed_call" {
  return (
    kind === "call_canceled" ||
    kind === "call_rejected" ||
    kind === "call_ended" ||
    kind === "missed_call"
  );
}

export function buildWebPushJsonPayload(
  out: NotificationSideEffectPayloadOut,
  opts?: DispatchPushOptions
): BuiltPushPayload {
  const origin = getSiteOrigin();
  const iconPath = dibayBrandAssetUrl(DIBAY_APP_ICON_512_PATH);
  const icon = origin ? `${origin}${iconPath}` : iconPath;
  const absoluteUrl = out.link_url_absolute ?? (origin ? `${origin}/` : "/");
  const tag = `kasama-${out.user_id.slice(0, 8)}-${out.occurred_at}`;
  const base: Record<string, unknown> = {
    title: out.title,
    body: out.body ?? "",
    url: absoluteUrl,
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
    base.notification_type = "community_messenger_message";
    base.roomId = rid;
    base.tag = `samarket-message-room-${rid}`;
  }

  if (out.meta && typeof out.meta === "object") {
    const sid = (out.meta as Record<string, unknown>).session_id ?? (out.meta as Record<string, unknown>).sessionId;
    if (typeof sid === "string" && sid.trim()) base.sessionId = sid.trim();
    const kind = (out.meta as Record<string, unknown>).kind ?? (out.meta as Record<string, unknown>).call_kind;
    if (typeof kind === "string" && kind.trim()) base.kind = kind.trim();
  }

  if (
    out.notification_type === "community_messenger_incoming_call" &&
    typeof base.sessionId === "string" &&
    base.sessionId.trim()
  ) {
    const sid = base.sessionId.trim();
    base.tag = `samarket-incoming-call-${sid}`;
    base.call_push_kind = opts?.call_push_kind ?? "incoming_call";
  }

  if (
    out.notification_type === "community_messenger_missed_call" &&
    typeof base.sessionId === "string" &&
    base.sessionId.trim()
  ) {
    const sid = base.sessionId.trim();
    base.tag = `samarket-missed-call-${sid}`;
    base.call_push_kind = opts?.call_push_kind ?? "missed_call";
  }

  if (isCallTerminalDismissKind(opts?.call_push_kind) && typeof base.sessionId === "string" && base.sessionId.trim()) {
    base.call_push_kind = opts.call_push_kind;
    base.tag = `samarket-incoming-call-${base.sessionId.trim()}`;
    base.title = base.title ?? "통화";
    base.body = "";
  }

  const body = buildFcmDataFields(out, opts, base);
  const callPushKind = body.call_push_kind;
  const isCallRelatedPush =
    callPushKind === "incoming_call" || isCallTerminalDismissKind(callPushKind);

  let s = JSON.stringify(body);
  if (s.length <= MAX_BYTES) {
    return { json: s, data: body, is_call: isCallRelatedPush };
  }
  const trim: Record<string, unknown> = {
    ...body,
    title: String(out.title).slice(0, 80),
    body: (out.body ?? "").slice(0, 160),
  };
  s = JSON.stringify(trim);
  if (s.length <= MAX_BYTES) {
    return {
      json: s,
      data: trim,
      is_call: trim.call_push_kind === "incoming_call" || isCallTerminalDismissKind(trim.call_push_kind),
    };
  }
  const minimal = buildFcmDataFields(out, opts, {
    title: String(out.title).slice(0, 40),
    body: "",
    url: absoluteUrl,
    icon,
    tag,
    notification_type: out.notification_type,
    ...(opts?.call_push_kind ? { call_push_kind: opts.call_push_kind } : {}),
  });
  return {
    json: JSON.stringify(minimal),
    data: minimal,
    is_call:
      opts?.call_push_kind === "incoming_call" || isCallTerminalDismissKind(opts?.call_push_kind),
  };
}
