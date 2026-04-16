import type { MutableRefObject } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Sched = { schedule: () => void; cancel: () => void };

export function attachCommunityMessengerRoomCallPostgresHandlers(
  channel: RealtimeChannel,
  args: {
    roomId: string;
    isCancelled: () => boolean;
    roomCallBundleRefreshScheduler: Sched;
    onRefreshRef: MutableRefObject<() => void>;
  }
): RealtimeChannel {
  const rid = args.roomId;
  return channel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "community_messenger_call_logs",
        filter: `room_id=eq.${rid}`,
      },
      () => {
        if (!args.isCancelled()) args.roomCallBundleRefreshScheduler.schedule();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "community_messenger_call_sessions",
        filter: `room_id=eq.${rid}`,
      },
      (payload) => {
        if (args.isCancelled()) return;
        const p = payload as {
          eventType?: string;
          new?: Record<string, unknown> | null;
          old?: Record<string, unknown> | null;
        };
        if (p.eventType === "DELETE") {
          args.roomCallBundleRefreshScheduler.cancel();
          args.onRefreshRef.current();
          return;
        }
        const row = p.new ?? null;
        const status = typeof row?.status === "string" ? row.status.trim() : "";
        if (
          status === "ended" ||
          status === "cancelled" ||
          status === "rejected" ||
          status === "missed"
        ) {
          args.roomCallBundleRefreshScheduler.cancel();
          args.onRefreshRef.current();
          return;
        }
        args.roomCallBundleRefreshScheduler.schedule();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "community_messenger_call_session_participants",
        filter: `room_id=eq.${rid}`,
      },
      () => {
        if (!args.isCancelled()) args.roomCallBundleRefreshScheduler.schedule();
      }
    );
}
