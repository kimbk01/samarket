import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { toggleCommunityMessengerHiddenFriend } from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { invalidateBootstrapLiteSocialDeferredForPair } from "@/lib/community-messenger/bootstrap-lite-social-deferred-cache";
import { publishHomeListSocialGraphChangedToUserBestEffort } from "@/lib/community-messenger/realtime/home-list-room-insert-broadcast-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ friendUserId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-hidden-toggle:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "친구 숨김 변경 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_hidden_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { friendUserId } = await params;
  /** 선택 body `{ hidden: boolean }` — 있으면 멱등 set, 없으면 legacy toggle (구 클라이언트) */
  let desiredHidden: boolean | undefined;
  try {
    const raw = await req.text();
    if (raw.trim()) {
      const body = JSON.parse(raw) as { hidden?: unknown };
      if (typeof body?.hidden === "boolean") desiredHidden = body.hidden;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const result = await toggleCommunityMessengerHiddenFriend(auth.userId, friendUserId, desiredHidden);
  /** lite social 캐시(hiddenIds·favoriteFriendIds) 즉시 무효화 — 다음 lite/full 이 stale 목록을 내지 않게 */
  if (result.ok) {
    invalidateBootstrapLiteSocialDeferredForPair(auth.userId, null);
    /** F-14 — 내 다른 기기에 숨김 변경 전달 (서버 발행 · user_relationships RLS 정책 추가 없음) */
    await publishHomeListSocialGraphChangedToUserBestEffort({
      userId: auth.userId,
      reason: result.isHidden ? "friend_hidden" : "friend_unhidden",
    });
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
