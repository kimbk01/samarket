import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

/** `headers()` 기반 E2E 계측이 요청마다 반영되도록(캐시로 헤더 무시 방지) */
export const dynamic = "force-dynamic";
import { MessengerRoomPageClientEntryProbe } from "@/components/community-messenger/room/MessengerRoomPageClientEntryProbe";
import { MessengerRoomRouteEntryMountProbe } from "@/components/community-messenger/room/MessengerRoomRouteEntryMountProbe";
import { CommunityMessengerRoomClient } from "@/components/community-messenger/CommunityMessengerRoomClient";
import { CommunityMessengerRoomShellSkeleton } from "@/components/community-messenger/CommunityMessengerRouteSkeletons";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import type { CommunityMessengerRoomSnapshotDiagnostics } from "@/lib/chat-domain/ports/community-messenger-read";
import { loadCommunityMessengerRoomBootstrap } from "@/lib/chat-domain/use-cases/community-messenger-bootstrap";
import { createSupabaseCommunityMessengerReadPort } from "@/lib/chat-infra-supabase/community-messenger/supabase-read-adapter";
import { COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT } from "@/lib/community-messenger/types";
import { MessengerRoomE2eSnapshotDiagTradeOverlay } from "@/components/community-messenger/room/MessengerRoomE2eSnapshotDiagTradeOverlay";
import { resolveCommunityMessengerCanonicalRoomIdForUser } from "@/lib/community-messenger/service";
import { createMessengerRoomPageRscTimers } from "@/lib/community-messenger/server/messenger-room-page-rsc-timers";

const COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT = 20;

async function CommunityMessengerRoomPageLoaded({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ callAction?: string; sessionId?: string; cm_ctx?: string }>;
}) {
  const [{ roomId }, { callAction, sessionId }] = await Promise.all([params, searchParams]);
  const rid = String(roomId ?? "").trim();
  if (!rid) {
    notFound();
  }
  const jar = await cookies();
  const hdrs = await headers();
  const e2eRoomTrace =
    process.env.NODE_ENV !== "production" &&
    (jar.get("samarket_e2e_room_diag")?.value === "1" ||
      (hdrs.get("x-samarket-e2e-room-diag") ?? "").trim() === "1");
  const rscTimers = createMessengerRoomPageRscTimers(rid);
  rscTimers.mark("server_entry");
  const viewerUserId = await getOptionalAuthenticatedUserId();
  let initialServerSnapshot = null;
  let roomSnapshotDiagnostics: CommunityMessengerRoomSnapshotDiagnostics | null = null;
  let canonicalRoomIdForE2eOverlay: string | null = null;
  if (viewerUserId) {
    const canonical = await resolveCommunityMessengerCanonicalRoomIdForUser(viewerUserId, rid);
    if (!canonical.ok) {
      notFound();
    }
    canonicalRoomIdForE2eOverlay = canonical.canonicalRoomId;
    rscTimers.mark("bootstrap_start");
    roomSnapshotDiagnostics = {};
    const readPort = createSupabaseCommunityMessengerReadPort();
    initialServerSnapshot = await loadCommunityMessengerRoomBootstrap(readPort, viewerUserId, canonical.canonicalRoomId, {
      initialMessageLimit: Math.min(
        COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT,
        COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT
      ),
      hydrateFullMemberList: false,
      deferSnapshotSecondary: true,
      diagnostics: roomSnapshotDiagnostics,
      e2eRoomSnapshotDiag: e2eRoomTrace,
    });
    if (process.env.MESSENGER_PERF_TRACE_ROOM_SNAPSHOT === "1" || e2eRoomTrace) {
      console.info("MESSENGER_ROOM_SNAPSHOT_DIAG_JSON:" + JSON.stringify(roomSnapshotDiagnostics));
    }
    rscTimers.mark("bootstrap_end");
    if (!initialServerSnapshot) {
      notFound();
    }
  }
  rscTimers.mark("pre_return");
  rscTimers.scheduleResponseAfter();
  const traceRoomSnapshot =
    (process.env.MESSENGER_PERF_TRACE_ROOM_SNAPSHOT === "1" || e2eRoomTrace) && !!roomSnapshotDiagnostics;
  return (
    <>
      {traceRoomSnapshot && roomSnapshotDiagnostics ? (
        <script
          type="application/json"
          id="samarket-room-snapshot-diag"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(roomSnapshotDiagnostics) }}
        />
      ) : null}
      {e2eRoomTrace && canonicalRoomIdForE2eOverlay ? (
        <MessengerRoomE2eSnapshotDiagTradeOverlay canonicalRoomId={canonicalRoomIdForE2eOverlay} />
      ) : null}
      <MessengerRoomPageClientEntryProbe />
      <MessengerRoomRouteEntryMountProbe stage="page" />
      <CommunityMessengerRoomClient
        key={rid}
        roomId={rid}
        initialCallAction={callAction}
        initialCallSessionId={sessionId}
        initialServerSnapshot={initialServerSnapshot}
      />
    </>
  );
}

export default function CommunityMessengerRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ callAction?: string; sessionId?: string; cm_ctx?: string }>;
}) {
  return (
    <Suspense fallback={<CommunityMessengerRoomShellSkeleton />}>
      <CommunityMessengerRoomPageLoaded params={params} searchParams={searchParams} />
    </Suspense>
  );
}
