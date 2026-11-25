import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAGES = new Set(["pick", "prepare", "upload_url", "put", "finalize"]);
const SAFE = /[^a-zA-Z0-9_.:\-]/g;

/**
 * 채팅 영상 보내기 실패 진단(재감사 2026-11-25 S-D) — 클라이언트가 **실패할 때만** 1건 보낸다.
 * DB 에 쓰지 않고 Vercel 런타임 로그에만 남긴다(`[messenger-video-send-failure]`). 사용자 id 는 앞 8자만.
 * Body: `{ stage, code, platform, sizeBytes?, durationMs? }`
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const rateLimit = await enforceRateLimit({
    key: `community-messenger:video-failure:${getRateLimitKey(req, auth.userId)}`,
    limit: 10,
    windowMs: 60_000,
    code: "community_messenger_video_failure_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;
  const { roomId } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const stage = typeof body?.stage === "string" && STAGES.has(body.stage) ? body.stage : "unknown";
  const code = typeof body?.code === "string" ? body.code.replace(SAFE, "_").slice(0, 120) : "";
  const platform = typeof body?.platform === "string" ? body.platform.replace(SAFE, "_").slice(0, 20) : "";
  const sizeBytes = Number(body?.sizeBytes);
  const durationMs = Number(body?.durationMs);
  console.warn("[messenger-video-send-failure]", {
    stage,
    code,
    platform,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
    durationMs: Number.isFinite(durationMs) ? durationMs : null,
    user8: auth.userId.slice(0, 8),
    room8: String(roomId ?? "").slice(0, 8),
    ua: (req.headers.get("user-agent") ?? "").slice(0, 160),
  });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
