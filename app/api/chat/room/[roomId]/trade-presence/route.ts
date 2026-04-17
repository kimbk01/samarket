import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadChatRoomDetailForUser } from "@/lib/chats/server/load-chat-room-detail";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { parseRoomId } from "@/lib/validate-params";
import {
  tradePresenceCanSeePeerLastSeen,
  tradePresencePeerAllowsLiveShare,
  tradePresenceViewerMayPublishLive,
} from "@/lib/chats/trade-presence-rules";
import { formatTradeLastSeenKo } from "@/lib/chats/trade-presence-policy";

export const dynamic = "force-dynamic";

type PresenceRow = {
  id: string;
  trade_presence_last_seen_at: string | null;
  trade_presence_show_online: boolean | null;
  trade_presence_hide_last_seen: boolean | null;
  trade_presence_audience: string | null;
};

/** GET — 거래 1:1 방에서 상대 presence 규칙·last_seen(프라이버시 적용) */
export async function GET(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId: raw } = await params;
  const roomId = parseRoomId(raw);
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "invalid_room" }, { status: 400 });
  }

  const detail = await loadChatRoomDetailForUser({ roomId, userId: auth.userId });
  if (!detail.ok) {
    return NextResponse.json({ ok: false, error: detail.error }, { status: detail.status });
  }

  const room = detail.room;
  const isTradeProduct = room.chatDomain === "trade" && !room.generalChat;
  if (!isTradeProduct) {
    return NextResponse.json({ ok: false, error: "not_trade_room" }, { status: 404 });
  }

  const partnerId = room.buyerId === auth.userId ? room.sellerId : room.buyerId;
  if (!partnerId?.trim()) {
    return NextResponse.json({ ok: false, error: "partner_missing" }, { status: 404 });
  }

  let sb: ReturnType<typeof getSupabaseServer> | null = null;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data, error } = await sb
    .from("profiles")
    .select(
      "id, trade_presence_last_seen_at, trade_presence_show_online, trade_presence_hide_last_seen, trade_presence_audience"
    )
    .in("id", [auth.userId, partnerId]);

  if (error) {
    if (error.message?.includes("column") || error.message?.includes("does not exist")) {
      return NextResponse.json({
        ok: true,
        partnerId,
        viewerMayPublishLive: true,
        peerSharesLive: true,
        peerLastSeenAt: null,
        peerLastSeenLabel: "",
        schema_missing: true,
      });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PresenceRow[];
  const viewer = rows.find((r) => r.id === auth.userId);
  const peer = rows.find((r) => r.id === partnerId);

  const viewerRow = {
    trade_presence_show_online: viewer?.trade_presence_show_online !== false,
    trade_presence_hide_last_seen: viewer?.trade_presence_hide_last_seen === true,
    trade_presence_audience: (viewer?.trade_presence_audience as string) || "friends",
  };
  const peerRow = {
    trade_presence_show_online: peer?.trade_presence_show_online !== false,
    trade_presence_hide_last_seen: peer?.trade_presence_hide_last_seen === true,
    trade_presence_audience: (peer?.trade_presence_audience as string) || "friends",
  };

  const canSeeLastSeen = tradePresenceCanSeePeerLastSeen(
    viewerRow.trade_presence_hide_last_seen,
    peerRow.trade_presence_hide_last_seen
  );
  const peerLastSeenAt = canSeeLastSeen ? peer?.trade_presence_last_seen_at ?? null : null;
  const peerSharesLive = tradePresencePeerAllowsLiveShare({
    trade_presence_show_online: peerRow.trade_presence_show_online,
    trade_presence_audience: peerRow.trade_presence_audience,
  });
  const viewerMayPublishLive = tradePresenceViewerMayPublishLive({
    trade_presence_show_online: viewerRow.trade_presence_show_online,
    trade_presence_audience: viewerRow.trade_presence_audience,
  });

  return NextResponse.json({
    ok: true,
    partnerId,
    viewerMayPublishLive,
    peerSharesLive,
    peerLastSeenAt,
    peerLastSeenLabel: peerLastSeenAt ? formatTradeLastSeenKo(peerLastSeenAt) : "",
  });
}
