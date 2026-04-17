import { NextRequest, after } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/http/api-route";
import {
  listCommunityMessengerRoomMessagesAfter,
  listCommunityMessengerRoomMessagesBefore,
  sendCommunityMessengerMessage,
} from "@/lib/community-messenger/service";
import { recordMessengerApiTiming } from "@/lib/community-messenger/monitoring/server-store";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { publishMessengerRoomBumpAfterMutation } from "@/lib/community-messenger/server/publish-messenger-room-bump";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const SEND_DEDUPE_TTL_MS = 2500;
const sendDedupe = new Map<string, { at: number; res: { ok: boolean; message?: unknown; error?: string } }>();

/** 이전 메시지 페이지 (스크롤 업) — 읽기 폭주 완화 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:message-page:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "이전 대화를 불러오는 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_message_page_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }
  const canonicalRoomId = canon.canonicalRoomId;
  const t0 = performance.now();
  const before = req.nextUrl.searchParams.get("before")?.trim() ?? "";
  const after = req.nextUrl.searchParams.get("after")?.trim() ?? "";
  if (before && after) {
    return jsonError("before 와 after 를 동시에 쓸 수 없습니다.", 400);
  }
  const rawLimit = req.nextUrl.searchParams.get("limit");
  const limit = rawLimit ? Math.floor(Number(rawLimit)) : undefined;

  if (after) {
    const result = await listCommunityMessengerRoomMessagesAfter({
      userId: auth.userId,
      roomId: canonicalRoomId,
      afterMessageId: after,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    if (!result.ok) {
      recordMessengerApiTiming("GET .../messages?after", Math.round(performance.now() - t0), 400);
      if (result.error === "not_found") {
        return jsonError("메시지를 찾을 수 없습니다.", 404, { code: result.error });
      }
      if (result.error === "room_not_found") {
        return jsonError("대화방을 찾을 수 없습니다.", 404, { code: result.error });
      }
      if (result.error === "migration_required") {
        return jsonError("증분 동기를 위해 DB 마이그레이션이 필요합니다.", 503, { code: result.error });
      }
      return jsonError("새 메시지를 불러오지 못했습니다.", 400, { code: result.error });
    }
    recordMessengerApiTiming("GET .../messages?after", Math.round(performance.now() - t0), 200);
    return jsonOk({ messages: result.messages, hasMore: result.hasMore, mode: "after" as const });
  }

  if (!before) {
    return jsonError("before(메시지 id) 또는 after(메시지 id)가 필요합니다.", 400);
  }
  const result = await listCommunityMessengerRoomMessagesBefore({
    userId: auth.userId,
    roomId: canonicalRoomId,
    beforeMessageId: before,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  if (!result.ok) {
    recordMessengerApiTiming("GET .../messages?before", Math.round(performance.now() - t0), 400);
    if (result.error === "not_found") {
      return jsonError("메시지를 찾을 수 없습니다.", 404, { code: result.error });
    }
    if (result.error === "room_not_found") {
      return jsonError("대화방을 찾을 수 없습니다.", 404, { code: result.error });
    }
    return jsonError("이전 메시지를 불러오지 못했습니다.", 400, { code: result.error });
  }
  recordMessengerApiTiming("GET .../messages?before", Math.round(performance.now() - t0), 200);
  return jsonOk({ messages: result.messages, hasMore: result.hasMore, mode: "before" as const });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const [parsed, routeParams, rateLimit] = await Promise.all([
    parseJsonBody<{ content?: string; clientMessageId?: string }>(req, "invalid_json"),
    params,
    enforceRateLimit({
      key: `community-messenger:message-send:${getRateLimitKey(req, auth.userId)}`,
      limit: 30,
      windowMs: 60_000,
      message: "메신저 전송 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
      code: "community_messenger_message_rate_limited",
    }),
  ]);
  if (!parsed.ok) return parsed.response;
  if (!rateLimit.ok) return rateLimit.response;
  const body = parsed.value;

  const { roomId: rawRoomId } = routeParams;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }
  const canonicalRoomId = canon.canonicalRoomId;
  const t0 = performance.now();
  const content = String(body.content ?? "");
  const clientMessageId = String(body.clientMessageId ?? "").trim();
  const key = clientMessageId
    ? `community-messenger:send:${auth.userId}:${canonicalRoomId}:${clientMessageId}`
    : `community-messenger:send:${auth.userId}:${canonicalRoomId}:${content.slice(0, 24)}`;
  const now = Date.now();
  const cached = sendDedupe.get(key);
  if (cached && now - cached.at <= SEND_DEDUPE_TTL_MS) {
    recordMessengerApiTiming(
      "POST /api/community-messenger/rooms/[roomId]/messages",
      Math.round(performance.now() - t0),
      cached.res.ok ? 200 : 400
    );
    return cached.res.ok ? jsonOk(cached.res) : jsonError(cached.res.error ?? "메시지 전송에 실패했습니다.", 400, cached.res);
  }
  const result = await runSingleFlight(key, async () => {
    const r = await sendCommunityMessengerMessage({
      userId: auth.userId,
      roomId: canonicalRoomId,
      content,
      clientMessageId: clientMessageId || undefined,
      membershipPreflightDone: true,
    });
    // store short TTL response to dedupe rapid retries/double-clicks
    sendDedupe.set(key, { at: Date.now(), res: r as any });
    return r;
  });
  if (result.ok) {
    const msg = result.message as { id?: string; createdAt?: string } | undefined;
    const bumpArgs = {
      rawRouteRoomId: canon.rawRouteRoomId,
      canonicalRoomId,
      fromUserId: auth.userId,
      messageId: typeof msg?.id === "string" ? msg.id : undefined,
      messageCreatedAt: typeof msg?.createdAt === "string" ? msg.createdAt : undefined,
      messageForBump: result.message ?? null,
    };
    /** 응답 본문은 DB insert 직후 즉시 반환 — bump·캐시 무효화·브로드캐스트는 `after` 로 분리해 전송 RTT 에서 제외 */
    after(async () => {
      try {
        await publishMessengerRoomBumpAfterMutation(bumpArgs);
      } catch {
        /* best-effort: 수신측은 Postgres Realtime·재요청으로 정합 */
      }
    });
  }
  recordMessengerApiTiming(
    "POST /api/community-messenger/rooms/[roomId]/messages",
    Math.round(performance.now() - t0),
    result.ok ? 200 : 400
  );
  return result.ok
    ? jsonOk(result)
    : jsonError(result.error ?? "메시지 전송에 실패했습니다.", 400, result);
}
