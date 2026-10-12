/**
 * Server-only publish for home list INSERT broadcasts (group create/invite peers).
 * Client subscription is a separate module — do not import this from client graphs.
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import {
  CM_HOME_LIST_ROOM_INSERT_EVENT,
  communityMessengerHomeListChannelName,
  isCanonicalHomeListRoomSummaryPayload,
} from "@/lib/community-messenger/realtime/home-list-room-insert-contract";

function waitForChannelSubscribed(
  sb: SupabaseClient<any>,
  ch: RealtimeChannel,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        void sb.removeChannel(ch);
      } catch {
        /* ignore */
      }
      reject(new Error("cm_home_list_channel_timeout"));
    }, timeoutMs);
    ch.subscribe((status) => {
      if (settled) return;
      if (status === "SUBSCRIBED") {
        settled = true;
        clearTimeout(t);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        settled = true;
        clearTimeout(t);
        try {
          void sb.removeChannel(ch);
        } catch {
          /* ignore */
        }
        reject(new Error(`cm_home_list_channel_${status}`));
      }
    });
  });
}

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
  const name = communityMessengerHomeListChannelName(recipientUserId);
  const ch = args.sb.channel(name, { config: { broadcast: { ack: false } } });
  try {
    await waitForChannelSubscribed(args.sb, ch, 2_500);
    await ch.send({
      type: "broadcast",
      event: CM_HOME_LIST_ROOM_INSERT_EVENT,
      payload: {
        v: 1,
        fromUserId,
        at: new Date().toISOString(),
        room: args.room,
      },
    });
  } finally {
    try {
      void args.sb.removeChannel(ch);
    } catch {
      /* ignore */
    }
  }
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
