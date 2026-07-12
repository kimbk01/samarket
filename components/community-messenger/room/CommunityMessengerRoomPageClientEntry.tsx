"use client";

import dynamic from "next/dynamic";
import { useLayoutEffect } from "react";
import { notFound, useParams } from "next/navigation";
import { noteBn14DirectColdMark } from "@/lib/community-messenger/room/cm-room-bn14-direct-cold-probe";
import { runCmRoomLayoutShellClientBridge } from "@/lib/community-messenger/room/cm-room-layout-shell-client-bridge";
import { MessengerRoomBn14DirectColdDomProbe } from "@/components/community-messenger/room/MessengerRoomBn14DirectColdDomProbe";

if (typeof window !== "undefined") {
  noteBn14DirectColdMark("page_client_entry_module_eval");
}

import { CommunityMessengerRoomRouteEntryShell } from "@/components/community-messenger/room/CommunityMessengerRoomRouteEntryShell";

function CommunityMessengerRoomPageClientEntryDeferredLoading() {
  const rid = String(useParams()?.roomId ?? "").trim();
  return <CommunityMessengerRoomRouteEntryShell roomId={rid || undefined} />;
}

const CommunityMessengerRoomPageClientEntryDeferred = dynamic(
  () => {
    noteBn14DirectColdMark("deferred_chunk_import_start");
    return import("@/components/community-messenger/room/CommunityMessengerRoomPageClientEntryDeferred").then(
      (m) => {
        noteBn14DirectColdMark("deferred_chunk_import_done");
        return m.CommunityMessengerRoomPageClientEntryDeferred;
      }
    );
  },
  { ssr: false, loading: CommunityMessengerRoomPageClientEntryDeferredLoading }
);

/**
 * R2-M10B — room route shell 은 `[roomId]/layout` persistence host 가 담당.
 * BN13-rsc 4차 — sync import 최소(deferred chunk 만).
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
