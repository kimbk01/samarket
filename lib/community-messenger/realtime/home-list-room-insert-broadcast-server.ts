/**
 * Server-only publish for home list INSERT broadcasts (group create/invite peers).
 * Client subscription is a separate module — do not import this from client graphs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { publishMessengerPrivateBroadcastFromServer } from "@/lib/community-messenger/realtime/private-broadcast-server";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import {
  CM_HOME_LIST_ROOM_INSERT_EVENT,
  communityMessengerHomeListChannelName,
  isCanonicalHomeListRoomSummaryPayload,
} from "@/lib/community-messenger/realtime/home-list-room-insert-contract";

export async function publishHomeListRoomInsertToUser(args: {
  sb: SupabaseClient<any>;
  recipientUserId: string;
  fromUserId: string;
  room: CommunityMessengerRoomSummary;
}): Promise<void> {
  const recipientUserId = String(args.recipientUserId ?? "").trim();
  const fromUserId = String(args.fromUserId ?? "").trim();
  if (!recipientUserId || !fromUserId) return;
  if (!isCanonicalHomeListRoomSummaryPayload(args.room)) return;
  /** 비공개 토픽 `cm-home-list:<uid>` — 서비스 롤 REST broadcast(WS join 대기 없음). `args.sb` 는 호환용(미사용). */
  void args.sb;
  const res = await publishMessengerPrivateBroadcastFromServer({
    scope: "home_list_insert",
    messages: [
      {
        topic: communityMessengerHomeListChannelName(recipientUserId),
        event: CM_HOME_LIST_ROOM_INSERT_EVENT,
        payload: {
          v: 1,
          fromUserId,
          at: new Date().toISOString(),
          room: args.room,
        },
      },
    ],
  });
  if (!res.ok) throw new Error(`cm_home_list_publish_${res.status || res.error}`);
}

/**
 * Best-effort: build invitee-scoped summaries and publish user-channel INSERT.
 * Failure here must not fail the invite/create mutation (membership already written).
 * Missing-summary HTTP remains recovery-only on client.
 */
export async function publishHomeListRoomInsertForInviteesBestEffort(args: {
  fromUserId: string;
  roomId: string;
  inviteeUserIds: string[];
}): Promise<void> {
  const fromUserId = String(args.fromUserId ?? "").trim();
  const roomId = String(args.roomId ?? "").trim();
  const invitees = [...new Set(args.inviteeUserIds.map((id) => String(id ?? "").trim()).filter(Boolean))].filter(
    (id) => id !== fromUserId
  );
  if (!fromUserId || !roomId || invitees.length === 0) return;

  try {
    const { getSupabaseServer } = await import("@/lib/chat/supabase-server");
    const sb = getSupabaseServer();
    const { getCommunityMessengerSingleRoomSummaryForViewer } = await import(
      "@/lib/community-messenger/service"
    );
    await Promise.all(
      invitees.map(async (inviteeId) => {
        try {
          const room = await getCommunityMessengerSingleRoomSummaryForViewer(inviteeId, roomId);
          if (!room) return;
          await publishHomeListRoomInsertToUser({
            sb: sb as SupabaseClient<any>,
            recipientUserId: inviteeId,
            fromUserId,
            room,
          });
        } catch {
          /* recovery: invitee participant RT → home-summary */
        }
      })
    );
  } catch {
    /* best-effort */
  }
}
