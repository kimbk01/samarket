import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { runTradeChatListMetaWithDedupe } from "@/lib/community-messenger/trade-chat-list-meta-route-cache";
import { runWithTradeMetaRequestScope } from "@/lib/community-messenger/trade-meta-request-scope";
import { devPerfNow, logDevApiPerf } from "@/lib/dev/dev-api-perf-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { roomIds?: unknown };

/**
 * 거래 채팅 탭 — 목록 행 `contextMeta`(썸네일·가격)가 비어 있을 때 클라이언트가 배치로 보강한다.
 * 서버는 부트스트랩과 동일한 요약 + `enrichTradeRoomContextMetaForBootstrap` 경로를 재사용한다.
 */
export async function POST(req: NextRequest) {
  const t0 = devPerfNow();
  const auth0 = devPerfNow();
  const auth = await requireAuthenticatedUserId();
  const authMs = devPerfNow() - auth0;
  if (!auth.ok) return auth.response;

  const rl0 = devPerfNow();
  const rateLimit = await enforceRateLimit({
    key: `community-messenger:trade-chat-list-meta:${getRateLimitKey(req, auth.userId)}`,
    limit: 45,
    windowMs: 60_000,
    message: "거래 목록 보강 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_trade_chat_list_meta_rate_limited",
  });
  const rateLimitMs = devPerfNow() - rl0;
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

  const hydrate0 = devPerfNow();
  const { hydrateTradeChatListContextMetaForRoomIds } = await import("@/lib/community-messenger/service");
  console.log("[trade-meta-perf]", {
    phase: "before",
    room_count: roomIds.length,
    user_id_tail: auth.userId.slice(-6),
  });
  const { patches, perf } = await runWithTradeMetaRequestScope(() =>
    runTradeChatListMetaWithDedupe(auth.userId, roomIds, () =>
      hydrateTradeChatListContextMetaForRoomIds(auth.userId, roomIds)
    )
  );
  const hydrateMs = devPerfNow() - hydrate0;
  console.log("[trade-meta-perf]", {
    phase: "after",
    room_count: roomIds.length,
    patch_count: patches.length,
    trade_chat_meta_total_ms: typeof perf.trade_chat_meta_total_ms === "number" ? perf.trade_chat_meta_total_ms : Math.round(hydrateMs),
    trade_list_meta_ultra_light: perf.trade_list_meta_ultra_light ?? 0,
    top_bottleneck: perf.trade_chat_meta_top_bottleneck ?? null,
  });

  const metaTotal = typeof perf.trade_chat_meta_total_ms === "number" ? perf.trade_chat_meta_total_ms : Math.round(hydrateMs);
  logDevApiPerf("/api/community-messenger/trade-chat-list-meta", {
    auth_session_ms: Math.round(authMs),
    rate_limit_ms: Math.round(rateLimitMs),
    profile_query_ms: 0,
    store_query_ms: 0,
    badge_query_ms: 0,
    supabase_query_ms: Math.round(hydrateMs),
    payload_build_ms: Math.round(hydrateMs),
    total_route_ms: Math.round(devPerfNow() - t0),
    room_count: roomIds.length,
    trade_chat_meta_total_ms: metaTotal,
    trade_chat_meta_hydrate_wall_ms: Math.round(hydrateMs),
    ...perf,
  });

  return NextResponse.json({ ok: true, patches });
}
