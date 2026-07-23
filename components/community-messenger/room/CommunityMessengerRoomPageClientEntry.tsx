"use client";

import { useLayoutEffect } from "react";
import { notFound, useParams } from "next/navigation";
import { noteBn14DirectColdMark } from "@/lib/community-messenger/room/cm-room-bn14-direct-cold-probe";
import { runCmRoomLayoutShellClientBridge } from "@/lib/community-messenger/room/cm-room-layout-shell-client-bridge";
import { MessengerRoomBn14DirectColdDomProbe } from "@/components/community-messenger/room/MessengerRoomBn14DirectColdDomProbe";
import { CommunityMessengerRoomPageClientEntryDeferred } from "@/components/community-messenger/room/CommunityMessengerRoomPageClientEntryDeferred";

if (typeof window !== "undefined") {
  noteBn14DirectColdMark("page_client_entry_module_eval");
}

/**
 * Room page entry — static Deferred (no dynamic loading white flash).
 */
export function CommunityMessengerRoomPageClientEntry() {
  const rid = String(useParams()?.roomId ?? "").trim();

  useLayoutEffect(() => {
    noteBn14DirectColdMark("page_client_entry_mount");
    if (rid) runCmRoomLayoutShellClientBridge(rid);
  }, [rid]);

  if (!rid) {
    notFound();
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <MessengerRoomBn14DirectColdDomProbe />
      <CommunityMessengerRoomPageClientEntryDeferred roomId={rid} />
    </div>
  );
}
