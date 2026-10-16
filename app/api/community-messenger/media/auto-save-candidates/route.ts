import { NextRequest } from "next/server";
import { ensureApiRouteAuthGate } from "@/lib/auth/ensure-api-route-auth-gate";
import { resolveGroupRoomSupabase } from "@/lib/community-messenger/group/group-room-repository";
import {
  normalizeMessengerImageAutoSaveSince,
  type MessengerImageAutoSaveCandidatesResponse,
} from "@/lib/community-messenger/attachment/messenger-image-auto-save-candidates";
import { listMessengerImageAutoSaveCandidates } from "@/lib/community-messenger/server/messenger-image-auto-save-candidates.server";
import { enforceRateLimit, getRateLimitKey, jsonError, jsonOk } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 미디어 자동 저장 catch-up (읽기 전용).
 * `?since=<ISO>` 이후 시청자가 참여 중인 방에서 **다른 사람이 보낸** 사진 메시지를 오름차순 최대 50건.
 * 앱 포그라운드 복귀·Realtime 참여자 신호 때 네이티브 앱이 호출 → 클라이언트 원장으로 중복 저장 없음.
 */
export async function GET(req: NextRequest) {
  const authGate = await ensureApiRouteAuthGate();
  if (!authGate.ok) return authGate.response;
  const userId = authGate.userId;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:media-auto-save-candidates:${getRateLimitKey(req, userId)}`,
    limit: 30,
    windowMs: 60_000,
    message: "자동 저장 확인 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_media_auto_save_candidates_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const sinceIso = normalizeMessengerImageAutoSaveSince(new URL(req.url).searchParams.get("since"), Date.now());
  if (!sinceIso) return jsonError("since 가 필요합니다.", { status: 400, code: "since_required" });

  const sb = resolveGroupRoomSupabase();
  if (!sb) return jsonError("서비스를 사용할 수 없습니다.", 503);

  const result = await listMessengerImageAutoSaveCandidates(sb as any, { viewerUserId: userId, sinceIso });
  if (!result.ok) {
    return jsonError("자동 저장 후보를 불러오지 못했습니다.", { status: 500, code: "auto_save_candidates_failed" });
  }
  const body: MessengerImageAutoSaveCandidatesResponse = {
    ok: true,
    since: sinceIso,
    messages: result.messages,
    hasMore: result.hasMore,
  };
  return jsonOk(body, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
