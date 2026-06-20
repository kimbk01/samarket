"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CommunityMessengerRoomClient } from "@/components/community-messenger/CommunityMessengerRoomClient";
import { CommunityMessengerRoomStableEntryShell } from "@/components/community-messenger/room/CommunityMessengerRoomStableEntryShell";
import { redirectResourceAccessDenied } from "@/lib/auth/resource-access-denied-flow";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { decodeCommunityMessengerRoomCmCtx } from "@/lib/community-messenger/cm-ctx-url";
import { useMessengerRoomUrlSearchParams } from "@/lib/community-messenger/room/use-messenger-room-url-search-params";
import { peekMessengerRoomViewerUserIdClient } from "@/lib/community-messenger/room/peek-messenger-room-viewer-user-id-client";
import {
  canMountCommunityMessengerRoomClient,
  pickAuthoritativeMessengerRoomSnapshot,
} from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";
import { isRoomSnapshotFresh } from "@/lib/community-messenger/room-snapshot-cache";
import { prepareStoreOrderMessengerRoomEntryByRoomId } from "@/lib/store-order-chat/store-order-messenger-room-entry-client";
import { inferInstantStoreOrderMessengerMyRole } from "@/lib/store-order-chat/infer-store-order-messenger-instant-role";

/**
 * CM room URL 진입 — authoritative bootstrap complete 전 RoomClient 마운트 금지.
 * store order·배달·일반 DM·그룹(CM) 동일 계약.
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

  const [entrySnapshot, setEntrySnapshot] = useState<CommunityMessengerRoomSnapshot | null>(null);
  const [bootstrapPending, setBootstrapPending] = useState(true);
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
    setBootstrapPending(true);
    setEntryError(null);
    setEntrySnapshot(null);

    const viewer = viewerUserId?.trim() ?? "";
    if (viewer) {
      const cached = pickAuthoritativeMessengerRoomSnapshot({
        roomId: rid,
        viewerUserId: viewer,
        serverSnapshot: null,
      });
      if (cached && isRoomSnapshotFresh(rid, viewer) && canMountCommunityMessengerRoomClient(cached)) {
        setEntrySnapshot(cached);
        setBootstrapPending(false);
        return () => {
          cancelled = true;
        };
      }
    }

    void (async () => {
      const result = await prepareStoreOrderMessengerRoomEntryByRoomId(rid, {
        instantContextMeta: cmCtx,
        myRole: instantMyRole,
        viewerUserId: viewer || undefined,
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
      <CommunityMessengerRoomStableEntryShell roomId={roomId} variant="entry" recordShellPaint={false} />
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
