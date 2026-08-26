import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { giftCertificateOffer } from "@/lib/gift-certificate/gift-certificate-rpc";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/me/gift-certificates/transfers/offer */
export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const instanceId = String(body.instanceId ?? "").trim();
  const recipientUserId = String(body.recipientUserId ?? "").trim();
  const roomIdRaw = String(body.roomId ?? "").trim();
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  if (!instanceId || !recipientUserId || !idempotencyKey) {
    return NextResponse.json(
      { ok: false, error: "instanceId_recipientUserId_idempotencyKey_required" },
      { status: 400 }
    );
  }

  const result = await giftCertificateOffer(sb, {
    senderUserId: userId,
    instanceId,
    recipientUserId,
    roomId: roomIdRaw || null,
    idempotencyKey,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.data ?? {}) },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, ...result.data });
}
