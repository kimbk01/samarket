import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import { resolveTradeChatEntry } from "@/lib/chat-domain/use-cases/trade-chat-entry-resolve";
import { createTradeEntryPerfTrace } from "@/lib/trade/trade-entry-perf-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EntryResolveBody = {
  productId?: string;
};

export async function POST(req: NextRequest) {
  const perf = createTradeEntryPerfTrace();
  perf?.mark("resolve_route_auth");
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  perf?.mark("resolve_route_session");
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }

  const profileGate = await requireProfileFieldsForAction(
    sb as import("@supabase/supabase-js").SupabaseClient,
    auth.userId,
    "trade_chat"
  );
  if (!profileGate.ok) return profileGate.response;

  let body: EntryResolveBody;
  try {
    body = (await req.json()) as EntryResolveBody;
  } catch {
    perf?.finish("entry_resolve_route", { outcome: "bad_json" });
    return NextResponse.json({ ok: false, error: "productId 필요" }, { status: 400 });
  }

  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  if (!productId) {
    perf?.finish("entry_resolve_route", { outcome: "no_product_id" });
    return NextResponse.json({ ok: false, error: "productId 필요" }, { status: 400 });
  }

  perf?.mark("resolve_trade_chat_entry_fn");
  const result = await resolveTradeChatEntry(auth.userId, productId, perf);
  perf?.mark("resolve_trade_chat_entry_return");

  if (!result.ok) {
    perf?.finish("entry_resolve_route", { outcome: "error", httpStatus: result.status });
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status >= 400 ? result.status : 400 });
  }

  perf?.mark("resolve_json_response");
  perf?.finish("entry_resolve_route", { outcome: "ok", roomSource: result.roomSource });
  return NextResponse.json({
    ok: true,
    roomId: result.roomId,
    roomSource: result.roomSource,
    ...(result.messengerRoomId ? { messengerRoomId: result.messengerRoomId } : {}),
  });
}
