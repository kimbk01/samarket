"use client";

import { useEffect, useLayoutEffect } from "react";
import { noteBn14DirectColdMark } from "@/lib/community-messenger/room/cm-room-bn14-direct-cold-probe";
import { CommunityMessengerRoomBootstrapGate } from "@/components/community-messenger/room/CommunityMessengerRoomBootstrapGate";
import { preloadCommunityMessengerRoomRouteEntryChunks } from "@/components/community-messenger/CommunityMessengerRoomClientPrefetch";
import { MessengerRoomE2eSnapshotDiagTradeOverlay } from "@/components/community-messenger/room/MessengerRoomE2eSnapshotDiagTradeOverlay";
import { MessengerRoomPageClientEntryProbe } from "@/components/community-messenger/room/MessengerRoomPageClientEntryProbe";
import { MessengerRoomR2M9SuspenseProbe } from "@/components/community-messenger/room/MessengerRoomR2M9SuspenseProbe";
import { MessengerRoomR2M11BFlightProbe } from "@/components/community-messenger/room/MessengerRoomR2M11BFlightProbe";
import { MessengerRoomR2M11DPrefetchFlightProbe } from "@/components/community-messenger/room/MessengerRoomR2M11DPrefetchFlightProbe";
import { MessengerRoomRouteEntryMountProbe } from "@/components/community-messenger/room/MessengerRoomRouteEntryMountProbe";
import {
  isMessengerRoomE2eDiagEnabledClient,
  peekMessengerRoomViewerUserIdClient,
} from "@/lib/community-messenger/room/peek-messenger-room-viewer-user-id-client";

/** BN13-rsc 3차 — shell paint 이후 dynamic chunk: bootstrap·probe·client inner */
export function CommunityMessengerRoomPageClientEntryDeferred({ roomId }: { roomId: string }) {
  const viewerUserId = peekMessengerRoomViewerUserIdClient();
  const e2eRoomTrace = isMessengerRoomE2eDiagEnabledClient();

  useLayoutEffect(() => {
    noteBn14DirectColdMark("deferred_mount");
  }, []);

  useEffect(() => {
    preloadCommunityMessengerRoomRouteEntryChunks();
  }, [roomId]);

  return (
    <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col">
      {e2eRoomTrace ? (
        <script
          type="application/json"
          id="samarket-room-snapshot-diag"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: "{}" }}
        />
      ) : null}
      {e2eRoomTrace ? <MessengerRoomE2eSnapshotDiagTradeOverlay canonicalRoomId={roomId} /> : null}
      <MessengerRoomR2M11BFlightProbe />
      <MessengerRoomR2M11DPrefetchFlightProbe />
      <MessengerRoomR2M9SuspenseProbe roomId={roomId} />
      <MessengerRoomPageClientEntryProbe />
      <MessengerRoomRouteEntryMountProbe stage="page" />
      <CommunityMessengerRoomBootstrapGate roomId={roomId} initialViewerUserId={viewerUserId ?? undefined} />
    </div>
  );
}
