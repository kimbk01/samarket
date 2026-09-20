import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { reconcileGuestPromotionLifecycle } from "@/lib/platform-promotion-lifecycle/reconcile-guest-lifecycle";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform-promotion/reconcile-guest
 * Authenticated only. Copies THIS device's guest lifecycle rows onto the member.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { deviceKey?: string };
  const deviceKey = String(body.deviceKey ?? "").trim();
  if (!deviceKey) {
    return NextResponse.json({ ok: false, error: "missing_device_key" }, { status: 400 });
  }

  const result = await reconcileGuestPromotionLifecycle(sb, { userId, anonymousDeviceKey: deviceKey });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    suppressionsCopied: result.suppressionsCopied,
    visitsCopied: result.visitsCopied,
  });
}
