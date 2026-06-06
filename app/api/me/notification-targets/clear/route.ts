import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { clearNotificationTarget } from "@/lib/notifications/notification-targets";
import type { NotificationTargetType } from "@/lib/notifications/badge-target-policy";
import { jsonError, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set<NotificationTargetType>([
  "community_post",
  "buyer_order",
  "owner_order",
  "trade",
  "chat_room",
  "owner_order_chat",
  "store_review",
  "store_inquiry",
  "rider_dispatch",
  "system",
]);

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;

  const parsed = await parseJsonBody<{ targetType?: string; targetId?: string; storeId?: string | null }>(
    req,
    "JSON 필요"
  );
  if (!parsed.ok) return parsed.response;

  const targetType = parsed.value.targetType?.trim() ?? "";
  const targetId = parsed.value.targetId?.trim() ?? "";
  if (!targetType || !targetId) {
    return jsonError("targetType과 targetId가 필요합니다.", 400);
  }
  if (!ALLOWED_TYPES.has(targetType as NotificationTargetType)) {
    return jsonError("지원하지 않는 targetType입니다.", 400);
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  await clearNotificationTarget(sb, {
    userId: auth.userId,
    targetType: targetType as NotificationTargetType,
    targetId,
    storeId: parsed.value.storeId?.trim() || null,
  });

  return NextResponse.json({ ok: true });
}
