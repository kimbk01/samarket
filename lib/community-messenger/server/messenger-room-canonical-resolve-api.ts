import type { NextResponse } from "next/server";
import { jsonError } from "@/lib/http/api-route";
import { resolveCommunityMessengerCanonicalRoomIdForUser } from "@/lib/community-messenger/service";

export type MessengerRoomCanonicalResult =
  | { ok: true; canonicalRoomId: string; rawRouteRoomId: string }
  | { ok: false; response: NextResponse };

/**
 * API `rooms/[roomId]/…` 경로에서 거래·레거시 id 를 `community_messenger_rooms.id` 로 통일한다.
 * 라우트별로 동일 분기·문구를 복붙하지 않도록 둔다.
 */
export async function messengerRoomCanonicalOrJsonError(
  userId: string,
  rawRoomId: string
): Promise<MessengerRoomCanonicalResult> {
  const raw = String(rawRoomId ?? "").trim();
  if (!raw) {
    return { ok: false, response: jsonError("roomId가 필요합니다.", 400) };
  }
  const resolved = await resolveCommunityMessengerCanonicalRoomIdForUser(userId, raw);
  if (!resolved.ok) {
    if (resolved.error === "bad_request") {
      return { ok: false, response: jsonError("roomId가 필요합니다.", 400) };
    }
    return { ok: false, response: jsonError("대화방을 찾을 수 없습니다.", 404, { code: resolved.error }) };
  }
  return { ok: true, canonicalRoomId: resolved.canonicalRoomId, rawRouteRoomId: raw };
}
