import { after, NextRequest, NextResponse } from "next/server";
import type { CommunityMessengerMessagesAfterPerf } from "@/lib/community-messenger/service";
import { ensureApiRouteAuthGate } from "@/lib/auth/ensure-api-route-auth-gate";
import { assertVerifiedMemberForAction, MEMBER_ACCESS_PROFILE_SELECT } from "@/lib/auth/member-access";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  PROFILE_FIELDS_GATE_SELECT as MESSENGER_SEND_PROFILE_GATE_SELECT,
  requireProfileFieldsForAction,
} from "@/lib/profile/require-profile-completion.server";
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
import {
  isMessengerSendUnavailableError,
  MESSENGER_SEND_UNAVAILABLE_ERROR,
} from "@/lib/community-messenger/server/messenger-send-unavailable";
import { resolveRequestAppLanguageOr } from "@/lib/i18n/request-app-language";
import { translateBy } from "@/lib/i18n/translate-by";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** P2 (B3): 프로필 게이트 + 회원 게이트 profiles 컬럼 합집합(중복 제거) — 1회 읽기 */
const MESSENGER_SEND_GATE_PROFILE_UNION_SELECT = [
  ...new Set(
    `${MESSENGER_SEND_PROFILE_GATE_SELECT},${MEMBER_ACCESS_PROFILE_SELECT}`
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
  ),
].join(",");

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
  const { viewerParticipantPreflightFromAccess } = await import(
    "@/lib/community-messenger/server/messenger-room-access"
  );
  /** B3 — canon access 에 cleared_at 있으면 participants 재조회 생략 (미적용 DB면 null → 기존 조회) */
  const viewerParticipantPreflight = viewerParticipantPreflightFromAccess(canon.access);
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

  if (!before && req.nextUrl.searchParams.get("latest") === "1") {
    /** 앵커 없는 최신 페이지 — 빈 방 첫 메시지·복귀 정합(과거 created_at 늦은 기록·제자리 갱신) */
    const cm = await import("@/lib/community-messenger/service");
    const latestKey = `community-messenger:messages:latest:${auth.userId}:${canonicalRoomId}:${
      Number.isFinite(limit) ? String(limit) : "default"
    }`;
    const result = await runSingleFlight(latestKey, async () =>
      cm.listCommunityMessengerRoomMessagesLatest({
        userId: auth.userId,
        roomId: canonicalRoomId,
        limit: Number.isFinite(limit) ? limit : undefined,
        viewerParticipantPreflight,
      })
    );
    if (!result.ok) {
      recordMessengerApiTiming("GET .../messages?latest", Math.round(performance.now() - t0), 400);
      if (result.error === "room_not_found") {
        return jsonError("대화방을 찾을 수 없습니다.", 404, { code: result.error });
      }
      return jsonError("메시지를 불러오지 못했습니다.", 400, { code: result.error });
    }
    recordMessengerApiTiming("GET .../messages?latest", Math.round(performance.now() - t0), 200);
    return jsonOk({ messages: result.messages, hasMore: result.hasMore, mode: "latest" as const });
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
      viewerParticipantPreflight,
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
  /**
   * P2 (B3) 게이트 병합 — 읽기만 하는 게이트를 동시에 시작하고, 결과는 기존 오류 우선순위(I6)대로 평가한다:
   * 프로필 → 인증 회원 → (service) 그룹 → 차단 → RPC.
   * - profiles 는 1회만 읽어 프로필 게이트·회원 게이트가 함께 쓴다(합집합 컬럼). 읽기 오류면 기존 경로로 폴백.
   * - 그룹 게이트는 방 확인에서 이미 읽은 방 종류(`canon.access.roomType`)를 넘겨 rooms 재조회를 없앤다.
   * - 1:1 차단 게이트도 같이 시작 → service 는 결과만 평가(`gatePrefetch`).
   */
  const sbGate = sbSend as import("@supabase/supabase-js").SupabaseClient;
  const roomTypeHint =
    canon.access && typeof canon.access.roomType === "string" && canon.access.roomType.trim()
      ? canon.access.roomType.trim()
      : null;
  const gatePrefetchPromise = (async () => {
    const [{ assertActiveGroupMembershipIfGroup }, { assertDirectRoomCommunicationNotBlocked }] = await Promise.all([
      import("@/lib/community-messenger/group/group-active-membership-gate"),
      import("@/lib/community-messenger/direct-room-communication-gate"),
    ]);
    const [group, block] = await Promise.all([
      assertActiveGroupMembershipIfGroup({
        userId,
        roomId: canon.canonicalRoomId,
        supabase: sbGate,
        roomType: roomTypeHint,
      }),
      assertDirectRoomCommunicationNotBlocked({
        viewerUserId: userId,
        roomId: canon.canonicalRoomId,
        supabase: sbGate,
        _t5: t5 ?? undefined,
      }),
    ]);
    return { group, block };
  })();
  gatePrefetchPromise.catch(() => undefined);
  /** S2→S3 opt-in substages (x-samarket-t5-trace). */
  const profileT0 = performance.now();
  const { data: gateProfileRow, error: gateProfileErr } = await sbGate
    .from("profiles")
    .select(MESSENGER_SEND_GATE_PROFILE_UNION_SELECT)
    .eq("id", userId)
    .maybeSingle();
  const profileGate = await requireProfileFieldsForAction(
    sbGate,
    userId,
    "messenger_send_message",
    gateProfileErr ? undefined : ((gateProfileRow as Record<string, unknown> | null) ?? undefined)
  );
  if (t5) spanT5(t5, "S2_profile_ms", profileT0);
  if (!profileGate.ok) return profileGate.response;
  const memberWriteGate = await assertVerifiedMemberForAction(
    sbGate,
    userId,
    gateProfileErr ? undefined : ((gateProfileRow as Record<string, unknown> | null) ?? null)
  );
  if (!memberWriteGate.ok) {
    return NextResponse.json(
      { ok: false, error: memberWriteGate.error, code: "member_activity_restricted" },
      { status: memberWriteGate.status }
    );
  }
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
  // CHAT-04: 내용 앞 24자 기반 dedupe 키를 제거(앞부분 같은 다른 메시지가 사라지던 문제).
  // clientMessageId 가 있으면 그것으로 dedupe, 없으면 요청마다 고유 키 → 합쳐지지 않음.
  // (clientMessageId 중복은 DB UNIQUE 인덱스가 근본 차단.)
  const key = clientMessageId
    ? `community-messenger:send:${userId}:${canonicalRoomId}:${clientMessageId}`
    : `community-messenger:send:${userId}:${canonicalRoomId}:nocid:${Date.now()}:${Math.random().toString(36).slice(2, 11)}`;
  const now = Date.now();
  pruneByAtMaxAgeAndMaxSize(sendDedupe, now, SEND_DEDUPE_TTL_MS, SEND_DEDUPE_MAX_ENTRIES);
  const cached = sendDedupe.get(key);
  /** F1: dedupe 캐시에는 성공 응답만 저장한다(실패를 2.5초 재생해 재전송을 막지 않도록) */
  if (cached && cached.res.ok && now - cached.at <= SEND_DEDUPE_TTL_MS) {
    recordMessengerApiTiming(
      "POST /api/community-messenger/rooms/[roomId]/messages",
      Math.round(performance.now() - t0),
      200
    );
    return jsonOk(cached.res);
  }
  const result = await runSingleFlight(key, async () => {
    const serviceModT0 = performance.now();
    const cm = await sendServiceImport;
    if (t5) spanT5(t5, "S2_service_mod_ms", serviceModT0);
    const gatePrefetch = await gatePrefetchPromise;
    const r = await cm.sendCommunityMessengerMessage({
      userId,
      roomId: canonicalRoomId,
      content,
      clientMessageId: clientMessageId || undefined,
      replyToMessageId: replyToMessageId || undefined,
      membershipPreflightDone: true,
      gatePrefetch,
      _t5: t5 ?? undefined,
    });
    if (r.ok) {
      const tStore = Date.now();
      sendDedupe.set(key, { at: tStore, res: r as any });
      pruneByAtMaxAgeAndMaxSize(sendDedupe, tStore, SEND_DEDUPE_TTL_MS, SEND_DEDUPE_MAX_ENTRIES);
    }
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
      /** 전송 RPC 반환(마이그레이션 적용 뒤) — 없으면 publishTextSendRoomBump 가 기존 함수로 폴백 */
      prefetched: postAckEffects
        ? {
            roomType: typeof postAckEffects.roomType === "string" ? postAckEffects.roomType : null,
            chatDomain: typeof postAckEffects.chatDomain === "string" ? postAckEffects.chatDomain : null,
            domainIdentity: typeof postAckEffects.domainIdentity === "string" ? postAckEffects.domainIdentity : null,
            recipientUserIds: Array.isArray(postAckEffects.recipientUserIds) ? postAckEffects.recipientUserIds : null,
          }
        : null,
    };
    /**
     * P2 서버 순서 (보수안 — 의미는 기존과 같음, 응답 전 대기만 줄임):
     *  ① 배지 target bump(새 병렬 함수) ‖ durable 알림(notification_events, `parallelRecipients`·`deferAutoRead`)
     *     — 서로 다른 표(notification_targets vs notification_events)라 동시 시작. 공유 쓰기는 자동 읽음뿐 → 미룸.
     *  ② await target (I1: 배지 bump 가 mark_read 보다 먼저 — 실측 group/SO 경합)
     *  ③ await durable (I2: 44e7073fe — after() 에서 event insert 가 멈췄던 이력)
     *  ④ 방 bump 시작 → `after(promise)` (I4: target 뒤. 응답은 기다리지 않음)
     *  ⑤ 자동 읽음(markRoomRead) — target 완료 뒤(I5), 응답 전(기존과 같음)
     *  ⑥ 응답 → after(): FCM/OS push·item_trade 미러(기존 그대로)
     */
    let deferredPostAck: import("@/lib/community-messenger/server/community-messenger-send-post-ack-effects").CommunityMessengerSendDeferredPostAckWork | null =
      null;
    let roomBumpStarted = false;
    try {
      const [{ bumpMessengerRoomTargetsForRecipientsParallel }, { resolveServiceSupabaseForApi }] = await Promise.all([
        import("@/lib/notifications/notification-target-messenger-bridge"),
        import("@/lib/supabase/resolve-service-supabase-for-api"),
      ]);
      const sb = resolveServiceSupabaseForApi();
      if (sb) {
        if (t5) markT5(t5, "S9");
        const bumpT0 = performance.now();
        const targetPromise = bumpMessengerRoomTargetsForRecipientsParallel(sb, {
          roomId: canonicalRoomId,
          fromUserId: userId,
          _t5: t5 ?? undefined,
        });
        targetPromise.catch(() => undefined);
        let durablePromise: Promise<
          import("@/lib/community-messenger/server/community-messenger-send-post-ack-effects").CommunityMessengerSendDeferredPostAckWork | null
        > = Promise.resolve(null);
        const effectsT0 = performance.now();
        if (postAckEffects) {
          if (t5) markT5(t5, "S11");
          durablePromise = import("@/lib/community-messenger/server/community-messenger-send-post-ack-effects").then(
            ({ runCommunityMessengerSendDurablePreAckEffects }) =>
              runCommunityMessengerSendDurablePreAckEffects(sb, postAckEffects, t5 ?? undefined, {
                parallelRecipients: true,
                deferAutoRead: true,
              })
          );
          durablePromise.catch(() => undefined);
        }
        try {
          await targetPromise;
        } catch {
          /* best-effort — target 실패가 durable·bump 를 막지 않는다 */
        }
        if (t5) {
          spanT5(t5, "S10_target_bump_ms", bumpT0);
          markT5(t5, "S10");
        }
        try {
          deferredPostAck = await durablePromise;
        } catch {
          deferredPostAck = null;
        }
        if (t5) {
          if (postAckEffects) spanT5(t5, "S12_pre_ack_effects_ms", effectsT0);
          else markT5(t5, "S11");
          markT5(t5, "S12");
        }
        /** ④ 방 bump — target·durable 뒤 시작, 응답은 기다리지 않는다 */
        roomBumpStarted = true;
        const bumpPromise = (async () => {
          if (t5) markT5(t5, "S14");
          try {
            const { publishTextSendRoomBump } = await import(
              "@/lib/community-messenger/server/publish-text-send-room-bump"
            );
            const bumpPubT0 = performance.now();
            await publishTextSendRoomBump(bumpArgs);
            if (t5) {
              spanT5(t5, "S17_room_bump_ms", bumpPubT0);
              markT5(t5, "S17");
            }
          } catch {
            /* best-effort: 수신측은 Postgres Realtime·재요청으로 정합 */
          }
        })();
        after(bumpPromise);
        /** ⑤ 자동 읽음 — target bump 완료 뒤(I5) */
        const autoReadIds = deferredPostAck?.autoReadRecipientIds ?? [];
        if (autoReadIds.length > 0) {
          const { markRoomRead } = await import("@/lib/notifications/pipeline/notify-read-service");
          await Promise.all(
            autoReadIds.map((rid) => markRoomRead(sb, rid, canonicalRoomId).catch(() => undefined))
          );
        }
      }
    } catch {
      /* best-effort — do not fail the send ACK */
    }
    if (t5) markT5(t5, "S13");
    if (!roomBumpStarted) {
      /** 서비스 클라이언트 없음 등 — 기존과 같이 after() 안에서 방 bump */
      after(async () => {
        try {
          const { publishTextSendRoomBump } = await import(
            "@/lib/community-messenger/server/publish-text-send-room-bump"
          );
          await publishTextSendRoomBump(bumpArgs);
        } catch {
          /* best-effort */
        }
      });
    }
    after(async () => {
      /** FCM/OS push + item_trade 미러 — 방 bump 와 실패 격리(기존 M-1 과 같음) */
      try {
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
      } catch {
        /* best-effort: push/mirror must not block or undo bump */
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
      /** F1: 확정 행 재조회 실패 — 저장 여부를 알 수 없음 → 503 */
      responsePayload = { ok: false, error: MESSENGER_SEND_UNAVAILABLE_ERROR };
    }
  }
  if (t5 && responsePayload.ok) {
    responsePayload = { ...responsePayload, t5: t5TraceToJson(t5) };
  }
  const handlerMs = Math.round(performance.now() - t0);
  const routeMs = Math.round(performance.now() - wall0);
  const sendUnavailable = !responsePayload.ok && isMessengerSendUnavailableError(responsePayload.error);
  recordMessengerApiTiming(
    "POST /api/community-messenger/rooms/[roomId]/messages",
    handlerMs,
    responsePayload.ok
      ? 200
      : sendUnavailable
        ? 503
        : responsePayload.error === "blocked_target" || responsePayload.error === "rejected_by_peer"
          ? 403
          : 400
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
  if (sendUnavailable) {
    /** F1: 서버 저장 여부 불명 → 503 + 코드 `message_send_unavailable`(문구는 요청 언어) — 클라이언트는 실패 행 유지 */
    const language = await resolveRequestAppLanguageOr("ko");
    return jsonError(
      translateBy(language, "nav_messenger_send_unavailable"),
      { status: 503, headers: ackHeaders },
      { code: MESSENGER_SEND_UNAVAILABLE_ERROR }
    );
  }
  return responsePayload.ok
    ? jsonOk(responsePayload, { headers: ackHeaders })
    : responsePayload.error === "blocked_target"
      ? jsonError(
          "차단된 사용자와는 메시지를 주고받을 수 없습니다.",
          { status: 403, headers: ackHeaders },
          { ...responsePayload, code: "blocked_target", error: "blocked_target" }
        )
      : responsePayload.error === "rejected_by_peer"
        ? jsonError(
            "상대가 친구 요청을 거절해 메시지를 보낼 수 없습니다.",
            { status: 403, headers: ackHeaders },
            { ...responsePayload, code: "rejected_by_peer", error: "rejected_by_peer" }
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
