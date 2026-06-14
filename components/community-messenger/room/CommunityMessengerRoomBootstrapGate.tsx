"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CommunityMessengerRoomClient } from "@/components/community-messenger/CommunityMessengerRoomClient";
import { redirectResourceAccessDenied } from "@/lib/auth/resource-access-denied-flow";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { decodeCommunityMessengerRoomCmCtx } from "@/lib/community-messenger/cm-ctx-url";
import { useMessengerRoomUrlSearchParams } from "@/lib/community-messenger/room/use-messenger-room-url-search-params";
import { peekMessengerRoomViewerUserIdClient } from "@/lib/community-messenger/room/peek-messenger-room-viewer-user-id-client";
import { resolveInstantStoreOrderMessengerEntrySnapshot } from "@/lib/store-order-chat/store-order-messenger-entry-shell-snapshot";
import { prepareStoreOrderMessengerRoomEntryByRoomId } from "@/lib/store-order-chat/store-order-messenger-room-entry-client";
import { inferInstantStoreOrderMessengerMyRole } from "@/lib/store-order-chat/infer-store-order-messenger-instant-role";
import { isMessengerRoomBootstrapReadySnapshot } from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";

function buildInstantEntrySnapshot(
  roomId: string,
  viewerUserId: string | undefined,
  contextMeta: ReturnType<typeof decodeCommunityMessengerRoomCmCtx>,
  searchParams: URLSearchParams
): CommunityMessengerRoomSnapshot {
  return resolveInstantStoreOrderMessengerEntrySnapshot({
    roomId,
    viewerUserId,
    contextMeta,
    myRole: inferInstantStoreOrderMessengerMyRole(contextMeta, searchParams),
  });
}

/**
 * 메신저 방 URL 진입 — 셸 스냅샷으로 RoomClient 를 즉시 연고, ensure+bootstrap 으로 히스토리를 정합한다.
 * 구매자·매장이 동일 roomId·동일 bootstrap 계약으로 히스토리를 본다.
 */
export function CommunityMessengerRoomBootstrapGate({
  roomId,
  initialViewerUserId,
}: {
  roomId: string;
  initialViewerUserId?: string | null;
}) {
  const router = useRouter();
  const redirectedRef = useRef(false);
  const searchParams = useMessengerRoomUrlSearchParams();
  const cmCtx = useMemo(() => {
    const raw = searchParams.get("cm_ctx");
    return raw?.trim() ? decodeCommunityMessengerRoomCmCtx(raw) : null;
  }, [searchParams]);

  const viewerUserId =
    initialViewerUserId?.trim() || peekMessengerRoomViewerUserIdClient() || undefined;

  const instantMyRole = useMemo(
    () => inferInstantStoreOrderMessengerMyRole(cmCtx, searchParams),
    [cmCtx, searchParams]
  );

  const [hydratedSnapshot, setHydratedSnapshot] = useState<CommunityMessengerRoomSnapshot>(() =>
    buildInstantEntrySnapshot(roomId, viewerUserId, cmCtx, searchParams)
  );
  const [entryError, setEntryError] = useState<string | null>(null);

  useEffect(() => {
    const rid = roomId.trim();
    if (!rid) return;
    setEntryError(null);
    setHydratedSnapshot((prev) => {
      if (isMessengerRoomBootstrapReadySnapshot(prev)) return prev;
      return buildInstantEntrySnapshot(rid, viewerUserId, cmCtx, searchParams);
    });
  }, [roomId, viewerUserId, cmCtx, searchParams]);

  useEffect(() => {
    const rid = roomId.trim();
    if (!rid) {
      setEntryError("missing_room_id");
      return;
    }

    let cancelled = false;
    setEntryError(null);

    void (async () => {
      const result = await prepareStoreOrderMessengerRoomEntryByRoomId(rid, {
        instantContextMeta: cmCtx,
        myRole: instantMyRole,
        viewerUserId,
      });
      if (cancelled) return;
      if (!result.ok) {
        setEntryError(result.error);
        return;
      }
      setHydratedSnapshot(result.snapshot);
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId, viewerUserId, cmCtx, instantMyRole]);

  const showFatalEntryError =
    Boolean(entryError) && Boolean(hydratedSnapshot.clientShellPlaceholder);

  useEffect(() => {
    if (!showFatalEntryError || redirectedRef.current) return;
    redirectedRef.current = true;
    redirectResourceAccessDenied(router, "/community-messenger");
  }, [router, showFatalEntryError]);

  if (showFatalEntryError) {
    return null;
  }

  const viewer = viewerUserId || hydratedSnapshot.viewerUserId?.trim() || undefined;

  return (
    <CommunityMessengerRoomClient
      key={roomId}
      roomId={roomId}
      initialServerSnapshot={hydratedSnapshot}
      initialViewerUserId={viewer}
    />
  );
}
