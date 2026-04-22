/**
 * POST /api/chat/rooms/:roomId/leave — item_trade `chat_rooms` 나가기 (soft, 세션)
 *
 * CM 방이 연결돼 있으면 `leaveMessengerRoomUnified` 로 `product_chats`·CM·레거시 참가자를 한 번에 맞춘다.
 * 메신저 미가입(참가자 행 없음) 등은 기존 `chat_room_participants` + `product_chats` 경로로 폴백한다.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { syncPostInquiryNegotiatingFromItemTradeChats } from "@/lib/trade/maybe-auto-promote-trade-listing-negotiating";
import { leaveMessengerRoomUnified } from "@/lib/messenger-policy/leave-chat-room-orchestration.server";
import { resolveProductChat, type ResolveProductChatResult } from "@/lib/trade/resolve-product-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function trimId(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function applyProductChatLeaveIfNeeded(
  sb: import("@supabase/supabase-js").SupabaseClient<any>,
  userId: string,
  resolved: ResolveProductChatResult
): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = resolved.productChat as {
    id?: string;
    post_id?: string | null;
    seller_id?: string | null;
    buyer_id?: string | null;
    seller_left_at?: string | null;
    buyer_left_at?: string | null;
    community_messenger_room_id?: string | null;
  };
  const sid = trimId(r.seller_id);
  const bid = trimId(r.buyer_id);
  if (sid !== userId && bid !== userId) {
    return { ok: false, error: "참여자만 나갈 수 있습니다." };
  }
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (sid === userId) {
    if (r.seller_left_at) {
      const cmrid = trimId(r.community_messenger_room_id);
      if (cmrid) {
        await sb.from("community_messenger_participants").delete().eq("room_id", cmrid).eq("user_id", userId);
      }
      return { ok: true };
    }
    patch.seller_left_at = now;
  } else {
    if (r.buyer_left_at) {
      const cmrid = trimId(r.community_messenger_room_id);
      if (cmrid) {
        await sb.from("community_messenger_participants").delete().eq("room_id", cmrid).eq("user_id", userId);
      }
      return { ok: true };
    }
    patch.buyer_left_at = now;
  }
  const { error: upErr } = await sb.from("product_chats").update(patch).eq("id", resolved.productChatId);
  if (upErr) {
    return { ok: false, error: "거래 채팅 나가기 동기화에 실패했습니다." };
  }
  const cmrid = trimId(r.community_messenger_room_id);
  if (cmrid) {
    await sb.from("community_messenger_participants").delete().eq("room_id", cmrid).eq("user_id", userId);
  }
  return { ok: true };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const { roomId } = await params;
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });
  }

  const sbAny = sb;
  let quiet = false;
  try {
    const body = (await req.json()) as { quiet?: unknown } | null;
    if (body && typeof body === "object" && body.quiet === true) quiet = true;
  } catch {
    /* empty body */
  }

  const now = new Date().toISOString();
  const { data: roomRow, error: roomErr } = await sbAny
    .from("chat_rooms")
    .select("id, room_type, item_id, community_messenger_room_id")
    .eq("id", roomId)
    .maybeSingle();
  if (roomErr || !roomRow) {
    return NextResponse.json({ ok: false, error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }
  if ((roomRow as { room_type?: string | null }).room_type !== "item_trade") {
    return NextResponse.json({ ok: false, error: "삭제된 채팅 유형입니다." }, { status: 404 });
  }

  const resolved = await resolveProductChat(sbAny, roomId);
  const cmFromRoom = trimId((roomRow as { community_messenger_room_id?: unknown }).community_messenger_room_id);
  const cmId = trimId(resolved?.messengerRoomId) || cmFromRoom;

  let unifiedLeaveOk = false;
  let unifiedMirroredLegacyItemTradeRoomId: string | undefined;
  let unifiedListingSyncStarted = false;
  if (cmId) {
    const unified = await leaveMessengerRoomUnified(sbAny, userId, cmId, { quiet });
    if (unified.ok) {
      unifiedLeaveOk = true;
      unifiedMirroredLegacyItemTradeRoomId = unified.mirroredLegacyItemTradeRoomId;
      unifiedListingSyncStarted = unified.tradeListingStateSyncStarted === true;
      const alreadyMirroredHere =
        Boolean(unifiedMirroredLegacyItemTradeRoomId) && unifiedMirroredLegacyItemTradeRoomId === roomId;
      if (!alreadyMirroredHere) {
        await sbAny
          .from("chat_room_participants")
          .update({
            left_at: now,
            is_active: false,
            hidden: true,
            updated_at: now,
          })
          .eq("room_id", roomId)
          .eq("user_id", userId);
      }
    } else if (unified.error !== "room_not_found") {
      const msg =
        unified.error === "trade_room_not_found"
          ? "거래 채팅을 찾을 수 없습니다."
          : unified.error === "forbidden"
            ? "참여자만 나갈 수 있습니다."
            : unified.error === "owner_cannot_leave"
              ? "방장은 나갈 수 없습니다."
              : unified.error === "trade_leave_failed" || unified.error === "leave_failed"
                ? "나가기 처리에 실패했습니다. 잠시 후 다시 시도해 주세요."
                : "나가기 처리에 실패했습니다.";
      const status =
        unified.error === "forbidden"
          ? 403
          : unified.error === "trade_room_not_found"
            ? 404
            : unified.error === "owner_cannot_leave"
              ? 400
              : 500;
      return NextResponse.json({ ok: false, error: msg }, { status });
    }
  }

  if (resolved && !unifiedLeaveOk) {
    const pcLeave = await applyProductChatLeaveIfNeeded(sbAny, userId, resolved);
    if (!pcLeave.ok) {
      return NextResponse.json({ ok: false, error: pcLeave.error }, { status: 403 });
    }
  }

  if (!unifiedLeaveOk) {
    const { data: part, error: upErr } = await sbAny
      .from("chat_room_participants")
      .update({
        left_at: now,
        is_active: false,
        hidden: true,
        updated_at: now,
      })
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .select("id")
      .single();

    if (upErr || !part) {
      return NextResponse.json({ ok: false, error: "참여 정보를 찾을 수 없습니다." }, { status: 404 });
    }
  }

  const postIdFromResolved = resolved
    ? trimId((resolved.productChat as { post_id?: unknown }).post_id)
    : "";
  const itemId = (roomRow as { item_id?: string | null }).item_id?.trim() ?? "";
  const postIdForListingSync = postIdFromResolved || itemId;
  if (postIdForListingSync && !unifiedListingSyncStarted) {
    void syncPostInquiryNegotiatingFromItemTradeChats(sbAny, postIdForListingSync).catch(() => {
      /* 물품 단계 재집계 실패해도 나가기는 완료 */
    });
  }

  /** unified 거래 경로가 동일 `roomId` 에 대해 참가자·잠금·이벤트 로그까지 끝낸 경우 이중 쿼리 생략 */
  const legacyItemTradeSideEffectsDoneInUnified =
    unifiedLeaveOk &&
    Boolean(unifiedMirroredLegacyItemTradeRoomId) &&
    unifiedMirroredLegacyItemTradeRoomId === roomId;

  /* 활성 참가자가 더 없으면 방 잠금 — 유령 대화·뱃지용 미읽음 정리 */
  if (!legacyItemTradeSideEffectsDoneInUnified) {
    const { data: stillRows } = await sbAny
      .from("chat_room_participants")
      .select("id, is_active")
      .eq("room_id", roomId)
      .eq("hidden", false)
      .is("left_at", null);
    const activeOthers = (stillRows ?? []).filter((row: { is_active?: boolean | null }) => row.is_active !== false);
    if (activeOthers.length === 0) {
      await sbAny
        .from("chat_rooms")
        .update({ is_locked: true, locked_at: now, updated_at: now })
        .eq("id", roomId);
    }
  }

  if (!legacyItemTradeSideEffectsDoneInUnified) {
    try {
      await sbAny.from("chat_event_logs").insert({
        room_id: roomId,
        event_type: "participant_left",
        actor_user_id: userId,
        metadata: {},
      });
    } catch {
      /* ignore */
    }
  }
  invalidateUserChatUnreadCache(userId);
  invalidateOwnerHubBadgeCache(userId);
  return NextResponse.json({ ok: true });
}
