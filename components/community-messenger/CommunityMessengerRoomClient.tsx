"use client";

import { useLayoutEffect } from "react";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { CommunityMessengerRoomClientInner } from "@/components/community-messenger/CommunityMessengerRoomClientInner";
import { noteR2M9Stage } from "@/lib/community-messenger/room/cm-room-r2-m9-entry-profile";
import { noteR2M11BFirstClientBoundaryMount } from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";
import { noteTradeChatRoomInnerChunkEval } from "@/lib/trade/trade-chat-room-shell-breakdown-perf";

/** Static Inner — no dynamic loading:null white flash between Gate and Phase2. */
export function CommunityMessengerRoomClient(props: {
  roomId: string;
  initialCallAction?: string;
  initialCallSessionId?: string;
  initialServerSnapshot?: CommunityMessengerRoomSnapshot | null;
  initialViewerUserId?: string | null;
}) {
  useLayoutEffect(() => {
    noteR2M9Stage("room_client_wrapper_render");
    noteR2M9Stage("inner_chunk_eval");
    noteTradeChatRoomInnerChunkEval();
    const rid = props.roomId?.trim() ?? "";
    if (rid) noteR2M11BFirstClientBoundaryMount(rid);
  }, [props.roomId]);

  return <CommunityMessengerRoomClientInner {...props} />;
}
