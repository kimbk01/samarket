import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { readAppleIapServerConfig } from "@/lib/apple-iap/apple-iap-config.server";
import { appleIapIsUuid } from "@/lib/apple-iap/apple-iap-contract";
import {
  listActiveAppleIapProducts,
  listAppleIapAttentionAttempts,
  loadAppleIapAttemptForUser,
} from "@/lib/apple-iap/apple-iap-service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/apple-iap/status?kind=point|cash&storeId=&attemptId=
 * 판매 중 상품 · 계속 보여야 하는 거래(승인 대기·지급 확인 중·검토·환불 검토) · 지정 거래 상태.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") === "cash" ? "cash" : sp.get("kind") === "point" ? "point" : null;
  if (!kind) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const storeIdRaw = (sp.get("storeId") ?? "").trim();
  const storeId = kind === "cash" && appleIapIsUuid(storeIdRaw) ? storeIdRaw : null;
  if (kind === "cash" && !storeId) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const attemptIdRaw = (sp.get("attemptId") ?? "").trim().toLowerCase();

  if (!readAppleIapServerConfig()) {
    return NextResponse.json({ ok: true, configured: false, products: [], attention: [], attempt: null });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  try {
    const [products, attention, attempt] = await Promise.all([
      listActiveAppleIapProducts(sb, kind),
      listAppleIapAttentionAttempts(sb, { userId: auth.userId, kind, storeId }),
      appleIapIsUuid(attemptIdRaw) ? loadAppleIapAttemptForUser(sb, attemptIdRaw, auth.userId) : Promise.resolve(null),
    ]);
    return NextResponse.json({ ok: true, configured: true, products, attention, attempt });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
