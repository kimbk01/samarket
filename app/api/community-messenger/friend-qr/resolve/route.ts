import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { resolveFriendQrForViewer } from "@/lib/community-messenger/friend-qr/friend-qr.server";
import { publicFriendQrErrorCode } from "@/lib/community-messenger/friend-qr/friend-qr-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 스캔 결과 미리보기 — 설계안 v3 §3.6 · 시안 D. 실패는 코드만 (화면 문구는 하나) */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-qr-resolve:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    code: "community_messenger_friend_qr_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_service_role_required" }, { status: 503 });
  const signupGate = await requireSignupCompleteForUser(sb, auth.userId);
  if (!signupGate.ok) return signupGate.response;

  const token = req.nextUrl.searchParams.get("token") ?? "";
  const res = await resolveFriendQrForViewer(auth.userId, token);
  /** 이유를 밝히지 않는다 (설계 §3.6 · 재감사 L1) — 본인 QR 만 따로 */
  if (!res.ok) return NextResponse.json({ ok: false, error: publicFriendQrErrorCode(res.error) }, { status: 404 });
  return NextResponse.json({ ok: true, preview: res.preview });
}
