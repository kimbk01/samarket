import { NextRequest, NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { readAppleIapServerConfig } from "@/lib/apple-iap/apple-iap-config.server";
import { processAppleServerNotification } from "@/lib/apple-iap/apple-iap-service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/apple-app-store — App Store Server Notifications V2.
 * 인증 = Apple 서명(JWS) 검증. 200 이 아니면 Apple 이 재전송하므로 일시 오류만 500.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const config = readAppleIapServerConfig();
  const sb = tryCreateSupabaseServiceClient();
  if (!config || !sb) return NextResponse.json({ ok: false, error: "apple_iap_unconfigured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const signedPayload = String(body.signedPayload ?? "").trim();
  if (!signedPayload || signedPayload.length > 100000) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  try {
    const outcome = await processAppleServerNotification(sb, signedPayload, config);
    return NextResponse.json({ ok: outcome.httpStatus === 200, result: outcome.result }, { status: outcome.httpStatus });
  } catch (e) {
    console.error("[apple-app-store-notification]", (e as Error).message);
    return NextResponse.json({ ok: false, error: "temporary_failure" }, { status: 500 });
  }
}
