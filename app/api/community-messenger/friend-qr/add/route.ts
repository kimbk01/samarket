import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { addFriendViaQr } from "@/lib/community-messenger/friend-qr/friend-qr.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** QR 로 바로 친구 — 설계안 v3 §3.6. 친구 요청과 같은 가입·필수 항목 확인 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-qr-add:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    code: "community_messenger_friend_qr_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_service_role_required" }, { status: 503 });
  const signupGate = await requireSignupCompleteForUser(sb, auth.userId);
  if (!signupGate.ok) return signupGate.response;
  const profileGate = await requireProfileFieldsForAction(sb, auth.userId, "messenger_add_friend");
  if (!profileGate.ok) return profileGate.response;

  let body: { token?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const res = await addFriendViaQr(auth.userId, token);
  if (!res.ok) {
    const status = res.error === "qr_self" ? 400 : res.error === "supabase_unavailable" ? 503 : 404;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }
  return NextResponse.json({ ok: true, peerUserId: res.peerUserId, alreadyFriend: res.alreadyFriend });
}
