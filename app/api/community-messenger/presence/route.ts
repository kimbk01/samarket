import { NextRequest, NextResponse } from "next/server";
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
    message: "실시간 접속 상태 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
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

  return NextResponse.json(result, withRequestIdHeaders({ status: 200 }, requestId));
}
