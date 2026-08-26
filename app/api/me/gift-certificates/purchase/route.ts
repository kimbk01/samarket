import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { giftCertificatePurchase } from "@/lib/gift-certificate/gift-certificate-rpc";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/me/gift-certificates/purchase — { productId, idempotencyKey } */
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

  const productId = String(body.productId ?? "").trim();
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  if (!productId || !idempotencyKey) {
    return NextResponse.json(
      { ok: false, error: "productId_and_idempotencyKey_required" },
      { status: 400 }
    );
  }

  const result = await giftCertificatePurchase(sb, {
    buyerUserId: userId,
    productId,
    idempotencyKey,
  });
  if (!result.ok) {
    const code = result.error;
    const status =
      code === "insufficient_balance"
        ? 402
        : code === "product_not_found"
          ? 404
          : code === "forbidden"
            ? 403
            : 400;
    return NextResponse.json(
      { ok: false, error: code, ...(result.data ?? {}) },
      { status }
    );
  }
  return NextResponse.json({ ok: true, ...result.data });
}
