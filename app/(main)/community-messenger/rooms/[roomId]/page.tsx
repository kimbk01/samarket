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
import { loadCommunityMessengerRoomBootstrap } from "@/lib/chat-domain/use-cases/community-messenger-bootstrap";
import { createSupabaseCommunityMessengerReadPort } from "@/lib/chat-infra-supabase/community-messenger/supabase-read-adapter";
import { MessengerRoomE2eSnapshotDiagTradeOverlay } from "@/components/community-messenger/room/MessengerRoomE2eSnapshotDiagTradeOverlay";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { createMessengerRoomPageRscTimers } from "@/lib/community-messenger/server/messenger-room-page-rsc-timers";
import { COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT } from "@/lib/community-messenger/types";

async function CommunityMessengerRoomPageLoaded({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ callAction?: string; sessionId?: string; cm_ctx?: string; msg?: string }>;
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
  const uid = viewerUserId?.trim() ?? "";
  /** `GET .../bootstrap?mode=lite` 와 동일한 시드 한도 — RSC HTML 에 메시지·메타를 붙여 첫 페인트 전 클라이언트 대기를 줄임 */
  const roomBootstrapSeedMessageLimit = Math.min(20, COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT);
  let initialServerSnapshot: Awaited<ReturnType<typeof loadCommunityMessengerRoomBootstrap>> = null;
  rscTimers.mark("bootstrap_start");
  if (uid) {
    const canon = await messengerRoomCanonicalOrJsonError(uid, rid);
    if (canon.ok) {
      const readPort = createSupabaseCommunityMessengerReadPort();
      initialServerSnapshot = await loadCommunityMessengerRoomBootstrap(readPort, uid, canon.canonicalRoomId, {
        initialMessageLimit: roomBootstrapSeedMessageLimit,
        hydrateFullMemberList: false,
        deferSnapshotSecondary: true,
      });
    }
  }
  rscTimers.mark("bootstrap_end");
  rscTimers.mark("pre_return");
  rscTimers.scheduleResponseAfter();
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
      <MessengerRoomPageClientEntryProbe />
      <MessengerRoomRouteEntryMountProbe stage="page" />
      <CommunityMessengerRoomClient
        key={rid}
        roomId={rid}
        initialCallAction={callAction}
        initialCallSessionId={sessionId}
        initialServerSnapshot={initialServerSnapshot}
        initialViewerUserId={viewerUserId ?? undefined}
      />
    </>
  );
}

export default function CommunityMessengerRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ callAction?: string; sessionId?: string; cm_ctx?: string; msg?: string }>;
}) {
  return (
    <Suspense fallback={<CommunityMessengerRoomShellSkeleton />}>
      <CommunityMessengerRoomPageLoaded params={params} searchParams={searchParams} />
    </Suspense>
  );
}
