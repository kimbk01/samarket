import { after, NextRequest } from "next/server";
import type { CommunityMessengerMessagesAfterPerf } from "@/lib/community-messenger/service";
import { ensureApiRouteAuthGate } from "@/lib/auth/ensure-api-route-auth-gate";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/http/api-route";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { logRoutePerf } from "@/lib/http/route-perf-log";
import { pruneByAtMaxAgeAndMaxSize } from "@/lib/http/memory-map-prune";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEND_DEDUPE_TTL_MS = 2500;
const SEND_DEDUPE_MAX_ENTRIES = 20_000;
const sendDedupe = new Map<string, { at: number; res: { ok: boolean; message?: unknown; error?: string } }>();

/** 이전 메시지 페이지 (스크롤 업) — 읽기 폭주 완화 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const wall0 = performance.now();
  const authGate = await ensureApiRouteAuthGate();
  if (!authGate.ok) return authGate.response;
  const auth = { ok: true as const, userId: authGate.userId };
  const auth_ms = authGate.auth_ms;
  const auth_cache_hit = authGate.auth_cache_hit;
  const auth_source = authGate.auth_source;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:message-page:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "이전 대화를 불러오는 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_message_page_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { messengerRoomCanonicalOrJsonError } = await import(
    "@/lib/community-messenger/server/messenger-room-canonical-resolve-api"
  );

  const { recordMessengerApiTiming } = await import("@/lib/community-messenger/monitoring/messenger-api-route-timing");

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
    const cm = await import("@/lib/community-messenger/service");
    const afterPerf: CommunityMessengerMessagesAfterPerf = {};
    const afterKey = `community-messenger:messages:after:${auth.userId}:${canonicalRoomId}:${after}:${
      Number.isFinite(limit) ? String(limit) : "default"
    }`;
    const result = await runSingleFlight(afterKey, async () =>
      cm.listCommunityMessengerRoomMessagesAfter({
        userId: auth.userId,
        roomId: canonicalRoomId,
        afterMessageId: after,
        limit: Number.isFinite(limit) ? limit : undefined,
        _perf: afterPerf,
      })
    );
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
    if (process.env.NODE_ENV === "development") {
      logRoutePerf({
        route: "GET /api/community-messenger/rooms/[roomId]/messages?after",
        total_ms: Math.round(performance.now() - wall0),
        auth_ms,
        auth_cache_hit,
        auth_source,
        permission_query_ms: canon.permission_query_ms,
        membership_cache_hit: canon.membership_cache_hit,
        messages_fetch_ms: afterPerf.messages_fetch_ms ?? 0,
        reactions_ms: afterPerf.reactions_ms ?? 0,
        hidden_ms: afterPerf.hidden_ms ?? 0,
        profiles_ms: afterPerf.profiles_ms ?? 0,
        payload_ms: afterPerf.payload_ms ?? 0,
      });
    }
    return jsonOk({ messages: result.messages, hasMore: result.hasMore, mode: "after" as const });
  }

  if (!before) {
    return jsonError("before(메시지 id) 또는 after(메시지 id)가 필요합니다.", 400);
  }
  const cm = await import("@/lib/community-messenger/service");
  const beforeKey = `community-messenger:messages:before:${auth.userId}:${canonicalRoomId}:${before}:${
    Number.isFinite(limit) ? String(limit) : "default"
  }`;
  const result = await runSingleFlight(beforeKey, async () =>
    cm.listCommunityMessengerRoomMessagesBefore({
      userId: auth.userId,
      roomId: canonicalRoomId,
      beforeMessageId: before,
      limit: Number.isFinite(limit) ? limit : undefined,
    })
  );
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
    if (process.env.NODE_ENV === "development") {
      logRoutePerf({
        route: "GET /api/community-messenger/rooms/[roomId]/messages?before",
        total_ms: Math.round(performance.now() - wall0),
        auth_ms,
        auth_cache_hit,
        auth_source,
        permission_query_ms: canon.permission_query_ms,
        membership_cache_hit: canon.membership_cache_hit,
      });
    }
  return jsonOk({ messages: result.messages, hasMore: result.hasMore, mode: "before" as const });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const wall0 = performance.now();
  const { createT5SendTrace, markT5, requestWantsT5Trace, t5TraceToHeader, t5TraceToJson, spanT5 } = await import(
    "@/lib/community-messenger/monitoring/t5-send-stage-trace"
  );
  const t5 = requestWantsT5Trace(req) ? createT5SendTrace(req.headers.get("x-samarket-t5-cid") ?? undefined) : null;
  const sendServiceImport = import("@/lib/community-messenger/service");
  const [authGate, parsed, routeParams] = await Promise.all([
    ensureApiRouteAuthGate(),
    parseJsonBody<{ content?: string; clientMessageId?: string; replyToMessageId?: string }>(req, "invalid_json"),
    params,
  ]);
  if (t5) markT5(t5, "S1");
  if (!authGate.ok) return authGate.response;
  const userId = authGate.userId;
  const rawRoomId = String(routeParams.roomId ?? "").trim();

  const [rateLimit, canon] = await Promise.all([
    enforceRateLimit({
      key: `community-messenger:message-send:${getRateLimitKey(req, userId)}`,
      limit: 30,
      windowMs: 60_000,
      message: "메신저 전송 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
      code: "community_messenger_message_rate_limited",
    }),
    import("@/lib/community-messenger/server/messenger-room-canonical-resolve-api").then(
      ({ messengerRoomCanonicalOrJsonError }) => messengerRoomCanonicalOrJsonError(userId, rawRoomId)
    ),
  ]);
  if (t5) markT5(t5, "S2");
  if (!parsed.ok) return parsed.response;
  if (!rateLimit.ok) return rateLimit.response;
  if (!canon.ok) return canon.response;

  let sbSend: ReturnType<typeof getSupabaseServer>;
  try {
    sbSend = getSupabaseServer();
  } catch {
    return jsonError("server_config", 503);
  }
  /** S2→S3 opt-in substages (x-samarket-t5-trace). Do not change notify/after ordering. */
  const profileT0 = performance.now();
  const profileGate = await requireProfileFieldsForAction(
    sbSend as import("@supabase/supabase-js").SupabaseClient,
    userId,
    "messenger_send_message"
  );
  if (t5) spanT5(t5, "S2_profile_ms", profileT0);
  if (!profileGate.ok) return profileGate.response;
  const timingModT0 = performance.now();
  const { recordMessengerApiTiming } = await import("@/lib/community-messenger/monitoring/messenger-api-route-timing");
  if (t5) spanT5(t5, "S2_timing_mod_ms", timingModT0);
  const body = parsed.value;
  const canonicalRoomId = canon.canonicalRoomId;
  if (t5) t5.roomId = canonicalRoomId;
  const gateMs = Math.round(performance.now() - wall0);
  const t0 = performance.now();
  const content = String(body.content ?? "");
  const clientMessageId = String(body.clientMessageId ?? "").trim();
  const replyToMessageId = String(body.replyToMessageId ?? "").trim();
  const key = clientMessageId
    ? `community-messenger:send:${userId}:${canonicalRoomId}:${clientMessageId}`
    : `community-messenger:send:${userId}:${canonicalRoomId}:${content.slice(0, 24)}`;
  const now = Date.now();
  pruneByAtMaxAgeAndMaxSize(sendDedupe, now, SEND_DEDUPE_TTL_MS, SEND_DEDUPE_MAX_ENTRIES);
  const cached = sendDedupe.get(key);
  if (cached && now - cached.at <= SEND_DEDUPE_TTL_MS) {
    recordMessengerApiTiming(
      "POST /api/community-messenger/rooms/[roomId]/messages",
      Math.round(performance.now() - t0),
      cached.res.ok ? 200 : cached.res.error === "blocked_target" ? 403 : 400
    );
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
    const serviceModT0 = performance.now();
    const cm = await sendServiceImport;
    if (t5) spanT5(t5, "S2_service_mod_ms", serviceModT0);
    const r = await cm.sendCommunityMessengerMessage({
      userId,
      roomId: canonicalRoomId,
      content,
      clientMessageId: clientMessageId || undefined,
      replyToMessageId: replyToMessageId || undefined,
      membershipPreflightDone: true,
      _t5: t5 ?? undefined,
    });
    const tStore = Date.now();
    sendDedupe.set(key, { at: tStore, res: r as any });
    pruneByAtMaxAgeAndMaxSize(sendDedupe, tStore, SEND_DEDUPE_TTL_MS, SEND_DEDUPE_MAX_ENTRIES);
    return r;
  });
  const postAckEffects = result.ok ? result.postAckEffects : undefined;
  if (result.ok) {
    const msg = result.message as { id?: string; createdAt?: string } | undefined;
    if (t5 && typeof msg?.id === "string") t5.messageId = msg.id;
    const bumpArgs = {
      rawRouteRoomId: canon.rawRouteRoomId,
      canonicalRoomId,
      fromUserId: userId,
      messageId: typeof msg?.id === "string" ? msg.id : undefined,
      messageCreatedAt: typeof msg?.createdAt === "string" ? msg.createdAt : undefined,
      messageForBump: result.message ?? null,
      skipBadgeTargetBump: true as const,
    };
    /**
     * Domain Badge Authority SSOT = notification_targets.
     * Await target bump BEFORE ACK so a fast room-open mark_read cannot clear before
     * the unread write lands (measured group/SO race: after() bump after mark_read).
     *
     * Durable notification_events accept BEFORE ACK (44e7073fe — after() historically
     * stalled event inserts ~2026-07-22). FCM/OS push + item_trade mirror run in after()
     * so slow external delivery does not block sender ACK (T5). Realtime room bump stays
     * in after(); skipBadgeTargetBump prevents a second target write.
     */
    let deferredPostAck: import("@/lib/community-messenger/server/community-messenger-send-post-ack-effects").CommunityMessengerSendDeferredPostAckWork | null =
      null;
    try {
      const { bumpMessengerRoomTargetsForRecipients } = await import(
        "@/lib/notifications/notification-target-messenger-bridge"
      );
      const { resolveServiceSupabaseForApi } = await import(
        "@/lib/supabase/resolve-service-supabase-for-api"
      );
      const sb = resolveServiceSupabaseForApi();
      if (sb) {
        if (t5) markT5(t5, "S9");
        const bumpT0 = performance.now();
        await bumpMessengerRoomTargetsForRecipients(sb, {
          roomId: canonicalRoomId,
          fromUserId: userId,
        });
        if (t5) {
          spanT5(t5, "S10_target_bump_ms", bumpT0);
          markT5(t5, "S10");
        }
        if (postAckEffects) {
          if (t5) markT5(t5, "S11");
          const { runCommunityMessengerSendDurablePreAckEffects } = await import(
            "@/lib/community-messenger/server/community-messenger-send-post-ack-effects"
          );
          const effectsT0 = performance.now();
          deferredPostAck = await runCommunityMessengerSendDurablePreAckEffects(
            sb,
            postAckEffects,
            t5 ?? undefined
          );
          if (t5) {
            spanT5(t5, "S12_pre_ack_effects_ms", effectsT0);
            markT5(t5, "S12");
          }
        } else if (t5) {
          markT5(t5, "S11");
          markT5(t5, "S12");
        }
      }
    } catch {
      /* best-effort — do not fail the send ACK */
    }
    if (t5) markT5(t5, "S13");
    after(async () => {
      try {
        if (t5) markT5(t5, "S14");
        const { resolveServiceSupabaseForApi } = await import(
          "@/lib/supabase/resolve-service-supabase-for-api"
        );
        const sb = resolveServiceSupabaseForApi();
        if (sb && deferredPostAck) {
          const { runCommunityMessengerSendDeferredPostAckEffects } = await import(
            "@/lib/community-messenger/server/community-messenger-send-post-ack-effects"
          );
          await runCommunityMessengerSendDeferredPostAckEffects(sb, deferredPostAck, t5 ?? undefined);
        }
        const { publishMessengerRoomBumpAfterMutation } = await import(
          "@/lib/community-messenger/server/publish-messenger-room-bump"
        );
        const bumpPubT0 = performance.now();
        await publishMessengerRoomBumpAfterMutation(bumpArgs);
        if (t5) {
          spanT5(t5, "S17_room_bump_ms", bumpPubT0);
          markT5(t5, "S17");
        }
      } catch {
        /* best-effort: 수신측은 Postgres Realtime·재요청으로 정합 */
      }
    });
  }
  let responsePayload: Record<string, unknown> = result as unknown as Record<string, unknown>;
  if (result.ok && (!result.message || !trimText((result.message as { id?: string })?.id)) && clientMessageId) {
    const cm = await sendServiceImport;
    const reread = await cm.findCommunityMessengerMessageByClientId({
      userId,
      roomId: canonicalRoomId,
      clientMessageId,
    });
    if (reread) {
      responsePayload = { ok: true, message: reread };
    } else {
      responsePayload = { ok: false, error: "message_send_failed" };
    }
  }
  if (t5 && responsePayload.ok) {
    responsePayload = { ...responsePayload, t5: t5TraceToJson(t5) };
  }
  const handlerMs = Math.round(performance.now() - t0);
  const routeMs = Math.round(performance.now() - wall0);
  recordMessengerApiTiming(
    "POST /api/community-messenger/rooms/[roomId]/messages",
    handlerMs,
    responsePayload.ok ? 200 : responsePayload.error === "blocked_target" ? 403 : 400
  );
  const ackHeaders: Record<string, string> = {
    "x-samarket-send-route-ms": String(routeMs),
    "x-samarket-send-gate-ms": String(gateMs),
    "x-samarket-send-handler-ms": String(handlerMs),
    "x-samarket-membership-cache-hit": String(canon.membership_cache_hit),
  };
  if (t5) {
    ackHeaders["x-samarket-t5"] = t5TraceToHeader(t5);
    ackHeaders["x-samarket-t5-cid"] = t5.correlationId;
  }
  return responsePayload.ok
    ? jsonOk(responsePayload, { headers: ackHeaders })
    : responsePayload.error === "blocked_target"
      ? jsonError(
          "차단된 사용자와는 메시지를 주고받을 수 없습니다.",
          { status: 403, headers: ackHeaders },
          { ...responsePayload, code: "blocked_target", error: "blocked_target" }
        )
      : jsonError(
          typeof responsePayload.error === "string" && responsePayload.error
            ? responsePayload.error
            : "메시지 전송에 실패했습니다.",
          { status: 400, headers: ackHeaders },
          { ...responsePayload }
        );
}


function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
