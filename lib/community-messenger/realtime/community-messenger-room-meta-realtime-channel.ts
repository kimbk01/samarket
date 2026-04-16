import type { RealtimeChannel } from "@supabase/supabase-js";

type Sched = { schedule: () => void; cancel: () => void };

export function attachCommunityMessengerRoomMetaPostgresHandlers(
  channel: RealtimeChannel,
  args: { roomId: string; isCancelled: () => boolean; metaRefreshScheduler: Sched }
): RealtimeChannel {
  const rid = args.roomId;
  return channel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "community_messenger_participants",
        filter: `room_id=eq.${rid}`,
      },
      () => {
        if (!args.isCancelled()) args.metaRefreshScheduler.schedule();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "community_messenger_rooms",
        filter: `id=eq.${rid}`,
      },
      () => {
        if (!args.isCancelled()) args.metaRefreshScheduler.schedule();
      }
    );
}
