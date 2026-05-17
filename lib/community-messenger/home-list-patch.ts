/**
 * R2-M1 — 홈 room list (`chats` / `groups`) 유일 patch reducer.
 * CONTRACT: list 행 변경은 본 모듈 `applyHomeListPatch` 만. 직접 `setData` 로 chats/groups mutate 금지.
 */

import { peekBootstrapCache, primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { mergeBootstrapRoomSummaryIntoLists } from "@/lib/community-messenger/home/merge-bootstrap-room-summary-into-lists";
import {
  patchBootstrapRoomListForRealtimeMessageInsert,
  patchBootstrapRoomListForSenderLocalEcho,
} from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import { mergeMessengerRoomSummaryForHomeSyncCriticalPatch } from "@/lib/community-messenger/merge-critical-home-sync-room-summary";
import { messengerTraceConsoleDebug } from "@/lib/community-messenger/messenger-trace-console";
import { getChatListingBoxPresentation } from "@/lib/products/seller-listing-state";
import { normalizeMessengerRealtimeRoomId } from "@/lib/community-messenger/stores/messenger-realtime-store";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerRoomContextMetaV1,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

export type HomeListPatchSource =
  | "bootstrap"
  | "home-sync"
  | "realtime"
  | "mark-read"
  | "optimistic-read"
  | "trade-meta"
  | "multi-tab"
  | "dev-only";

export type HomeListPatch =
  | { kind: "bootstrap_full_seed"; bootstrap: CommunityMessengerBootstrap }
  | {
      kind: "bootstrap_apply_full";
      next: CommunityMessengerBootstrap;
      /** @default true when prev exists */
      mergeStaleOutgoingRequests?: boolean;
    }
  | {
      kind: "home_sync";
      chats?: CommunityMessengerRoomSummary[];
      groups?: CommunityMessengerRoomSummary[];
      requests?: CommunityMessengerBootstrap["requests"];
      friends?: CommunityMessengerBootstrap["friends"];
      roomMode?: "replace" | "critical_patch";
    }
  | { kind: "merge_room_summary"; summary: CommunityMessengerRoomSummary }
  | {
      kind: "realtime_message_insert";
      roomId: string;
      messageRow: Record<string, unknown>;
      boostUnreadCount?: boolean;
    }
  | {
      kind: "sender_local_echo";
      roomId: string;
      preview: Pick<CommunityMessengerRoomSummary, "lastMessage" | "lastMessageType" | "lastMessageAt"> | null;
    }
  | { kind: "local_unread"; roomId: string; unreadCount: number }
  | {
      kind: "trade_context_meta";
      patches: Array<{ roomId: string; contextMeta: CommunityMessengerRoomContextMetaV1 | null }>;
    }
  | {
      kind: "room_update";
      roomId: string;
      updater: (room: CommunityMessengerRoomSummary) => CommunityMessengerRoomSummary;
    }
  | { kind: "remove_room"; roomId: string }
  | {
      kind: "trade_post_listing_meta";
      postId: string;
      sellerListingStateRaw: unknown;
      postStatus: string | null | undefined;
    };

export type HomeListPatchStats = {
  source: HomeListPatchSource;
  kind: HomeListPatch["kind"];
  beforeCount: number;
  afterCount: number;
  incomingPatchRooms: number;
  appliedRooms: number;
  droppedStale: number;
  unreadGuardApplied: number;
  duplicateRemoved: number;
  durationMs: number;
};

function homeListOwnerTraceEnabled(): boolean {
  try {
    return (
      process.env.SAMARKET_MESSENGER_TRACE_LOG === "1" ||
      process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE === "1" ||
      process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_LIST_OWNER === "1" ||
      process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_BOOTSTRAP_BREAKDOWN === "1"
    );
  } catch {
    return false;
  }
}

function countListRooms(data: CommunityMessengerBootstrap | null): number {
  if (!data) return 0;
  return (data.chats?.length ?? 0) + (data.groups?.length ?? 0);
}

function logHomeListOwner(stats: HomeListPatchStats): void {
  if (!homeListOwnerTraceEnabled()) return;
  messengerTraceConsoleDebug("[cm-list-owner]", stats);
}

function mergeCriticalRoomPatchesIntoLists(
  baseList: CommunityMessengerRoomSummary[],
  incoming: CommunityMessengerRoomSummary[]
): { list: CommunityMessengerRoomSummary[]; unreadGuardApplied: number } {
  if (!incoming.length) return { list: baseList, unreadGuardApplied: 0 };
  let unreadGuardApplied = 0;
  const baseById = new Map(baseList.map((r) => [r.id, r]));
  const incomingIds = new Set(incoming.map((r) => r.id));
  const head = incoming.map((inc) => {
    const merged = mergeMessengerRoomSummaryForHomeSyncCriticalPatch(baseById.get(inc.id), inc);
    if (merged.unreadCount !== inc.unreadCount) unreadGuardApplied += 1;
    return merged;
  });
  const tail = baseList.filter((r) => !incomingIds.has(r.id));
  return { list: [...head, ...tail], unreadGuardApplied };
}

/** silent full 보강 시 outgoing pending 유지 — home-bootstrap 와 동일 */
export function mergeFriendRequestsKeepStaleOutgoingForBootstrap(
  base: CommunityMessengerBootstrap,
  serverList: CommunityMessengerBootstrap["requests"]
): CommunityMessengerBootstrap["requests"] {
  const server = serverList ?? [];
  const meId = base.me?.id?.trim();
  if (!meId) return server;
  const prev = base.requests ?? [];
  const extra = prev.filter((r) => {
    if (r.status !== "pending" || r.direction !== "outgoing" || r.requesterId !== meId) return false;
    return !server.some((s) => {
      if (String(s.id) === String(r.id)) return true;
      return (
        s.status === "pending" &&
        s.requesterId === r.requesterId &&
        s.addresseeId === r.addresseeId
      );
    });
  });
  if (!extra.length) return server;
  return [...server, ...extra];
}

function applyRoomUpdateToLists(
  data: CommunityMessengerBootstrap,
  roomId: string,
  updater: (room: CommunityMessengerRoomSummary) => CommunityMessengerRoomSummary
): CommunityMessengerBootstrap {
  const rid = String(roomId ?? "").trim();
  if (!rid) return data;
  const norm = normalizeMessengerRealtimeRoomId(rid);
  let hit = false;
  const patchBucket = (rooms: CommunityMessengerRoomSummary[]) =>
    rooms.map((room) => {
      if (normalizeMessengerRealtimeRoomId(room.id) !== norm) return room;
      hit = true;
      return updater(room);
    });
  const chats = patchBucket(data.chats ?? []);
  const groups = patchBucket(data.groups ?? []);
  if (!hit) return data;
  return {
    ...data,
    chats,
    groups,
  };
}

function applyLocalUnreadToLists(
  data: CommunityMessengerBootstrap,
  roomId: string,
  unreadCount: number
): { data: CommunityMessengerBootstrap; applied: boolean } {
  const evRoomNorm = normalizeMessengerRealtimeRoomId(roomId);
  let hit = false;
  const patchRooms = (rooms: CommunityMessengerRoomSummary[]) =>
    rooms.map((room) => {
      if (normalizeMessengerRealtimeRoomId(room.id) !== evRoomNorm) return room;
      hit = true;
      return { ...room, unreadCount };
    });
  if (!hit) return { data, applied: false };
  return {
    data: {
      ...data,
      chats: patchRooms(data.chats ?? []),
      groups: patchRooms(data.groups ?? []),
    },
    applied: true,
  };
}

function applyTradePostListingMetaPatch(
  prev: CommunityMessengerBootstrap,
  postId: string,
  sellerListingStateRaw: unknown,
  postStatus: string | null | undefined
): CommunityMessengerBootstrap | null {
  const label = getChatListingBoxPresentation(sellerListingStateRaw, postStatus ?? undefined).label;
  let changed = false;
  const patchList = (rooms: CommunityMessengerRoomSummary[]) =>
    rooms.map((room) => {
      const m = room.contextMeta;
      if (!m || m.kind !== "trade") return room;
      if (String(m.postId ?? "").trim() !== postId) return room;
      if (m.itemStateLabel === label) return room;
      changed = true;
      return { ...room, contextMeta: { ...m, itemStateLabel: label } };
    });
  if (!changed) return null;
  return {
    ...prev,
    chats: patchList(prev.chats ?? []),
    groups: patchList(prev.groups ?? []),
  };
}

function applyTradeContextMetaPatches(
  prev: CommunityMessengerBootstrap,
  patches: Array<{ roomId: string; contextMeta: CommunityMessengerRoomContextMetaV1 | null }>
): CommunityMessengerBootstrap {
  const map = new Map(patches.map((p) => [p.roomId, p.contextMeta]));
  const patchRooms = (rooms: CommunityMessengerRoomSummary[]) =>
    rooms.map((r) => {
      if (!map.has(r.id)) return r;
      return { ...r, contextMeta: map.get(r.id) ?? null };
    });
  return {
    ...prev,
    chats: patchRooms(prev.chats ?? []),
    groups: patchRooms(prev.groups ?? []),
  };
}

function applyHomeSyncPatch(
  base: CommunityMessengerBootstrap,
  patch: Extract<HomeListPatch, { kind: "home_sync" }>
): { data: CommunityMessengerBootstrap; unreadGuardApplied: number; duplicateRemoved: number } {
  const roomMode = patch.roomMode ?? "replace";
  let unreadGuardApplied = 0;
  let chats = base.chats;
  if (patch.chats !== undefined) {
    if (roomMode === "critical_patch") {
      const merged = mergeCriticalRoomPatchesIntoLists(base.chats ?? [], patch.chats);
      chats = merged.list;
      unreadGuardApplied += merged.unreadGuardApplied;
    } else {
      chats = patch.chats;
    }
  }
  let groups = base.groups;
  if (patch.groups !== undefined) {
    if (roomMode === "critical_patch") {
      const merged = mergeCriticalRoomPatchesIntoLists(base.groups ?? [], patch.groups);
      groups = merged.list;
      unreadGuardApplied += merged.unreadGuardApplied;
    } else {
      groups = patch.groups;
    }
  }
  const requests =
    roomMode === "critical_patch"
      ? base.requests
      : patch.requests !== undefined
        ? mergeFriendRequestsKeepStaleOutgoingForBootstrap(base, patch.requests)
        : base.requests;
  const friends = roomMode === "critical_patch" ? base.friends : patch.friends ?? base.friends;

  const beforeIds = new Set([...(base.chats ?? []), ...(base.groups ?? [])].map((r) => r.id));
  const afterIds = new Set([...(chats ?? []), ...(groups ?? [])].map((r) => r.id));
  let duplicateRemoved = 0;
  for (const id of beforeIds) {
    if (!afterIds.has(id)) duplicateRemoved += 1;
  }

  if (
    chats === base.chats &&
    groups === base.groups &&
    requests === base.requests &&
    friends === base.friends
  ) {
    return { data: base, unreadGuardApplied, duplicateRemoved: 0 };
  }

  return {
    data: {
      ...base,
      chats,
      groups,
      requests,
      friends,
      tabs: {
        ...base.tabs,
        chats: (chats ?? []).length,
        groups: (groups ?? []).length,
        friends: (friends ?? []).length,
      },
    },
    unreadGuardApplied,
    duplicateRemoved,
  };
}

/**
 * 홈 room list 유일 reducer. `prev === null` 이면 `bootstrap_full_seed` 만 허용.
 */
export function applyHomeListPatch(
  prev: CommunityMessengerBootstrap | null,
  patch: HomeListPatch,
  source: HomeListPatchSource
): CommunityMessengerBootstrap | null {
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  const beforeCount = countListRooms(prev);

  let next: CommunityMessengerBootstrap | null = prev;
  let incomingPatchRooms = 0;
  let appliedRooms = 0;
  let droppedStale = 0;
  let unreadGuardApplied = 0;
  let duplicateRemoved = 0;

  if (!prev) {
    if (patch.kind === "bootstrap_full_seed") {
      next = patch.bootstrap;
      appliedRooms = countListRooms(next);
    } else {
      droppedStale = 1;
      next = null;
    }
  } else {
    const base = prev ?? peekBootstrapCache();
    if (!base) {
      droppedStale = 1;
      next = prev;
    } else {
      switch (patch.kind) {
        case "bootstrap_full_seed": {
          next = patch.bootstrap;
          appliedRooms = countListRooms(next);
          break;
        }
        case "bootstrap_apply_full": {
          const mergeReq = patch.mergeStaleOutgoingRequests !== false;
          const synced = applyHomeSyncPatch(base, {
            kind: "home_sync",
            chats: patch.next.chats,
            groups: patch.next.groups,
            roomMode: "replace",
          });
          unreadGuardApplied += synced.unreadGuardApplied;
          duplicateRemoved += synced.duplicateRemoved;
          next = {
            ...patch.next,
            chats: synced.data.chats,
            groups: synced.data.groups,
            requests: mergeReq
              ? mergeFriendRequestsKeepStaleOutgoingForBootstrap(base, patch.next.requests ?? [])
              : patch.next.requests,
            tabs: {
              ...patch.next.tabs,
              chats: (synced.data.chats ?? []).length,
              groups: (synced.data.groups ?? []).length,
            },
          };
          appliedRooms = countListRooms(next);
          break;
        }
        case "home_sync": {
          incomingPatchRooms = (patch.chats?.length ?? 0) + (patch.groups?.length ?? 0);
          const synced = applyHomeSyncPatch(base, patch);
          unreadGuardApplied += synced.unreadGuardApplied;
          duplicateRemoved += synced.duplicateRemoved;
          next = synced.data === base ? base : synced.data;
          appliedRooms = countListRooms(next) - beforeCount;
          if (appliedRooms < 0) appliedRooms = incomingPatchRooms;
          break;
        }
        case "merge_room_summary": {
          incomingPatchRooms = 1;
          next = mergeBootstrapRoomSummaryIntoLists(base, patch.summary);
          appliedRooms = next === base ? 0 : 1;
          break;
        }
        case "realtime_message_insert": {
          incomingPatchRooms = 1;
          next = patchBootstrapRoomListForRealtimeMessageInsert(base, patch.roomId, patch.messageRow, {
            boostUnreadCount: patch.boostUnreadCount,
          });
          appliedRooms = next === base ? 0 : 1;
          break;
        }
        case "sender_local_echo": {
          incomingPatchRooms = 1;
          next = patchBootstrapRoomListForSenderLocalEcho(base, patch.roomId, patch.preview);
          appliedRooms = next === base ? 0 : 1;
          break;
        }
        case "local_unread": {
          incomingPatchRooms = 1;
          const { data, applied } = applyLocalUnreadToLists(base, patch.roomId, patch.unreadCount);
          next = data;
          appliedRooms = applied ? 1 : 0;
          if (!applied) droppedStale = 1;
          break;
        }
        case "trade_context_meta": {
          incomingPatchRooms = patch.patches.length;
          next = applyTradeContextMetaPatches(base, patch.patches);
          appliedRooms = next === base ? 0 : patch.patches.length;
          break;
        }
        case "room_update": {
          incomingPatchRooms = 1;
          next = applyRoomUpdateToLists(base, patch.roomId, patch.updater);
          appliedRooms = next === base ? 0 : 1;
          break;
        }
        case "trade_post_listing_meta": {
          incomingPatchRooms = 1;
          const patched = applyTradePostListingMetaPatch(
            base,
            patch.postId,
            patch.sellerListingStateRaw,
            patch.postStatus
          );
          if (!patched) {
            next = base;
            droppedStale = 1;
          } else {
            next = patched;
            appliedRooms = 1;
          }
          break;
        }
        case "remove_room": {
          incomingPatchRooms = 1;
          const drop = (rooms: CommunityMessengerRoomSummary[]) =>
            rooms.filter((room) => room.id !== patch.roomId);
          const nextChats = drop(base.chats ?? []);
          const nextGroups = drop(base.groups ?? []);
          if (nextChats.length === (base.chats ?? []).length && nextGroups.length === (base.groups ?? []).length) {
            next = base;
            droppedStale = 1;
          } else {
            next = {
              ...base,
              chats: nextChats,
              groups: nextGroups,
              tabs: {
                ...base.tabs,
                chats: nextChats.length,
                groups: nextGroups.length,
              },
            };
            appliedRooms = 1;
            duplicateRemoved = 1;
          }
          break;
        }
        default:
          next = base;
      }
    }
  }

  const afterCount = countListRooms(next);
  const durationMs =
    typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;

  logHomeListOwner({
    source,
    kind: patch.kind,
    beforeCount,
    afterCount,
    incomingPatchRooms,
    appliedRooms,
    droppedStale,
    unreadGuardApplied,
    duplicateRemoved,
    durationMs,
  });

  return next === prev ? prev : next;
}

/** R2-M2 — React 홈 list 행 조회 (Zustand summary 대체) */
export function findHomeListRoomRow(
  data: CommunityMessengerBootstrap | null | undefined,
  roomId: string
): CommunityMessengerRoomSummary | null {
  if (!data) return null;
  const norm = normalizeMessengerRealtimeRoomId(roomId);
  if (!norm) return null;
  return (
    [...(data.chats ?? []), ...(data.groups ?? [])].find(
      (r) => normalizeMessengerRealtimeRoomId(r.id) === norm
    ) ?? null
  );
}

/** list patch + bootstrap cache prime (기존 call site 패턴). */
export function commitHomeListPatch(
  setData: import("react").Dispatch<import("react").SetStateAction<CommunityMessengerBootstrap | null>>,
  patch: HomeListPatch,
  source: HomeListPatchSource,
  options?: { primeCache?: boolean }
): void {
  setData((prev) => {
    const next = applyHomeListPatch(prev, patch, source);
    if (next && next !== prev && options?.primeCache !== false) {
      primeBootstrapCache(next);
    }
    return next;
  });
}
