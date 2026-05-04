/**
 * POST /api/chat/item/start — 거래 채팅 시작/재사용 (구매자=세션)
 * Body: { itemId: string }
 *
 * 본문: `lib/trade/item-trade-chat-start-core.ts` — resolve 가 동일 코어를 직접 호출(내부 HTTP 제거).
 * @see docs/trade-chat-room-identity.md
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { runItemTradeChatStartCore } from "@/lib/trade/item-trade-chat-start-core";
import { createTradeEntryPerfTrace } from "@/lib/trade/trade-entry-perf-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const perf = createTradeEntryPerfTrace();
  perf?.mark("auth_start");
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const buyerId = auth.userId;
  perf?.mark("session_validate");
  const session = await validateActiveSession(buyerId);
  if (!session.ok) return session.response;

  perf?.mark("service_supabase");
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    perf?.finish("item_start_route", { outcome: "no_service_sb" });
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 500 });
  }

  let body: { itemId?: string };
  try {
    body = await req.json();
  } catch {
    perf?.finish("item_start_route", { outcome: "bad_json" });
    return NextResponse.json({ ok: false, error: "itemId 필요" }, { status: 400 });
  }
  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  if (!itemId) {
    perf?.finish("item_start_route", { outcome: "no_item_id" });
    return NextResponse.json({ ok: false, error: "itemId 필요" }, { status: 400 });
  }

  perf?.mark("core_item_trade_start");
  const result = await runItemTradeChatStartCore({
    buyerId,
    itemId,
    sb: sb as never,
    perf,
  });
  perf?.mark("core_done");

  if (!result.ok) {
    perf?.finish("item_start_route", { outcome: "error", httpStatus: result.httpStatus });
    return NextResponse.json(result.body, { status: result.httpStatus });
  }
  perf?.finish("item_start_route", { outcome: "ok" });
  return NextResponse.json(result.body, { status: result.httpStatus });
}
