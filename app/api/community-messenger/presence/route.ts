import { after, NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getOrCreateRequestId, getRateLimitKey, withRequestIdHeaders } from "@/lib/http/api-route";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rawIds = req.nextUrl.searchParams.get("userIds");
  const ids = [...new Set(String(rawIds ?? "").split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 24);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, snapshots: [] });
  }
  const { getCommunityMessengerPresenceSnapshotsByUserIds } = await import("@/lib/community-messenger/service");
  const snapshots = await getCommunityMessengerPresenceSnapshotsByUserIds(ids);
  return NextResponse.json({
    ok: true,
    snapshots: ids.map((userId) => snapshots.get(userId) ?? { userId, state: "offline", lastSeenAt: null }),
  });
}

export async function POST(req: NextRequest) {
  const requestId = getOrCreateRequestId(req);

  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) {
    try {
      // eslint-disable-next-line no-console -- presence 진단(401은 클라 400과 분리)
      console.warn("[cm-presence-api]", {
        phase: "auth_failed",
        requestId,
        httpStatus: auth.response.status,
      });
    } catch {
      /* ignore */
    }
    return auth.response;
  }

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:presence:${getRateLimitKey(req, auth.userId)}`,
    limit: 180,
    windowMs: 60_000,
    code: "community_messenger_presence_rate_limited",
  });
  if (!rateLimit.ok) {
    try {
      // eslint-disable-next-line no-console -- presence 진단
      console.warn("[cm-presence-api]", {
        phase: "rate_limited",
        requestId,
        userIdLen: auth.userId.length,
      });
    } catch {
      /* ignore */
    }
    return rateLimit.response;
  }

  let body: {
    lastSeenAt?: string | null;
    lastPingAt?: string | null;
    lastActivityAt?: string | null;
    appVisibility?: string | null;
    activeRoomId?: string | null;
    sessionEnd?: boolean;
    /** D1 2단계 — 상태 전환(앞화면 진입·백그라운드·유휴 복귀·종료). keepalive 는 false/없음 */
    transition?: boolean;
  } | null = null;
  let jsonParseFailed = false;
  try {
    body = (await req.json()) as {
      lastSeenAt?: string | null;
      lastPingAt?: string | null;
      lastActivityAt?: string | null;
      appVisibility?: string | null;
      sessionEnd?: boolean;
    };
  } catch {
    jsonParseFailed = true;
    body = null;
  }

  const payloadDiag = {
    jsonParseFailed,
    keys: body && typeof body === "object" ? Object.keys(body as object) : [],
    sessionEnd: body?.sessionEnd === true,
    hasLastSeenAt: typeof body?.lastSeenAt === "string",
    hasLastPingAt: typeof body?.lastPingAt === "string",
    hasLastActivityAt: typeof body?.lastActivityAt === "string",
    appVisibilityKind: typeof body?.appVisibility === "string" ? "string" : body?.appVisibility == null ? "absent" : "non_string",
    /** 값 노출 최소화 — 형식만 */
    lastPingAtLen: typeof body?.lastPingAt === "string" ? body.lastPingAt.length : 0,
    lastActivityAtLen: typeof body?.lastActivityAt === "string" ? body.lastActivityAt.length : 0,
  };

  const routeSb = await createSupabaseRouteHandlerClient();
  const { upsertCommunityMessengerPresenceSnapshot } = await import("@/lib/community-messenger/service");
  const result = await upsertCommunityMessengerPresenceSnapshot(
    {
      userId: auth.userId,
      lastSeenAt: typeof body?.lastSeenAt === "string" ? body.lastSeenAt : null,
      lastPingAt: typeof body?.lastPingAt === "string" ? body.lastPingAt : null,
      lastActivityAt: typeof body?.lastActivityAt === "string" ? body.lastActivityAt : null,
      appVisibility: typeof body?.appVisibility === "string" ? body.appVisibility : null,
      activeRoomId: typeof body?.activeRoomId === "string" ? body.activeRoomId : null,
      sessionEnd: body?.sessionEnd === true,
    },
    { supabase: routeSb }
  );

  if (!result.ok) {
    try {
      // eslint-disable-next-line no-console -- presence 400 원인 확정용
      console.warn("[cm-presence-api]", {
        phase: "upsert_denied",
        requestId,
        userIdLen: auth.userId.length,
        error: result.error ?? null,
        responseBody: result,
        payloadDiag,
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json(result, withRequestIdHeaders({ status: 400 }, requestId));
  }

  /**
   * D1 2단계 — 전환일 때만 그 사용자 비공개 토픽(`cm-presence-user:<id>`)에 1건 발행.
   * 구독자 = 실시간으로 보고 있는 상대(1:1 머리글)뿐 — 전역 N² 전파 없음. keepalive 는 발행하지 않는다.
   * 응답 뒤(after)에 보낸다 — 실패해도 보는 쪽은 판정 창 만료 재확인으로 수렴.
   */
  const isTransition = body?.transition === true || body?.sessionEnd === true;
  if (isTransition) {
    const offline = body?.sessionEnd === true || body?.appVisibility === "background";
    const lastSeenAt = result.lastSeenAt ?? new Date().toISOString();
    after(async () => {
      const { publishCommunityMessengerPresenceTransitionFromServer } = await import(
        "@/lib/community-messenger/realtime/presence/presence-user-broadcast-server"
      );
      await publishCommunityMessengerPresenceTransitionFromServer({
        userId: auth.userId,
        state: offline ? "offline" : "online",
        lastSeenAt,
      }).catch(() => {});
    });
  }

  return NextResponse.json(result, withRequestIdHeaders({ status: 200 }, requestId));
}
