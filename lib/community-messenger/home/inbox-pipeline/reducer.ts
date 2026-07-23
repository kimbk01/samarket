import type {
  CanonicalMessengerHomeRoom,
  CanonicalMessengerHomeRoomPatch,
  MessengerHomeCanonicalState,
  MessengerHomeRoomEvent,
  MessengerHomeSource,
} from "@/lib/community-messenger/home/inbox-pipeline/types";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";

export function createMessengerHomeCanonicalState(): MessengerHomeCanonicalState {
  return {
    rooms: new Map(),
    lastGenerationByRoomSource: new Map(),
    pendingPatches: new Map(),
  };
}

function generationKey(roomId: string, source: MessengerHomeSource): string {
  return `${roomId}:${source}`;
}

function mergePatches(
  prev: CanonicalMessengerHomeRoomPatch | undefined,
  incoming: CanonicalMessengerHomeRoomPatch
): CanonicalMessengerHomeRoomPatch {
  return { ...(prev ?? { roomId: incoming.roomId }), ...incoming, roomId: incoming.roomId };
}

function patchCanCreateRoom(patch: CanonicalMessengerHomeRoomPatch): boolean {
  return (
    patch.roomId.trim().length > 0 &&
    patch.roomType != null &&
    patch.title != null &&
    patch.avatarUrl !== undefined &&
    patch.latestMessage != null &&
    patch.lastMessageAt != null &&
    patch.unreadCount != null &&
    patch.isArchived != null &&
    patch.isBlockedHidden != null &&
    patch.roomStatus != null &&
    patch.memberCount != null
  );
}

function roomFromPatch(patch: CanonicalMessengerHomeRoomPatch): CanonicalMessengerHomeRoom {
  return {
    roomId: patch.roomId,
    roomType: patch.roomType!,
    directKey: patch.directKey ?? null,
    contextMeta: patch.contextMeta ?? null,
    chatDomain: patch.chatDomain ?? null,
    domainIdentity: patch.domainIdentity ?? null,
    title: patch.title!,
    avatarUrl: patch.avatarUrl ?? null,
    latestMessage: patch.latestMessage!,
    latestMessageType: patch.latestMessageType,
    lastMessageAt: patch.lastMessageAt!,
    unreadCount: Math.max(0, Math.floor(Number(patch.unreadCount) || 0)),
    isArchived: Boolean(patch.isArchived),
    isBlockedHidden: Boolean(patch.isBlockedHidden),
    roomStatus: patch.roomStatus!,
    memberCount: Math.max(0, Math.floor(Number(patch.memberCount) || 0)),
  };
}

function contextMetaEqual(
  a: CommunityMessengerRoomContextMetaV1 | null,
  b: CommunityMessengerRoomContextMetaV1 | null
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeContextMeta(
  prev: CommunityMessengerRoomContextMetaV1 | null,
  incoming: CommunityMessengerRoomContextMetaV1 | null | undefined
): CommunityMessengerRoomContextMetaV1 | null {
  if (incoming === undefined) return prev;
  if (incoming === null) {
    if (prev?.kind === "trade" || prev?.kind === "delivery") return prev;
    return null;
  }
  if (prev?.kind === incoming.kind) return { ...prev, ...incoming };
  return incoming;
}

function sourceAllowsUnreadDecrease(source: MessengerHomeSource): boolean {
  return source === "participant" || source === "full" || source === "home_sync";
}

function shouldApplyLatestMessage(prev: CanonicalMessengerHomeRoom, patch: CanonicalMessengerHomeRoomPatch): boolean {
  if (patch.lastMessageAt == null) return false;
  const prevMs = Date.parse(prev.lastMessageAt);
  const nextMs = Date.parse(patch.lastMessageAt);
  if (!Number.isFinite(nextMs)) return false;
  if (!Number.isFinite(prevMs)) return true;
  return nextMs > prevMs;
}

function mergeRoom(
  prev: CanonicalMessengerHomeRoom,
  patch: CanonicalMessengerHomeRoomPatch,
  source: MessengerHomeSource
): CanonicalMessengerHomeRoom {
  let changed = false;
  const next: CanonicalMessengerHomeRoom = { ...prev };

  const assign = <K extends keyof CanonicalMessengerHomeRoom>(key: K, value: CanonicalMessengerHomeRoom[K]) => {
    if (next[key] === value) return;
    next[key] = value;
    changed = true;
  };

  if (patch.roomType !== undefined) assign("roomType", patch.roomType);
  if (patch.directKey !== undefined) assign("directKey", patch.directKey);
  if (patch.chatDomain !== undefined) assign("chatDomain", patch.chatDomain);
  if (patch.domainIdentity !== undefined) assign("domainIdentity", patch.domainIdentity);
  const mergedContextMeta = mergeContextMeta(prev.contextMeta, patch.contextMeta);
  if (!contextMetaEqual(prev.contextMeta, mergedContextMeta)) {
    next.contextMeta = mergedContextMeta;
    changed = true;
  }
  if (patch.title !== undefined) assign("title", patch.title);
  if (patch.avatarUrl !== undefined) assign("avatarUrl", patch.avatarUrl);
  if (patch.isArchived !== undefined) assign("isArchived", patch.isArchived);
  if (patch.isBlockedHidden !== undefined) assign("isBlockedHidden", patch.isBlockedHidden);
  if (patch.roomStatus !== undefined) assign("roomStatus", patch.roomStatus);
  if (patch.memberCount !== undefined) {
    assign("memberCount", Math.max(0, Math.floor(Number(patch.memberCount) || 0)));
  }

  if (shouldApplyLatestMessage(prev, patch)) {
    assign("lastMessageAt", patch.lastMessageAt!);
    if (patch.latestMessage !== undefined) assign("latestMessage", patch.latestMessage);
    if (patch.latestMessageType !== undefined) assign("latestMessageType", patch.latestMessageType);
  }

  if (patch.unreadCount !== undefined) {
    const incomingUnread = Math.max(0, Math.floor(Number(patch.unreadCount) || 0));
    if (incomingUnread >= prev.unreadCount || sourceAllowsUnreadDecrease(source)) {
      assign("unreadCount", incomingUnread);
    }
  }

  return changed ? next : prev;
}

export function reduceMessengerHomeRoomEvent(
  state: MessengerHomeCanonicalState,
  event: MessengerHomeRoomEvent
): MessengerHomeCanonicalState {
  const key = generationKey(event.roomId, event.source);
  const prevGeneration = state.lastGenerationByRoomSource.get(key);
  if (prevGeneration != null && event.generation < prevGeneration) return state;

  if (event.kind === "remove") {
    const hasRoom = state.rooms.has(event.roomId);
    const hasPending = state.pendingPatches.has(event.roomId);
    if (!hasRoom && !hasPending && prevGeneration === event.generation) return state;
    const nextState: MessengerHomeCanonicalState = {
      rooms: hasRoom ? new Map(state.rooms) : state.rooms,
      lastGenerationByRoomSource:
        prevGeneration !== event.generation
          ? new Map(state.lastGenerationByRoomSource)
          : state.lastGenerationByRoomSource,
      pendingPatches: hasPending ? new Map(state.pendingPatches) : state.pendingPatches,
    };
    if (hasRoom) nextState.rooms.delete(event.roomId);
    if (hasPending) nextState.pendingPatches.delete(event.roomId);
    if (prevGeneration !== event.generation) nextState.lastGenerationByRoomSource.set(key, event.generation);
    return nextState;
  }

  const prevRoom = state.rooms.get(event.roomId);
  const pending = state.pendingPatches.get(event.roomId);
  const combinedPatch = prevRoom ? event.patch : mergePatches(pending, event.patch);
  const nextRoom = prevRoom
    ? mergeRoom(prevRoom, event.patch, event.source)
    : patchCanCreateRoom(combinedPatch)
      ? roomFromPatch(combinedPatch)
      : null;

  const pendingChanged = !prevRoom && !nextRoom && JSON.stringify(pending ?? null) !== JSON.stringify(combinedPatch);
  const roomChanged = nextRoom != null && nextRoom !== prevRoom;
  const generationChanged = prevGeneration !== event.generation;

  if (!pendingChanged && !roomChanged) return state;

  const nextState: MessengerHomeCanonicalState = {
    rooms: roomChanged ? new Map(state.rooms) : state.rooms,
    lastGenerationByRoomSource: generationChanged
      ? new Map(state.lastGenerationByRoomSource)
      : state.lastGenerationByRoomSource,
    pendingPatches: pendingChanged || (nextRoom && pending) ? new Map(state.pendingPatches) : state.pendingPatches,
  };

  if (generationChanged) nextState.lastGenerationByRoomSource.set(key, event.generation);
  if (nextRoom) {
    nextState.rooms.set(event.roomId, nextRoom);
    if (pending) nextState.pendingPatches.delete(event.roomId);
  } else if (pendingChanged) {
    nextState.pendingPatches.set(event.roomId, combinedPatch);
  }
  return nextState;
}
