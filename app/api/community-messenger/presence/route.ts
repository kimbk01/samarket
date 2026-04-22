import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import {
  getCommunityMessengerPresenceSnapshotsByUserIds,
  upsertCommunityMessengerPresenceSnapshot,
} from "@/lib/community-messenger/service";

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
  const snapshots = await getCommunityMessengerPresenceSnapshotsByUserIds(ids);
  return NextResponse.json({
    ok: true,
    snapshots: ids.map((userId) => snapshots.get(userId) ?? { userId, state: "offline", lastSeenAt: null }),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:presence:${getRateLimitKey(req, auth.userId)}`,
    limit: 180,
    windowMs: 60_000,
    message: "실시간 접속 상태 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_presence_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: {
    lastSeenAt?: string | null;
    lastPingAt?: string | null;
    lastActivityAt?: string | null;
    appVisibility?: string | null;
    sessionEnd?: boolean;
  } | null = null;
  try {
    body = (await req.json()) as {
      lastSeenAt?: string | null;
      lastPingAt?: string | null;
      lastActivityAt?: string | null;
      appVisibility?: string | null;
      sessionEnd?: boolean;
    };
  } catch {
    body = null;
  }

  const result = await upsertCommunityMessengerPresenceSnapshot({
    userId: auth.userId,
    lastSeenAt: typeof body?.lastSeenAt === "string" ? body.lastSeenAt : null,
    lastPingAt: typeof body?.lastPingAt === "string" ? body.lastPingAt : null,
    lastActivityAt: typeof body?.lastActivityAt === "string" ? body.lastActivityAt : null,
    appVisibility: typeof body?.appVisibility === "string" ? body.appVisibility : null,
    sessionEnd: body?.sessionEnd === true,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
