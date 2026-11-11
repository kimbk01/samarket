import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { resolveCommunityMessengerUserForSocial } from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

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
  /** 친구가 된 경로 — 둘 사이 수락된 요청의 source (「QR로 추가」 배지, 재감사 N2) */
  let friendSource: string | null = null;
  if (p.isFriend) {
    const { data: req } = await sb
      .from("community_friend_requests")
      .select("source")
      .eq("status", "accepted")
      .or(
        `and(requester_id.eq.${auth.userId},addressee_id.eq.${p.id}),and(requester_id.eq.${p.id},addressee_id.eq.${auth.userId})`,
      )
      .order("responded_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    friendSource = typeof req?.source === "string" ? req.source : null;
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
