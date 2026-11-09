import { NextResponse, type NextRequest } from "next/server";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { enforceRateLimit, getRateLimitKey, jsonError } from "@/lib/http/api-route";
import { ensureGeneralFriendDirectRoom } from "@/lib/community-messenger/service";

export { PEER_DIRECT_CALL_ROOM_SEGMENT } from "@/lib/community-messenger/peer-direct-call-room-segment";

/**
 * `POST /api/community-messenger/rooms` 의 1:1(상대만) 방 확보와 **같은 검사·같은 함수**:
 * 세션 → 가입 완료 → 새 대화 프로필 항목 → 방 생성 속도 제한 → `ensureGeneralFriendDirectRoom`.
 * `/rooms` 가 이어서 하던 스냅샷 조회(`isGeneralFriendDirectRoom` 확인용)는 하지 않는다 —
 * `ensureGeneralFriendDirectRoom` 이 일반 1:1 키(`isMessengerGeneralFriendDirectKey`) 방만 돌려주거나 만든다.
 * 실패 응답 코드·상태는 `/rooms` 와 같다.
 */
/**
 * F1 (2026-11-09 감사): 방 확보 단계의 **모든** 실패 응답에 `roomError: true` — 앱은 이 표시가 있을 때만
 * 「방 없음」 안내(이전 `POST /rooms` 실패와 같은 결과). 통화 단계 실패(전화 인증·통화 시작 속도 제한·
 * 잘못된 요청·통화 생성 오류)는 표시가 없어 기존 통화 실패 안내로 간다. 상태 코드·헤더는 그대로.
 */
/** 본문이 바뀌므로 원래 길이 헤더는 버린다(속도 제한 Retry-After 등 나머지는 유지). */
function copyHeadersWithoutBodyLength(source: Headers): Headers {
  const headers = new Headers(source);
  headers.delete("content-length");
  return headers;
}

async function markRoomStageFailure(response: NextResponse): Promise<NextResponse> {
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as Record<string, unknown> | null;
  return NextResponse.json(
    { ...(body && typeof body === "object" ? body : { ok: false, error: "room_failed" }), roomError: true },
    { status: response.status, headers: copyHeadersWithoutBodyLength(response.headers) },
  );
}

export async function ensurePeerDirectRoomForCall(
  req: NextRequest,
  userId: string,
  peerUserIdRaw: unknown,
): Promise<{ ok: true; roomId: string } | { ok: false; response: NextResponse }> {
  const session = await validateActiveSession(userId);
  if (!session.ok) return { ok: false, response: await markRoomStageFailure(session.response) };

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return { ok: false, response: await markRoomStageFailure(jsonError("server_config", 503)) };
  }

  const signupGate = await requireSignupCompleteForUser(
    sb as import("@supabase/supabase-js").SupabaseClient,
    userId,
  );
  if (!signupGate.ok) return { ok: false, response: await markRoomStageFailure(signupGate.response) };

  const profileGate = await requireProfileFieldsForAction(
    sb as import("@supabase/supabase-js").SupabaseClient,
    userId,
    "messenger_new_chat",
  );
  if (!profileGate.ok) return { ok: false, response: await markRoomStageFailure(profileGate.response) };

  /** `/rooms` 와 같은 키 — 두 경로 합쳐 같은 한도 */
  const createRateLimit = await enforceRateLimit({
    key: `community-messenger:room-create:${getRateLimitKey(req, userId)}`,
    limit: 6,
    windowMs: 60_000,
    message: "대화방 생성 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_room_create_rate_limited",
  });
  if (!createRateLimit.ok) return { ok: false, response: await markRoomStageFailure(createRateLimit.response) };

  const result = await ensureGeneralFriendDirectRoom(
    userId,
    typeof peerUserIdRaw === "string" ? peerUserIdRaw : "",
  );
  if (!result.ok || !result.roomId) {
    const err = result.error ?? "room_failed";
    const status = err === "not_participant" || err === "blocked_target" || err === "cannot_start_chat" ? 403 : 400;
    return {
      ok: false,
      response: jsonError(result.error ?? "대화방 준비에 실패했습니다.", status, { ...result, roomError: true }),
    };
  }
  return { ok: true, roomId: result.roomId };
}
