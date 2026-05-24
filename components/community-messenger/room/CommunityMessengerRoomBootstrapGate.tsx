"use client";

import { useEffect, useMemo, useState } from "react";
import { CommunityMessengerRoomClient } from "@/components/community-messenger/CommunityMessengerRoomClient";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { decodeCommunityMessengerRoomCmCtx } from "@/lib/community-messenger/cm-ctx-url";
import { useMessengerRoomUrlSearchParams } from "@/lib/community-messenger/room/use-messenger-room-url-search-params";
import { peekMessengerRoomViewerUserIdClient } from "@/lib/community-messenger/room/peek-messenger-room-viewer-user-id-client";
import { resolveInstantStoreOrderMessengerEntrySnapshot } from "@/lib/store-order-chat/store-order-messenger-entry-shell-snapshot";
import { prepareStoreOrderMessengerRoomEntryByRoomId } from "@/lib/store-order-chat/store-order-messenger-room-entry-client";

function buildInstantEntrySnapshot(
  roomId: string,
  viewerUserId: string | undefined,
  contextMeta: ReturnType<typeof decodeCommunityMessengerRoomCmCtx>
): CommunityMessengerRoomSnapshot {
  return resolveInstantStoreOrderMessengerEntrySnapshot({
    roomId,
    viewerUserId,
    contextMeta,
    myRole: "member",
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
  const searchParams = useMessengerRoomUrlSearchParams();
  const cmCtx = useMemo(() => {
    const raw = searchParams.get("cm_ctx");
    return raw?.trim() ? decodeCommunityMessengerRoomCmCtx(raw) : null;
  }, [searchParams]);

  const viewerUserId =
    initialViewerUserId?.trim() || peekMessengerRoomViewerUserIdClient() || undefined;

  const [hydratedSnapshot, setHydratedSnapshot] = useState<CommunityMessengerRoomSnapshot>(() =>
    buildInstantEntrySnapshot(roomId, viewerUserId, cmCtx)
  );
  const [entryError, setEntryError] = useState<string | null>(null);

  useEffect(() => {
    const rid = roomId.trim();
    if (!rid) return;
    setEntryError(null);
    setHydratedSnapshot(buildInstantEntrySnapshot(rid, viewerUserId, cmCtx));
  }, [roomId, viewerUserId, cmCtx]);

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
        myRole: "member",
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
  }, [roomId, viewerUserId, cmCtx]);

  const showFatalEntryError =
    Boolean(entryError) && Boolean(hydratedSnapshot.clientShellPlaceholder);

  if (showFatalEntryError) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center bg-[color:var(--cm-room-page-bg)] px-4 text-center">
        <p className="text-sm text-[color:var(--cm-room-text-muted)]">채팅을 불러오지 못했습니다.</p>
        <p className="mt-1 text-xs text-[color:var(--cm-room-text-muted)]">{entryError}</p>
      </div>
    );
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
