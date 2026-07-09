import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { readOrderChat, type OrderChatReadRole } from "@/lib/order-domain/read-order-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReadOrderChatBody = {
  orderId?: unknown;
  roomId?: unknown;
  role?: unknown;
  lastReadMessageId?: unknown;
};

function normalizeRole(v: unknown): OrderChatReadRole | undefined {
  if (v === "owner" || v === "customer") return v;
  return undefined;
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

  let body: ReadOrderChatBody = {};
  try {
    body = (await req.json()) as ReadOrderChatBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
  if (!orderId || !roomId) {
    return NextResponse.json({ ok: false, error: "order_id_and_room_id_required" }, { status: 400 });
  }

  const result = await readOrderChat(sb, {
    userId,
    orderId,
    roomId,
    role: normalizeRole(body.role),
    lastReadMessageId: typeof body.lastReadMessageId === "string" ? body.lastReadMessageId : null,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : result.status ?? 500 });
}
