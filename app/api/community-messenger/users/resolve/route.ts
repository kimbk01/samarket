import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { resolveCommunityMessengerUserForSocial } from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { pickFriendSource } from "@/lib/community-messenger/friend-qr/friend-qr-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:users-resolve:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "사용자 조회 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_users_resolve_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_role_required" }, { status: 503 });
  }
  const signupGate = await requireSignupCompleteForUser(sb, auth.userId);
  if (!signupGate.ok) return signupGate.response;

  const publicId = req.nextUrl.searchParams.get("publicId") ?? req.nextUrl.searchParams.get("q") ?? "";
  const targetUserId = req.nextUrl.searchParams.get("targetUserId") ?? "";

  const result = await resolveCommunityMessengerUserForSocial(auth.userId, {
    publicId: publicId || undefined,
    targetUserId: targetUserId || undefined,
  });

  if (!result.ok || !result.profile) {
    const status = result.error === "user_not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.error ?? "not_found" }, { status });
  }

  const p = result.profile;
  /**
   * 친구가 된 경로 — 둘 사이 수락된 요청 중 가장 최근 수락(responded_at)의 source (「QR로 추가」 배지, 재감사 N2).
   * QR 추가는 스캔한 쪽 행(source qr)과 반대쪽 대기 행을 같은 시각에 수락하므로, 같은 시각이면 qr 을 고른다 (PR #149 리뷰).
   */
  let friendSource: string | null = null;
  if (p.isFriend) {
    const { data: rows } = await sb
      .from("community_friend_requests")
      .select("source, responded_at")
      .eq("status", "accepted")
      .or(
        `and(requester_id.eq.${auth.userId},addressee_id.eq.${p.id}),and(requester_id.eq.${p.id},addressee_id.eq.${auth.userId})`,
      )
      .limit(2);
    friendSource = pickFriendSource((rows ?? []) as Array<{ source?: string | null; responded_at?: string | null }>);
  }
  return NextResponse.json({
    ok: true,
    profile: {
      id: p.id,
      display_name: p.label,
      avatar_url: p.avatarUrl,
      public_id: p.publicId ? `@${p.publicId.replace(/^@/, "")}` : p.subtitle ?? null,
      /** §16: 상대가 쓴 상태(프로필 bio) — 프로필 시트 표시용, 읽기만 */
      bio: p.bio?.trim() || null,
      is_friend: p.isFriend,
      is_blocked_by_me: p.isBlockedByMe,
      can_message: p.canMessage,
      can_call: p.canCall,
      friend_source: friendSource,
    },
  });
}
