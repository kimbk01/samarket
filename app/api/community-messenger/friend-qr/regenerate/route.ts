import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { regenerateMyFriendQr } from "@/lib/community-messenger/friend-qr/friend-qr.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** QR 다시 만들기 — 옛 QR 즉시 무효 (설계안 v3 §3.6) */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-qr-regenerate:${getRateLimitKey(req, auth.userId)}`,
    limit: 10,
    windowMs: 60_000,
    code: "community_messenger_friend_qr_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_service_role_required" }, { status: 503 });
  const signupGate = await requireSignupCompleteForUser(sb, auth.userId);
  if (!signupGate.ok) return signupGate.response;

  const res = await regenerateMyFriendQr(auth.userId);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, qr: res.qr });
}
