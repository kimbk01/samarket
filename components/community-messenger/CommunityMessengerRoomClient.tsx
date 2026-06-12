"use client";

import dynamic from "next/dynamic";
import { useLayoutEffect } from "react";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { CommunityMessengerRoomRouteEntryShell } from "@/components/community-messenger/room/CommunityMessengerRoomRouteEntryShell";
import { noteR2M9Stage } from "@/lib/community-messenger/room/cm-room-r2-m9-entry-profile";
import { noteR2M11BFirstClientBoundaryMount } from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";
import { noteTradeChatRoomInnerChunkEval } from "@/lib/trade/trade-chat-room-shell-breakdown-perf";

const CommunityMessengerRoomClientInner = dynamic(
  () =>
    import("@/components/community-messenger/CommunityMessengerRoomClientInner").then((m) => {
      noteR2M9Stage("inner_chunk_eval");
      noteTradeChatRoomInnerChunkEval();
      return m.CommunityMessengerRoomClientInner;
    }),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CommunityMessengerRoomRouteEntryShell />
      </div>
    ),
  }
);

/** dynamic Inner(phase1/phase2) — composer 는 Phase2 셸 트리 안(`CommunityMessengerRoomPhase2Composer`)에 둔다. */
export function CommunityMessengerRoomClient(props: {
  roomId: string;
  initialCallAction?: string;
  initialCallSessionId?: string;
  initialServerSnapshot?: CommunityMessengerRoomSnapshot | null;
  initialViewerUserId?: string | null;
}) {
  useLayoutEffect(() => {
    noteR2M9Stage("room_client_wrapper_render");
    const rid = props.roomId?.trim() ?? "";
    if (rid) noteR2M11BFirstClientBoundaryMount(rid);
  }, [props.roomId]);

  return <CommunityMessengerRoomClientInner {...props} />;
}
