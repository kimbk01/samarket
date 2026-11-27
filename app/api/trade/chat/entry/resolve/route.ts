import { NextRequest, NextResponse } from "next/server";
import { tradeApiError, tradeErrorCodeOf } from "@/lib/trade/trade-api-error-response";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import { resolveTradeChatEntry } from "@/lib/chat-domain/use-cases/trade-chat-entry-resolve";
import { createTradeEntryPerfTrace } from "@/lib/trade/trade-entry-perf-log";
import { requireRegistrationForAction } from "@/lib/auth/require-registration-for-action.server";

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
    perf?.finish("entry_resolve_route", { outcome: "server_config" });
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }

  const profileGate = await requireProfileFieldsForAction(
    sb as import("@supabase/supabase-js").SupabaseClient,
    auth.userId,
    "trade_chat"
  );
  if (!profileGate.ok) {
    perf?.finish("entry_resolve_route", { outcome: "profile_incomplete" });
    return profileGate.response;
  }

  let body: EntryResolveBody;
  try {
    body = (await req.json()) as EntryResolveBody;
  } catch {
    perf?.finish("entry_resolve_route", { outcome: "bad_json" });
    return tradeApiError("invalid_request", 400);
  }

  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  if (!productId) {
    perf?.finish("entry_resolve_route", { outcome: "no_product_id" });
    return tradeApiError("invalid_request", 400);
  }

  /**
   * 섞인 경로(설계 2026-11-21 §4 C, 재감사3 #6) — 이미 있는 거래 채팅방 다시 열기는 가입 없이(열람),
   * 새 채팅방 만들기만 가입 확인.
   */
  const [existingRoom, existingLegacy] = await Promise.all([
    sb.from("chat_rooms").select("id").eq("item_id", productId).eq("buyer_id", auth.userId).limit(1),
    sb.from("product_chats").select("id").eq("post_id", productId).eq("buyer_id", auth.userId).limit(1),
  ]);
  const hasExistingTradeRoom =
    (Array.isArray(existingRoom.data) && existingRoom.data.length > 0) ||
    (Array.isArray(existingLegacy.data) && existingLegacy.data.length > 0);
  if (!hasExistingTradeRoom) {
    const registrationGate = await requireRegistrationForAction(auth.userId);
    if (registrationGate) {
      perf?.finish("entry_resolve_route", { outcome: "registration_required" });
      return registrationGate;
    }
  }
  perf?.mark("resolve_trade_chat_entry_fn");
  const result = await resolveTradeChatEntry(auth.userId, productId, perf);
  perf?.mark("resolve_trade_chat_entry_return");

  if (!result.ok) {
    perf?.finish("entry_resolve_route", { outcome: "error", httpStatus: result.status });
    const code = tradeErrorCodeOf(result.error);
    return NextResponse.json(
      { ok: false, error: result.error, ...(code ? { code } : {}) },
      { status: result.status >= 400 ? result.status : 400 }
    );
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
