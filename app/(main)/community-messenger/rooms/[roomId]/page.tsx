import { Suspense } from "react";
import { MessengerRoomPageClientEntryProbe } from "@/components/community-messenger/room/MessengerRoomPageClientEntryProbe";
import { MessengerRoomRouteEntryMountProbe } from "@/components/community-messenger/room/MessengerRoomRouteEntryMountProbe";
import { CommunityMessengerRoomClient } from "@/components/community-messenger/CommunityMessengerRoomClient";
import { CommunityMessengerRoomShellSkeleton } from "@/components/community-messenger/CommunityMessengerRouteSkeletons";

async function CommunityMessengerRoomPageLoaded({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ callAction?: string; sessionId?: string; cm_ctx?: string }>;
}) {
  const [{ roomId }, { callAction, sessionId }] = await Promise.all([params, searchParams]);
  const rid = String(roomId ?? "").trim();
  /** 서버 부트스트랩은 RSC에서 await 하지 않음 — 클라가 hot/peek/HTTP로 첫 프레임을 잡는다. */
  return (
    <>
      <MessengerRoomPageClientEntryProbe />
      <MessengerRoomRouteEntryMountProbe stage="page" />
      <CommunityMessengerRoomClient
        key={rid}
        roomId={rid}
        initialCallAction={callAction}
        initialCallSessionId={sessionId}
        initialServerSnapshot={null}
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
