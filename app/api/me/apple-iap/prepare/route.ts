import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { readAppleIapServerConfig } from "@/lib/apple-iap/apple-iap-config.server";
import { appleIapIsUuid } from "@/lib/apple-iap/apple-iap-contract";
import { prepareAppleIapAttempt } from "@/lib/apple-iap/apple-iap-service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/apple-iap/prepare — Apple 결제 시작 전 준비 기록 (attemptId = StoreKit appAccountToken).
 * body: { kind: "point" | "cash", productId, storeId?, clientKey }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  if (!readAppleIapServerConfig()) {
    return NextResponse.json({ ok: false, error: "apple_iap_unconfigured" }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const kind = body.kind === "point" || body.kind === "cash" ? body.kind : null;
  const productId = String(body.productId ?? "").trim();
  const clientKey = String(body.clientKey ?? "").trim().slice(0, 200);
  const storeIdRaw = String(body.storeId ?? "").trim();
  const storeId = kind === "cash" ? storeIdRaw : null;
  if (!kind || !productId || (kind === "cash" && !appleIapIsUuid(storeId))) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  if (clientKey.length < 8) {
    return NextResponse.json({ ok: false, error: "idempotency_required" }, { status: 400 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  try {
    const r = await prepareAppleIapAttempt(sb, { userId: auth.userId, kind, productId, storeId, clientKey });
    if (r.ok !== true) {
      const error = String(r.error ?? "prepare_failed");
      const status = error === "not_store_owner" ? 403 : error === "forbidden" ? 500 : 409;
      return NextResponse.json(
        { ok: false, error, attemptId: r.attempt_id ?? null, capMinor: r.cap_minor ?? null, usedMinor: r.used_minor ?? null },
        { status }
      );
    }
    return NextResponse.json({
      ok: true,
      attemptId: String(r.attempt_id),
      productId: String(r.product_id),
      status: String(r.status),
      idempotent: r.idempotent === true,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
