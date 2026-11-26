"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CommunityMessengerRoomClient } from "@/components/community-messenger/CommunityMessengerRoomClient";
import { CommunityMessengerRoomEntryEmpty } from "@/components/community-messenger/room/CommunityMessengerRoomEntryEmpty";
import { MessengerRoomSwipeBackShell } from "@/components/community-messenger/room/MessengerRoomSwipeBackShell";
import { communityMessengerRoomInboxGroupKind } from "@/lib/community-messenger/messenger-room-domain";
import { resolveOwnerOrderChatsBackHref } from "@/lib/community-messenger/room/messenger-room-back-target";
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
import { getLocalRoomSnapshot } from "@/lib/community-messenger/local-store/roomSnapshotDb";
import { isRoomLeftLocally } from "@/lib/community-messenger/room-snapshot-cache";
import { inferInstantStoreOrderMessengerMyRole } from "@/lib/store-order-chat/infer-store-order-messenger-instant-role";

type MessengerRoomCanonicalConvergence = {
  requestedRoomId: string;
  canonicalRoomId: string;
};

function normalizedRoomId(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

/**
 * Alias route may temporarily differ from the canonical room id returned by bootstrap.
 * Only the exact alias→canonical pair recorded from that bootstrap may share one RoomClient mount.
 */
export function resolveMessengerRoomEntryMountIdentity(args: {
  routeRoomId: string;
  snapshotRoomId: string;
  convergence: MessengerRoomCanonicalConvergence | null;
}): string | null {
  const routeRoomId = normalizedRoomId(args.routeRoomId);
  const snapshotRoomId = normalizedRoomId(args.snapshotRoomId);
  if (!routeRoomId || !snapshotRoomId) return null;
  if (routeRoomId === snapshotRoomId) return snapshotRoomId;
  if (
    args.convergence?.requestedRoomId === routeRoomId &&
    args.convergence.canonicalRoomId === snapshotRoomId
  ) {
    return snapshotRoomId;
  }
  return null;
}

export function shouldReusePreparedSnapshotAfterCanonicalReplace(args: {
  routeRoomId: string;
  snapshotRoomId: string;
  convergence: MessengerRoomCanonicalConvergence | null;
}): boolean {
  const routeRoomId = normalizedRoomId(args.routeRoomId);
  const snapshotRoomId = normalizedRoomId(args.snapshotRoomId);
  const convergence = args.convergence;
  return Boolean(
    routeRoomId &&
      snapshotRoomId &&
      convergence &&
      convergence.requestedRoomId !== convergence.canonicalRoomId &&
      routeRoomId === convergence.canonicalRoomId &&
      snapshotRoomId === convergence.canonicalRoomId
  );
}

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
  const entrySnapshotRef = useRef(entrySnapshot);
  const canonicalConvergenceRef = useRef<MessengerRoomCanonicalConvergence | null>(
    entrySnapshot && normalizedRoomId(entrySnapshot.room.id) !== normalizedRoomId(roomId)
      ? {
          requestedRoomId: normalizedRoomId(roomId),
          canonicalRoomId: normalizedRoomId(entrySnapshot.room.id),
        }
      : null
  );
  const [bootstrapPending, setBootstrapPending] = useState(
    () => !peekMountableEntrySnapshot(roomId, viewerUserId)
  );
  const [entryError, setEntryError] = useState<string | null>(null);
  /** 네트워크·마감·서버 일시 오류 — 접근 거부(entryError)와 달리 리다이렉트하지 않고 재시도 */
  const [entryTransientFailed, setEntryTransientFailed] = useState(false);
  const [entryAttempt, setEntryAttempt] = useState(0);

  useEffect(() => {
    const rid = roomId.trim();
    if (!rid) {
      setEntryError("missing_room_id");
      setBootstrapPending(false);
      setEntrySnapshot(null);
      return;
    }

    const preparedSnapshot = entrySnapshotRef.current;
    if (
      preparedSnapshot &&
      shouldReusePreparedSnapshotAfterCanonicalReplace({
        routeRoomId: rid,
        snapshotRoomId: preparedSnapshot.room.id,
        convergence: canonicalConvergenceRef.current,
      })
    ) {
      canonicalConvergenceRef.current = null;
      setBootstrapPending(false);
      return;
    }

    let cancelled = false;
    setEntryError(null);
    setEntryTransientFailed(false);

    const cached = peekMountableEntrySnapshot(rid, viewerUserId);
    if (cached) {
      const canonicalRoomId = normalizedRoomId(cached.room.id);
      canonicalConvergenceRef.current =
        canonicalRoomId && canonicalRoomId !== rid
          ? { requestedRoomId: rid, canonicalRoomId }
          : null;
      entrySnapshotRef.current = cached;
      setEntrySnapshot(cached);
      setBootstrapPending(false);
      // background refresh — do not clear room to spinner
      void (async () => {
        let result: Awaited<ReturnType<typeof prepareStoreOrderMessengerRoomEntryByRoomId>>;
        try {
          result = await prepareStoreOrderMessengerRoomEntryByRoomId(rid, {
            instantContextMeta: cmCtx,
            myRole: instantMyRole,
            viewerUserId: viewerUserId?.trim() || undefined,
          });
        } catch {
          return;
        }
        if (cancelled || !result.ok) return;
        if (!canMountCommunityMessengerRoomClient(result.snapshot)) return;
        const canonicalRoomId = normalizedRoomId(result.roomId);
        const snapshotRoomId = normalizedRoomId(result.snapshot.room.id);
        if (!canonicalRoomId || canonicalRoomId !== snapshotRoomId) return;
        canonicalConvergenceRef.current =
          canonicalRoomId !== rid ? { requestedRoomId: rid, canonicalRoomId } : null;
        entrySnapshotRef.current = result.snapshot;
        setEntrySnapshot(result.snapshot);
      })();
      return () => {
        cancelled = true;
      };
    }

    setBootstrapPending(true);
    entrySnapshotRef.current = null;
    setEntrySnapshot(null);

    /**
     * 앱 진입 SSOT C2 (`docs/audit/app-entry-ssot-fix-design-2026-11-26.md` §11 · Owner 「C1′로 진행」 2026-11-26):
     * 메모리 저장본이 없으면(앱을 새로 켠 알림·복원 진입 등) 기기 저장본(IndexedDB · 같은 보는 사람 · 만료 전)으로 먼저 그린다.
     * 서버 요청은 그대로 함께 나가고, 도착하면 아래에서 최신 값으로 바꾼다(메모리 저장본 경로와 같은 「먼저 그림 → 새로 고침」).
     * 서버가 먼저 오면 저장본은 버린다. 방을 나간 기록이 있으면 쓰지 않는다.
     */
    let networkSettled = false;
    const viewerForLocal = viewerUserId?.trim() || "";
    if (viewerForLocal && !isRoomLeftLocally(rid)) {
      void getLocalRoomSnapshot(rid, viewerForLocal)
        .then((local) => {
          if (cancelled || networkSettled || !local) return;
          if (!canMountCommunityMessengerRoomClient(local)) return;
          if (normalizedRoomId(local.room.id) !== rid) return;
          canonicalConvergenceRef.current = null;
          entrySnapshotRef.current = local;
          setEntrySnapshot(local);
          setBootstrapPending(false);
        })
        .catch(() => {
          /* 서버 경로가 그대로 처리 */
        });
    }

    void (async () => {
      let result: Awaited<ReturnType<typeof prepareStoreOrderMessengerRoomEntryByRoomId>>;
      try {
        result = await prepareStoreOrderMessengerRoomEntryByRoomId(rid, {
          instantContextMeta: cmCtx,
          myRole: instantMyRole,
          viewerUserId: viewerUserId?.trim() || undefined,
        });
      } catch {
        networkSettled = true;
        if (cancelled) return;
        // 기기 저장본으로 이미 그렸으면 그 화면을 유지(실패 화면으로 바꾸지 않음) — 메모리 저장본 경로와 같다.
        if (entrySnapshotRef.current) return;
        setEntryTransientFailed(true);
        setBootstrapPending(false);
        return;
      }
      networkSettled = true;
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
      const canonicalRoomId = normalizedRoomId(result.roomId);
      const snapshotRoomId = normalizedRoomId(result.snapshot.room.id);
      if (!canonicalRoomId || canonicalRoomId !== snapshotRoomId) {
        setEntryError("room_identity_mismatch");
        setBootstrapPending(false);
        return;
      }
      canonicalConvergenceRef.current =
        canonicalRoomId !== rid ? { requestedRoomId: rid, canonicalRoomId } : null;
      entrySnapshotRef.current = result.snapshot;
      setEntrySnapshot(result.snapshot);
      setBootstrapPending(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId, viewerUserId, cmCtx, instantMyRole, entryAttempt]);

  useEffect(() => {
    if (!entryError || redirectedRef.current || bootstrapPending) return;
    redirectedRef.current = true;
    redirectResourceAccessDenied(router, "/community-messenger");
  }, [entryError, bootstrapPending, router]);

  const retryEntry = useCallback(() => {
    setEntryTransientFailed(false);
    setBootstrapPending(true);
    setEntryAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!entryTransientFailed || typeof window === "undefined") return;
    window.addEventListener("online", retryEntry);
    return () => window.removeEventListener("online", retryEntry);
  }, [entryTransientFailed, retryEntry]);

  if (entryError) {
    return null;
  }

  const roomClientMountIdentity =
    entrySnapshot ?
      resolveMessengerRoomEntryMountIdentity({
        routeRoomId: roomId,
        snapshotRoomId: entrySnapshot.room.id,
        convergence: canonicalConvergenceRef.current,
      })
    : null;

  const cold =
    bootstrapPending ||
    !entrySnapshot ||
    !roomClientMountIdentity ||
    !canMountCommunityMessengerRoomClient(entrySnapshot);

  /**
   * ONE PAGE MOTION OWNER for cold + warm: SwipeBackShell wraps both EntryEmpty and RoomClient.
   * Cold spinner is content inside the entering shell — not a pre-motion full-page flash.
   * Shell stays mounted across cold→warm so enter does not run twice.
   */
  return (
    <MessengerRoomSwipeBackShell
      roomId={roomId}
      roomType={entrySnapshot?.room?.roomType ?? null}
      roomListKind={entrySnapshot?.room ? communityMessengerRoomInboxGroupKind(entrySnapshot.room) : null}
      ownerOrderChatsHref={resolveOwnerOrderChatsBackHref(entrySnapshot?.room, entrySnapshot?.myRole)}
    >
      {cold ? (
        <CommunityMessengerRoomEntryEmpty
          roomId={roomId}
          recordShellPaint={false}
          recordPass1Milestones
          dataAttrs={{ "data-cm-room-pass1-stable-shell": "" }}
          onRetryAfterFailure={entryTransientFailed ? retryEntry : undefined}
        />
      ) : (
        <CommunityMessengerRoomClient
          key={roomClientMountIdentity!}
          roomId={roomId}
          initialServerSnapshot={entrySnapshot!}
          initialViewerUserId={viewerUserId || entrySnapshot!.viewerUserId?.trim() || undefined}
        />
      )}
    </MessengerRoomSwipeBackShell>
  );
}
