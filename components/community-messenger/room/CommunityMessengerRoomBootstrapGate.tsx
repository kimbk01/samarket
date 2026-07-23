"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CommunityMessengerRoomClient } from "@/components/community-messenger/CommunityMessengerRoomClient";
import { CommunityMessengerRoomEntryEmpty } from "@/components/community-messenger/room/CommunityMessengerRoomEntryEmpty";
import { redirectResourceAccessDenied } from "@/lib/auth/resource-access-denied-flow";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { decodeCommunityMessengerRoomCmCtx } from "@/lib/community-messenger/cm-ctx-url";
import { useMessengerRoomUrlSearchParams } from "@/lib/community-messenger/room/use-messenger-room-url-search-params";
import { peekMessengerRoomViewerUserIdClient } from "@/lib/community-messenger/room/peek-messenger-room-viewer-user-id-client";
import {
  canMountCommunityMessengerRoomClient,
  pickAuthoritativeMessengerRoomSnapshot,
} from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";
import { prepareStoreOrderMessengerRoomEntryByRoomId } from "@/lib/store-order-chat/store-order-messenger-room-entry-client";
import { inferInstantStoreOrderMessengerMyRole } from "@/lib/store-order-chat/infer-store-order-messenger-instant-role";

/** TTL fresh 여부와 무관 — mountable cache면 즉시 실방. */
function peekMountableEntrySnapshot(
  roomId: string,
  viewerUserId: string | undefined
): CommunityMessengerRoomSnapshot | null {
  const rid = roomId.trim();
  const viewer = viewerUserId?.trim() ?? "";
  if (!rid || !viewer) return null;
  const cached = pickAuthoritativeMessengerRoomSnapshot({
    roomId: rid,
    viewerUserId: viewer,
    serverSnapshot: null,
  });
  if (cached && canMountCommunityMessengerRoomClient(cached)) {
    return cached;
  }
  return null;
}

/**
 * Warm/stale cache → 첫 paint RoomClient.
 * Cold only → 「채팅방 입장 중…」 spinner + bootstrap.
 * Cache hit 시 UI 유지한 채 background refresh.
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

  const [entrySnapshot, setEntrySnapshot] = useState<CommunityMessengerRoomSnapshot | null>(() =>
    peekMountableEntrySnapshot(roomId, viewerUserId)
  );
  const [bootstrapPending, setBootstrapPending] = useState(
    () => !peekMountableEntrySnapshot(roomId, viewerUserId)
  );
  const [entryError, setEntryError] = useState<string | null>(null);

  useEffect(() => {
    const rid = roomId.trim();
    if (!rid) {
      setEntryError("missing_room_id");
      setBootstrapPending(false);
      setEntrySnapshot(null);
      return;
    }

    let cancelled = false;
    setEntryError(null);

    const cached = peekMountableEntrySnapshot(rid, viewerUserId);
    if (cached) {
      setEntrySnapshot(cached);
      setBootstrapPending(false);
      // background refresh — do not clear room to spinner
      void (async () => {
        const result = await prepareStoreOrderMessengerRoomEntryByRoomId(rid, {
          instantContextMeta: cmCtx,
          myRole: instantMyRole,
          viewerUserId: viewerUserId?.trim() || undefined,
        });
        if (cancelled || !result.ok) return;
        if (!canMountCommunityMessengerRoomClient(result.snapshot)) return;
        setEntrySnapshot(result.snapshot);
      })();
      return () => {
        cancelled = true;
      };
    }

    setBootstrapPending(true);
    setEntrySnapshot(null);

    void (async () => {
      const result = await prepareStoreOrderMessengerRoomEntryByRoomId(rid, {
        instantContextMeta: cmCtx,
        myRole: instantMyRole,
        viewerUserId: viewerUserId?.trim() || undefined,
      });
      if (cancelled) return;
      if (!result.ok) {
        setEntryError(result.error);
        setBootstrapPending(false);
        return;
      }
      if (!canMountCommunityMessengerRoomClient(result.snapshot)) {
        setEntryError("incomplete_timeline_seed");
        setBootstrapPending(false);
        return;
      }
      setEntrySnapshot(result.snapshot);
      setBootstrapPending(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId, viewerUserId, cmCtx, instantMyRole]);

  useEffect(() => {
    if (!entryError || redirectedRef.current || bootstrapPending) return;
    redirectedRef.current = true;
    redirectResourceAccessDenied(router, "/community-messenger");
  }, [entryError, bootstrapPending, router]);

  if (entryError) {
    return null;
  }

  if (bootstrapPending || !entrySnapshot || !canMountCommunityMessengerRoomClient(entrySnapshot)) {
    return (
      <CommunityMessengerRoomEntryEmpty
        roomId={roomId}
        recordShellPaint={false}
        recordPass1Milestones
        dataAttrs={{ "data-cm-room-pass1-stable-shell": "" }}
      />
    );
  }

  const viewer = viewerUserId || entrySnapshot.viewerUserId?.trim() || undefined;

  return (
    <CommunityMessengerRoomClient
      key={roomId}
      roomId={roomId}
      initialServerSnapshot={entrySnapshot}
      initialViewerUserId={viewer}
    />
  );
}
