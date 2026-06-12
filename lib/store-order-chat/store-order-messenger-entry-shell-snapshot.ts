import { buildClientShellPlaceholderSnapshot } from "@/lib/community-messenger/room/client-shell-placeholder-snapshot";
import { peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import type {
  CommunityMessengerRoomContextMetaV1,
  CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";

/** ensure·bootstrap 전 delivery 헤더·크롬용 클라이언트 셸 스냅샷 */
export function buildStoreOrderMessengerShellSnapshot(params: {
  roomId: string;
  viewerUserId?: string;
  contextMeta: CommunityMessengerRoomContextMetaV1;
  myRole?: "owner" | "member";
}): CommunityMessengerRoomSnapshot {
  const base = buildClientShellPlaceholderSnapshot(params.roomId, params.viewerUserId);
  const headline = params.contextMeta.headline?.trim() ?? "";
  return {
    ...base,
    myRole: params.myRole ?? base.myRole,
    room: {
      ...base.room,
      title: headline,
      contextMeta: params.contextMeta,
      memberCount: 2,
    },
  };
}

/** 목록 peek → 없으면 delivery context 셸 → 기본 placeholder */
export function resolveInstantStoreOrderMessengerEntrySnapshot(params: {
  roomId: string;
  viewerUserId?: string;
  contextMeta?: CommunityMessengerRoomContextMetaV1 | null;
  myRole?: "owner" | "member";
}): CommunityMessengerRoomSnapshot {
  const rid = params.roomId.trim();
  if (!rid) {
    return buildClientShellPlaceholderSnapshot(rid, params.viewerUserId);
  }

  const viewer = (params.viewerUserId ?? "").trim();
  const peek = viewer ? peekRoomSnapshot(rid, viewer) : null;
  if (peek && !peek.clientShellPlaceholder) {
    return peek;
  }

  const meta = params.contextMeta;
  if (meta?.kind === "delivery") {
    return buildStoreOrderMessengerShellSnapshot({
      roomId: rid,
      viewerUserId: params.viewerUserId,
      contextMeta: meta,
      myRole: params.myRole,
    });
  }

  return buildClientShellPlaceholderSnapshot(rid, params.viewerUserId);
}
