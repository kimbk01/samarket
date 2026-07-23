import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { peekHotRoomSnapshot, peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { isMessengerRoomTimelineBootstrapSeedComplete } from "@/lib/community-messenger/room/messenger-room-timeline-hydration";
import { isMessengerRoomLastMessageDisplayPlaceholder } from "@/lib/community-messenger/room/messenger-room-last-message-placeholder";
import {
  deriveRoomReadVersionMs,
  shouldAcceptIncomingRoomRead,
  type DomainRoomReadVersion,
  type RoomReadSource,
} from "@/lib/chat-domain/room-read/domain-room-read-version";

function messageCount(snap: CommunityMessengerRoomSnapshot | null | undefined): number {
  return snap?.messages?.length ?? 0;
}

function versionFromSnap(
  snap: CommunityMessengerRoomSnapshot,
  fallbackSource: RoomReadSource,
): DomainRoomReadVersion {
  return {
    roomId: String(snap.room?.id ?? "").trim(),
    versionMs: deriveRoomReadVersionMs({
      lastMessageAt: snap.room?.lastMessageAt,
      messageCreatedAts: (snap.messages ?? []).map((m) => m.createdAt),
      explicitVersionMs: snap.readVersionMs,
    }),
    source: snap.readVersionSource ?? fallbackSource,
    chatDomain: snap.room?.chatDomain ?? null,
    domainIdentity: snap.room?.domainIdentity ?? null,
  };
}

function preferSnapshotByRoomReadVersion(
  current: CommunityMessengerRoomSnapshot,
  candidate: CommunityMessengerRoomSnapshot,
  currentSource: RoomReadSource,
  candidateSource: RoomReadSource,
): CommunityMessengerRoomSnapshot {
  const prev = versionFromSnap(current, currentSource);
  const incoming = versionFromSnap(candidate, candidateSource);
  if (prev.versionMs > 0 || incoming.versionMs > 0) {
    return shouldAcceptIncomingRoomRead(prev, incoming) ? candidate : current;
  }
  return messageCount(candidate) > messageCount(current) ? candidate : current;
}

/** BootstrapGate·IndexedDB·foreground lock 재사용 가능한 실스냅샷(클라 셸 placeholder 제외) */
export function isMessengerRoomBootstrapReadySnapshot(
  snap: CommunityMessengerRoomSnapshot | null | undefined
): snap is CommunityMessengerRoomSnapshot {
  return Boolean(snap && !snap.clientShellPlaceholder);
}

/** lastMessage 없음 + messages[] 비어 있음 — 진짜 빈 방만 authoritative empty 로 인정 */
export function isMessengerRoomConfirmedEmptySnapshot(
  snapshot:
    | {
        messages?: CommunityMessengerRoomSnapshot["messages"];
        room: Pick<CommunityMessengerRoomSnapshot["room"], "lastMessage">;
        clientShellPlaceholder?: boolean;
      }
    | null
    | undefined
): boolean {
  if (!snapshot || snapshot.clientShellPlaceholder) return false;
  const lastMessage = snapshot.room.lastMessage?.trim() ?? "";
  if (lastMessage && !isMessengerRoomLastMessageDisplayPlaceholder(lastMessage)) return false;
  return (snapshot.messages?.length ?? 0) === 0;
}

/** RoomClient 첫 mount·paint SSOT — complete bootstrap seed 또는 confirmed empty 만 */
export function isAuthoritativeMessengerRoomEntrySnapshot(
  snapshot: CommunityMessengerRoomSnapshot | null | undefined
): snapshot is CommunityMessengerRoomSnapshot {
  if (!isMessengerRoomBootstrapReadySnapshot(snapshot)) return false;
  return (
    isMessengerRoomTimelineBootstrapSeedComplete(snapshot) ||
    isMessengerRoomConfirmedEmptySnapshot(snapshot)
  );
}

function isAuthoritativeRoomSnapshotCandidate(
  snapshot: CommunityMessengerRoomSnapshot | null | undefined
): snapshot is CommunityMessengerRoomSnapshot {
  return isAuthoritativeMessengerRoomEntrySnapshot(snapshot);
}

/**
 * complete seed 또는 confirmed empty 후보만 pool — lastMessage-only incomplete 는 authoritative 금지.
 * Phase F: content clock(readVersion)이 있으면 stale-rich cache가 fresher server를 이기지 못함.
 */
export function pickRichestAuthoritativeRoomSnapshot(
  server: CommunityMessengerRoomSnapshot | null,
  ...others: Array<CommunityMessengerRoomSnapshot | null | undefined>
): CommunityMessengerRoomSnapshot | null {
  type Tagged = { snap: CommunityMessengerRoomSnapshot; source: RoomReadSource };
  const candidates: Tagged[] = [];
  if (server && isAuthoritativeRoomSnapshotCandidate(server)) {
    candidates.push({ snap: server, source: "server_bootstrap" });
  }
  for (const candidate of others) {
    if (isAuthoritativeRoomSnapshotCandidate(candidate)) {
      const source: RoomReadSource =
        candidate.readVersionSource === "hot_cache"
          ? "hot_cache"
          : candidate.readVersionSource === "idb"
            ? "idb"
            : candidate.readVersionSource === "optimistic"
              ? "optimistic"
              : "memory_cache";
      candidates.push({ snap: candidate, source });
    }
  }
  if (candidates.length === 0) return null;

  let best = candidates[0]!;
  for (const candidate of candidates.slice(1)) {
    const next = preferSnapshotByRoomReadVersion(
      best.snap,
      candidate.snap,
      best.source,
      candidate.source,
    );
    if (next === candidate.snap) best = candidate;
  }
  return best.snap;
}

export type PickAuthoritativeMessengerRoomSnapshotInput = {
  roomId: string;
  viewerUserId: string;
  /** BootstrapGate·주문 슬라이드·ensure+bootstrap 등 진입 게이트가 내려준 시드 */
  serverSnapshot: CommunityMessengerRoomSnapshot | null | undefined;
};

/**
 * 방 Client 첫 state 에 쓸 스냅샷 — **complete seed 또는 confirmed empty 만**.
 * lastMessage-only 목록 peek·summary cache 는 room timeline paint SSOT 가 아님.
 */
export function pickAuthoritativeMessengerRoomSnapshot(
  input: PickAuthoritativeMessengerRoomSnapshotInput
): CommunityMessengerRoomSnapshot | null {
  const rid = input.roomId.trim();
  if (!rid) return null;

  const server = input.serverSnapshot;
  const serverUsable =
    server && isAuthoritativeRoomSnapshotCandidate(server) ? server : null;

  const viewer = input.viewerUserId.trim();
  const cached = viewer ? peekRoomSnapshot(rid, viewer) : null;
  const hot = viewer ? peekHotRoomSnapshot(rid, viewer) : null;

  const richest = pickRichestAuthoritativeRoomSnapshot(serverUsable, cached, hot);
  if (richest) return richest;

  if (serverUsable) return serverUsable;

  return null;
}

/** IndexedDB local-first — incomplete seed 로 loaded 완료 처리 금지 */
export function shouldPromoteLocalRoomSnapshotToEntryLoaded(
  local: CommunityMessengerRoomSnapshot | null | undefined
): boolean {
  return isAuthoritativeMessengerRoomEntrySnapshot(local);
}

/** BootstrapGate — RoomClient mount 허용 여부 */
export function canMountCommunityMessengerRoomClient(
  snapshot: CommunityMessengerRoomSnapshot | null | undefined
): boolean {
  return isAuthoritativeMessengerRoomEntrySnapshot(snapshot);
}

/** 진입 계약 검증 — dev·테스트·ensure+bootstrap 응답 */
export function assertStoreOrderRoomBootstrapHasTimelineSeed(
  snapshot: CommunityMessengerRoomSnapshot | null | undefined
): { ok: true } | { ok: false; reason: string } {
  if (!snapshot || snapshot.clientShellPlaceholder) {
    return { ok: false, reason: "missing_snapshot" };
  }
  const rid = snapshot.room?.id?.trim();
  if (!rid) return { ok: false, reason: "missing_room_id" };
  const meta = snapshot.room.contextMeta;
  if (meta?.kind !== "delivery") {
    return isAuthoritativeMessengerRoomEntrySnapshot(snapshot)
      ? { ok: true }
      : { ok: false, reason: "incomplete_timeline_seed" };
  }
  const hasMessages = (snapshot.messages?.length ?? 0) > 0;
  const hasLastMessageHint = Boolean(snapshot.room.lastMessage?.trim());
  if (hasMessages || !hasLastMessageHint) {
    return isAuthoritativeMessengerRoomEntrySnapshot(snapshot)
      ? { ok: true }
      : { ok: false, reason: "incomplete_timeline_seed" };
  }
  return { ok: false, reason: "delivery_room_empty_timeline" };
}
