import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { hydrateTradeChatListContextMetaForRoomIds } from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { roomIds?: unknown };

/**
 * 거래 채팅 탭 — 목록 행 `contextMeta`(썸네일·가격)가 비어 있을 때 클라이언트가 배치로 보강한다.
 * 서버는 부트스트랩과 동일한 요약 + `enrichTradeRoomContextMetaForBootstrap` 경로를 재사용한다.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:trade-chat-list-meta:${getRateLimitKey(req, auth.userId)}`,
    limit: 45,
    windowMs: 60_000,
    message: "거래 목록 보강 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_trade_chat_list_meta_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const raw = body.roomIds;
  const roomIds = Array.isArray(raw)
    ? raw.map((x) => (typeof x === "string" ? x : String(x ?? "")).trim()).filter(Boolean)
    : [];
  if (roomIds.length === 0) {
    return NextResponse.json({ ok: true, patches: [] as Array<{ roomId: string; contextMeta: unknown }> });
  }

  const patches = await hydrateTradeChatListContextMetaForRoomIds(auth.userId, roomIds);
  return NextResponse.json({ ok: true, patches });
}
