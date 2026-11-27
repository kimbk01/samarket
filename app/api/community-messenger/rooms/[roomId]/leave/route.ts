import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { leaveGroupRoom } from "@/lib/community-messenger/group/group-room-service";
import { leaveCommunityMessengerRoom } from "@/lib/community-messenger/service";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { leaveMessengerRoomUnified } from "@/lib/messenger-policy/leave-chat-room-orchestration.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:room-leave:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    code: "community_messenger_room_leave_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await context.params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }

  let quiet = false;
  try {
    const body = await req.json();
    if (body && typeof body === "object" && body.quiet === true) quiet = true;
  } catch {
    /* no body */
  }

  const sb = tryCreateSupabaseServiceClient();
  if (sb) {
    const { data: roomTypeRow } = await sb
      .from("community_messenger_rooms")
      .select("room_type")
      .eq("id", canon.canonicalRoomId)
      .maybeSingle();
    const roomType = String((roomTypeRow as { room_type?: unknown } | null)?.room_type ?? "").trim();
    if (roomType === "private_group") {
      const groupLeave = await leaveGroupRoom({ userId: auth.userId, roomId: canon.canonicalRoomId });
      if (groupLeave.ok) {
        return NextResponse.json({ ok: true }, { status: 200 });
      }
      const rawErr = groupLeave.error ?? GROUP_ROOM_ERROR.LEAVE_FAILED;
      /** 모임 방은 모임에서만 나간다 — DB 트리거 거부를 일반 오류(500) 대신 정확한 코드로 (모임 4번 묶음 D7 · hard-lock §MOIM-owned GROUP rooms) */
      if (/moim_room_membership_managed_by_moim/.test(rawErr)) {
        return NextResponse.json({ ok: false, error: "moim_room_membership_managed_by_moim" }, { status: 409 });
      }
      const err = rawErr;
      const status =
        err === GROUP_ROOM_ERROR.OWNER_CANNOT_LEAVE
          ? 400
          : err === GROUP_ROOM_ERROR.ROOM_NOT_FOUND || err === GROUP_ROOM_ERROR.NOT_GROUP_ROOM
            ? 404
            : err === GROUP_ROOM_ERROR.FORBIDDEN
              ? 403
              : 500;
      return NextResponse.json({ ok: false, error: err }, { status });
    }

    const unified = await leaveMessengerRoomUnified(sb as import("@supabase/supabase-js").SupabaseClient<any>, auth.userId, canon.canonicalRoomId, {
      quiet,
    });
    if (unified.ok) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    const err = unified.error ?? "leave_failed";
    const status =
      err === "owner_cannot_leave" || err === "store_owner_cannot_leave"
        ? 400
        : err === "trade_room_not_found"
          ? 404
          : err === "forbidden"
            ? 403
            : err === "room_not_found" || err === "bad_request"
              ? 400
              : 500;
    return NextResponse.json({ ok: false, error: err }, { status });
  }

  const result = await leaveCommunityMessengerRoom({
    userId: auth.userId,
    roomId: canon.canonicalRoomId,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
