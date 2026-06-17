import { NextRequest, NextResponse } from "next/server";
import { getOptionalRouteHandlerCookieAuth } from "@/lib/auth/get-optional-authenticated-user-id";
import { enforceRateLimit, getOrCreateRequestId, getRateLimitKey, jsonError, withRequestIdHeaders } from "@/lib/http/api-route";
import {
  getPresenceSnapshotsByUserIds,
  PRESENCE_UPSERT_SOFT_TIMEOUT_MS,
  upsertPresenceSnapshot,
  type PresenceUpsertInput,
} from "@/lib/community-messenger/presence/presence-store";
import { presenceLog } from "@/lib/community-messenger/presence/presence-log";
import type { CommunityMessengerPresenceState } from "@/lib/community-messenger/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel 504 전에 soft-timeout(2.5s)으로 응답 — 함수 상한은 10s */
export const maxDuration = 10;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function parsePostBody(raw: unknown): Omit<PresenceUpsertInput, "userId"> | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  return {
    status: (body.status as CommunityMessengerPresenceState | undefined) ?? null,
    surface: typeof body.surface === "string" ? body.surface : null,
    roomId: typeof body.roomId === "string" ? body.roomId : null,
    callId: typeof body.callId === "string" ? body.callId : null,
    lastSeenAt: typeof body.lastSeenAt === "string" ? body.lastSeenAt : null,
    lastPingAt: typeof body.lastPingAt === "string" ? body.lastPingAt : null,
    lastActivityAt: typeof body.lastActivityAt === "string" ? body.lastActivityAt : null,
    appVisibility: typeof body.appVisibility === "string" ? body.appVisibility : null,
    sessionEnd: body.sessionEnd === true,
  };
}

async function upsertWithSoftTimeout(
  sb: NonNullable<Awaited<ReturnType<typeof getOptionalRouteHandlerCookieAuth>>["supabase"]>,
  userId: string,
  input: Omit<PresenceUpsertInput, "userId">
) {
  const upsertStart = Date.now();
  presenceLog("upsert_start", { userIdLen: userId.length });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ kind: "timeout" }>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), PRESENCE_UPSERT_SOFT_TIMEOUT_MS);
  });
  const upsertPromise = upsertPresenceSnapshot(sb, { ...input, userId }).then((r) => ({
    kind: "done" as const,
    result: r,
  }));

  try {
    const outcome = await Promise.race([upsertPromise, timeoutPromise]);
    if (outcome.kind === "timeout") {
      presenceLog("soft_timeout", { durationMs: Date.now() - upsertStart });
      return {
        ok: false as const,
        softFailed: true,
        serverTime: new Date().toISOString(),
      };
    }
    presenceLog("upsert_done", { durationMs: Date.now() - upsertStart, ok: outcome.result.ok });
    if (!outcome.result.ok) {
      return { ok: false as const, error: outcome.result.error, softFailed: false };
    }
    return { ok: true as const, serverTime: new Date().toISOString() };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const auth = await getOptionalRouteHandlerCookieAuth();
  if (!auth.userId) {
    return jsonError("로그인이 필요합니다.", 401, { authenticated: false });
  }

  const rawIds = req.nextUrl.searchParams.get("userIds");
  const ids = [...new Set(String(rawIds ?? "").split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 24);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, snapshots: [] }, { headers: NO_STORE_HEADERS });
  }

  const sb = auth.supabase;
  if (!sb) {
    return NextResponse.json(
      { ok: true, snapshots: ids.map((userId) => ({ userId, state: "offline", lastSeenAt: null })) },
      { headers: NO_STORE_HEADERS }
    );
  }

  const snapshots = await getPresenceSnapshotsByUserIds(sb, ids);
  return NextResponse.json(
    {
      ok: true,
      snapshots: ids.map((userId) => snapshots.get(userId) ?? { userId, state: "offline", lastSeenAt: null }),
    },
    { headers: NO_STORE_HEADERS }
  );
}

export async function POST(req: NextRequest) {
  const requestId = getOrCreateRequestId(req);
  presenceLog("request_start", { requestId });

  const auth = await getOptionalRouteHandlerCookieAuth();
  if (!auth.userId) {
    return jsonError("로그인이 필요합니다.", 401, { authenticated: false });
  }

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:presence:${getRateLimitKey(req, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "실시간 접속 상태 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_presence_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let parsed: Omit<PresenceUpsertInput, "userId"> | null = null;
  try {
    parsed = parsePostBody(await req.json());
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      withRequestIdHeaders({ status: 400, headers: NO_STORE_HEADERS }, requestId)
    );
  }

  const sb = auth.supabase;
  if (!sb) {
    return NextResponse.json(
      { ok: true, serverTime: new Date().toISOString() },
      withRequestIdHeaders({ status: 200, headers: NO_STORE_HEADERS }, requestId)
    );
  }

  const outcome = await upsertWithSoftTimeout(sb, auth.userId, parsed);
  if (outcome.ok) {
    return NextResponse.json(
      { ok: true, serverTime: outcome.serverTime },
      withRequestIdHeaders({ status: 200, headers: NO_STORE_HEADERS }, requestId)
    );
  }
  if ("softFailed" in outcome && outcome.softFailed) {
    return NextResponse.json(
      { ok: false, softFailed: true, serverTime: outcome.serverTime },
      withRequestIdHeaders({ status: 202, headers: NO_STORE_HEADERS }, requestId)
    );
  }
  return NextResponse.json(
    { ok: false, error: outcome.error ?? "presence_upsert_failed" },
    withRequestIdHeaders({ status: 400, headers: NO_STORE_HEADERS }, requestId)
  );
}
