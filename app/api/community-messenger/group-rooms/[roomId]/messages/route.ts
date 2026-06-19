import { after, NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { assertActivePrivateGroupSender } from "@/lib/community-messenger/group/group-room-service";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/http/api-route";
import { pruneByAtMaxAgeAndMaxSize } from "@/lib/http/memory-map-prune";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEND_DEDUPE_TTL_MS = 2500;
const SEND_DEDUPE_MAX_ENTRIES = 20_000;
const sendDedupe = new Map<string, { at: number; res: { ok: boolean; message?: unknown; error?: string } }>();

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function groupRoomServiceJsonError(error: string) {
  switch (error) {
    case GROUP_ROOM_ERROR.BLOCKED_TARGET:
      return jsonError("차단된 사용자와는 메시지를 주고받을 수 없습니다.", 403, { code: error });
    case GROUP_ROOM_ERROR.FORBIDDEN:
      return jsonError("권한이 없습니다.", 403, { code: error });
    case GROUP_ROOM_ERROR.ROOM_UNAVAILABLE:
      return jsonError("읽기 전용이거나 사용할 수 없는 그룹입니다.", 403, { code: error });
    case GROUP_ROOM_ERROR.ROOM_NOT_FOUND:
    case GROUP_ROOM_ERROR.NOT_GROUP_ROOM:
      return jsonError("그룹 대화방을 찾을 수 없습니다.", 404, { code: error });
    case GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED:
      return jsonError("그룹 대화 기능을 사용하려면 DB 마이그레이션이 필요합니다.", 503, {
        code: error,
      });
    default:
      return jsonError("그룹 메시지 요청을 처리하지 못했습니다.", 400, { code: error });
  }
}

/** 이전 메시지 페이지 (스크롤 업) — before 필수 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:group-message-page:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "이전 대화를 불러오는 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_group_message_page_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await params;
  const roomId = trimText(rawRoomId);
  if (!roomId) return jsonError("대화방 id가 필요합니다.", 400);

  const gate = await assertActivePrivateGroupSender({ userId: auth.userId, roomId });
  if (!gate.ok) return groupRoomServiceJsonError(gate.error);

  const before = req.nextUrl.searchParams.get("before")?.trim() ?? "";
  if (!before) {
    return jsonError("before(메시지 id)가 필요합니다.", 400);
  }
  const rawLimit = req.nextUrl.searchParams.get("limit");
  const limit = rawLimit != null && rawLimit !== "" ? Math.floor(Number(rawLimit)) : undefined;

  const cm = await import("@/lib/community-messenger/service");
  const beforeKey = `community-messenger:group-messages:before:${auth.userId}:${roomId}:${before}:${
    Number.isFinite(limit ?? NaN) ? String(limit) : "default"
  }`;
  const result = await runSingleFlight(beforeKey, async () =>
    cm.listCommunityMessengerRoomMessagesBefore({
      userId: auth.userId,
      roomId,
      beforeMessageId: before,
      limit: Number.isFinite(limit ?? NaN) ? limit : undefined,
    })
  );
  if (!result.ok) {
    if (result.error === "not_found") {
      return jsonError("메시지를 찾을 수 없습니다.", 404, { code: result.error });
    }
    if (result.error === "room_not_found") {
      return jsonError("대화방을 찾을 수 없습니다.", 404, { code: result.error });
    }
    return jsonError("이전 메시지를 불러오지 못했습니다.", 400, { code: result.error });
  }
  return jsonOk({ messages: result.messages, hasMore: result.hasMore, mode: "before" as const });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const sendServiceImport = import("@/lib/community-messenger/service");
  const [auth, parsed, routeParams] = await Promise.all([
    requireAuthenticatedUserId(),
    parseJsonBody<{ content?: string; clientMessageId?: string; replyToMessageId?: string }>(
      req,
      "invalid_json"
    ),
    params,
  ]);
  if (!auth.ok) return auth.response;
  if (!parsed.ok) return parsed.response;

  const [session, phone, rateLimit] = await Promise.all([
    validateActiveSession(auth.userId),
    requirePhoneVerified(auth.userId),
    enforceRateLimit({
      key: `community-messenger:group-message-send:${getRateLimitKey(req, auth.userId)}`,
      limit: 30,
      windowMs: 60_000,
      message: "메신저 전송 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
      code: "community_messenger_group_message_rate_limited",
    }),
  ]);
  if (!session.ok) return session.response;
  if (!phone.ok) return phone.response;
  if (!rateLimit.ok) return rateLimit.response;

  const roomId = trimText(routeParams.roomId);
  if (!roomId) return jsonError("대화방 id가 필요합니다.", 400);

  const senderGate = await assertActivePrivateGroupSender({ userId: auth.userId, roomId });
  if (!senderGate.ok) return groupRoomServiceJsonError(senderGate.error);

  const body = parsed.value;
  const content = String(body.content ?? "");
  const clientMessageId = trimText(body.clientMessageId);
  const replyToMessageId = trimText(body.replyToMessageId);
  const key = clientMessageId
    ? `community-messenger:group-send:${auth.userId}:${roomId}:${clientMessageId}`
    : `community-messenger:group-send:${auth.userId}:${roomId}:${content.slice(0, 24)}`;
  const now = Date.now();
  pruneByAtMaxAgeAndMaxSize(sendDedupe, now, SEND_DEDUPE_TTL_MS, SEND_DEDUPE_MAX_ENTRIES);
  const cached = sendDedupe.get(key);
  if (cached && now - cached.at <= SEND_DEDUPE_TTL_MS) {
    if (cached.res.ok) return jsonOk(cached.res);
    if (cached.res.error === "blocked_target") {
      return jsonError("차단된 사용자와는 메시지를 주고받을 수 없습니다.", 403, {
        ...cached.res,
        code: "blocked_target",
        error: "blocked_target",
      });
    }
    return jsonError(cached.res.error ?? "메시지 전송에 실패했습니다.", 400, cached.res);
  }

  const result = await runSingleFlight(key, async () => {
    const cm = await sendServiceImport;
    const r = await cm.sendCommunityMessengerMessage({
      userId: auth.userId,
      roomId,
      content,
      clientMessageId: clientMessageId || undefined,
      replyToMessageId: replyToMessageId || undefined,
      membershipPreflightDone: true,
    });
    const tStore = Date.now();
    sendDedupe.set(key, { at: tStore, res: r as { ok: boolean; message?: unknown; error?: string } });
    pruneByAtMaxAgeAndMaxSize(sendDedupe, tStore, SEND_DEDUPE_TTL_MS, SEND_DEDUPE_MAX_ENTRIES);
    return r;
  });

  const postAckEffects = result.ok ? result.postAckEffects : undefined;
  if (result.ok) {
    const msg = result.message as { id?: string; createdAt?: string } | undefined;
    const bumpArgs = {
      rawRouteRoomId: roomId,
      canonicalRoomId: roomId,
      fromUserId: auth.userId,
      messageId: typeof msg?.id === "string" ? msg.id : undefined,
      messageCreatedAt: typeof msg?.createdAt === "string" ? msg.createdAt : undefined,
      messageForBump: result.message ?? null,
    };
    /**
     * 그룹도 일반 CM 방과 동일하게 수신 신호는 ACK 전에 보장한다.
     * DO NOT: room broadcast bump 를 after() best-effort 로 되돌리면 그룹 메시지 실시간 수신이 빠질 수 있다.
     */
    try {
      const { publishMessengerRoomBumpAfterMutation } = await import(
        "@/lib/community-messenger/server/publish-messenger-room-bump"
      );
      await publishMessengerRoomBumpAfterMutation(bumpArgs);
    } catch (err) {
      console.warn("[cm-group-room-bump-before-ack-failed]", {
        roomId,
        messageId: bumpArgs.messageId ?? null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    after(async () => {
      if (postAckEffects) {
        try {
          const { runCommunityMessengerSendPostAckEffects } = await import(
            "@/lib/community-messenger/server/community-messenger-send-post-ack-effects"
          );
          const { resolveServiceSupabaseForApi } = await import("@/lib/supabase/resolve-service-supabase-for-api");
          const sb = resolveServiceSupabaseForApi();
          if (sb) await runCommunityMessengerSendPostAckEffects(sb, postAckEffects);
        } catch {
          /* best-effort */
        }
      }
    });
  }

  let responsePayload = result;
  if (
    responsePayload.ok &&
    (!responsePayload.message || !trimText((responsePayload.message as { id?: string })?.id)) &&
    clientMessageId
  ) {
    const cm = await sendServiceImport;
    const reread = await cm.findCommunityMessengerMessageByClientId({
      userId: auth.userId,
      roomId,
      clientMessageId,
    });
    if (reread) {
      responsePayload = { ok: true, message: reread };
    } else {
      responsePayload = { ok: false, error: "message_send_failed" };
    }
  }

  return responsePayload.ok
    ? jsonOk(responsePayload)
    : responsePayload.error === "blocked_target"
      ? jsonError(
          "차단된 사용자와는 메시지를 주고받을 수 없습니다.",
          { status: 403 },
          { ...responsePayload, code: "blocked_target", error: "blocked_target" }
        )
      : jsonError(responsePayload.error ?? "메시지 전송에 실패했습니다.", 400, { ...responsePayload });
}
