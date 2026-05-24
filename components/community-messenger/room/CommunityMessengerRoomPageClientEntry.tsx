"use client";



import { notFound, useParams } from "next/navigation";

import { CommunityMessengerRoomBootstrapGate } from "@/components/community-messenger/room/CommunityMessengerRoomBootstrapGate";

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



/**

 * R2-M10B — room route shell 은 client-first.

 * R2-M11 — `useSearchParams` 제거(phase1 이 URLSearchParams 동치 읽기). page Suspense 없음.

 */

export function CommunityMessengerRoomPageClientEntry() {

  const params = useParams();

  const rid = String(params?.roomId ?? "").trim();

  if (!rid) {

    notFound();

  }



  const viewerUserId = peekMessengerRoomViewerUserIdClient();

  const e2eRoomTrace = isMessengerRoomE2eDiagEnabledClient();



  return (

    <>

      {e2eRoomTrace ? (

        <script

          type="application/json"

          id="samarket-room-snapshot-diag"

          suppressHydrationWarning

          dangerouslySetInnerHTML={{ __html: "{}" }}

        />

      ) : null}

      {e2eRoomTrace ? <MessengerRoomE2eSnapshotDiagTradeOverlay canonicalRoomId={rid} /> : null}

      <MessengerRoomR2M11BFlightProbe />
      <MessengerRoomR2M11DPrefetchFlightProbe />
      <MessengerRoomR2M9SuspenseProbe roomId={rid} />

      <MessengerRoomPageClientEntryProbe />

      <MessengerRoomRouteEntryMountProbe stage="page" />

      <CommunityMessengerRoomBootstrapGate
        roomId={rid}
        initialViewerUserId={viewerUserId ?? undefined}
      />

    </>

  );

}

