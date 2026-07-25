import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { markNotificationThreadRead } from "@/lib/notifications/pipeline/notify-read-service";
import {
  domainBadgeReadMutationAckFields,
  issueDomainBadgeAuthorityForAck,
} from "@/lib/notifications/pipeline/domain-badge-read-ack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READ_THREAD_TYPES = new Set(["chat_room", "trade_room", "order", "community_post", "call"]);
const READ_REASONS = new Set([
  "chat_room_visible",
  "push_tap_room_opened",
  "order_detail_opened",
  "trade_detail_opened",
  "community_post_opened",
  "call_history_opened",
]);

function normalizeCategories(value: unknown, threadType: string): string[] {
  const explicit = Array.isArray(value)
    ? value.map((v) => String(v ?? "").trim()).filter(Boolean)
    : [];
  if (explicit.length > 0) return [...new Set(explicit)];
  switch (threadType) {
    case "trade_room":
      return ["trade_message"];
    case "order":
      return ["order_status", "delivery_status"];
    case "community_post":
      return ["community_activity"];
    case "call":
      return ["missed_call"];
    case "chat_room":
    default:
      return ["chat_message", "group_message"];
  }
}

export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  let body: {
    threadType?: string;
    threadId?: string;
    roomId?: string;
    categories?: string[];
    readReason?: string;
    lastVisibleMessageId?: string;
    clientVisibleAt?: string;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const threadType = String(body.threadType ?? "chat_room").trim();
  if (!READ_THREAD_TYPES.has(threadType)) {
    return NextResponse.json({ ok: false, error: "invalid_thread_type" }, { status: 400 });
  }
  const readReason = String(body.readReason ?? "chat_room_visible").trim();
  if (!READ_REASONS.has(readReason)) {
    return NextResponse.json({ ok: false, error: "invalid_read_reason" }, { status: 400 });
  }
  const threadId = String(body.threadId ?? body.roomId ?? "").trim();
  if (!threadId) {
    return NextResponse.json({ ok: false, error: "thread_id_required" }, { status: 400 });
  }

  const categories = normalizeCategories(body.categories, threadType);
  const cleared = await markNotificationThreadRead(sb, userId, threadId, {
    categories,
    threadType,
    readReason,
  });
  /** P3-a: Generation Owner — one Domain rebuild on ACK. */
  const domain = await issueDomainBadgeAuthorityForAck(sb, userId);
  return NextResponse.json({
    ok: true,
    cleared,
    updatedNotificationEventCount: cleared,
    updatedParticipantUnreadCount: null,
    threadUnreadAfter: null,
    affectedThreadId: threadId,
    threadType,
    readReason,
    categories,
    ...domainBadgeReadMutationAckFields(domain),
  });
}
