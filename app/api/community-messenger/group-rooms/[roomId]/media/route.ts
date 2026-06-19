import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { listGroupRoomMedia } from "@/lib/community-messenger/group/group-room-media-service";
import { fetchGroupMessageReadCounts } from "@/lib/community-messenger/group/group-room-read-service";
import { presentGroupReadReceipt } from "@/lib/community-messenger/group/group-room-read-presenter";
import { resolveGroupRoomSupabase } from "@/lib/community-messenger/group/group-room-repository";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
} from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:group-room-media:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "미디어 목록 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_group_room_media_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId } = await params;
  const url = new URL(req.url);
  const filterRaw = url.searchParams.get("filter");
  const filter = filterRaw === "image" || filterRaw === "file" ? filterRaw : "all";
  const cursor = url.searchParams.get("cursor");
  const result = await listGroupRoomMedia({
    userId: auth.userId,
    roomId: roomId.trim(),
    filter,
    cursor,
  });
  if (!result.ok) {
    if (result.error === GROUP_ROOM_ERROR.FORBIDDEN) {
      return jsonError("권한이 없습니다.", 403, { code: result.error });
    }
    return jsonError("미디어 목록을 불러오지 못했습니다.", 400, { code: result.error });
  }
  return jsonOk({ ok: true, page: result.page });
}

/** POST body: { messageIds: string[] } — batch read counts for timeline tail. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;

  const { roomId } = await params;
  const body = (await req.json().catch(() => null)) as { messageIds?: unknown } | null;
  const messageIds = Array.isArray(body?.messageIds)
    ? body!.messageIds.filter((id): id is string => typeof id === "string")
    : [];
  if (!messageIds.length) return jsonOk({ ok: true, readCounts: {} });

  const sb = resolveGroupRoomSupabase();
  if (!sb) return jsonError("서비스를 사용할 수 없습니다.", 503);
  const counts = await fetchGroupMessageReadCounts(sb, roomId.trim(), messageIds.slice(0, 50));
  const readCounts: Record<string, ReturnType<typeof presentGroupReadReceipt>> = {};
  for (const [messageId, readCount] of counts.entries()) {
    readCounts[messageId] = presentGroupReadReceipt({ messageId, readCount, readerLabels: [] });
  }
  return jsonOk({ ok: true, readCounts });
}
