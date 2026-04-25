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
import { MessengerRoomE2eSnapshotDiagTradeOverlay } from "@/components/community-messenger/room/MessengerRoomE2eSnapshotDiagTradeOverlay";
import { createMessengerRoomPageRscTimers } from "@/lib/community-messenger/server/messenger-room-page-rsc-timers";

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
  /**
   * RSC 에서 `loadCommunityMessengerRoomBootstrap` 을 기다리면 TTFB 가 DB·정규화 시간만큼 길어지고
   * Suspense 가 그동안 전체 셸을 붙잡는다. 방 데이터는 **클라이언트 단일 경로**
   * (`peekRoomSnapshot` · `GET /api/.../bootstrap` · `useMessengerRoomLocalIndexedDbSnapshot`)로만 싱크한다.
   */
  const initialServerSnapshot = null;
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
