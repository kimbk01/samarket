"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MessengerChatInboxFilter, MessengerChatKindFilter, MessengerMainSection } from "@/lib/community-messenger/messenger-ia";
import { buildMessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";
import {
  communityMessengerRoomIsDelivery,
  communityMessengerRoomIsTrade,
  messengerDirectThreadListCollapseKey,
} from "@/lib/community-messenger/messenger-room-domain";
import { formatCommunityMessengerCallDurationLabel } from "@/lib/community-messenger/call-duration-label";
import {
  communityMessengerRoomIsInboxHidden,
  type CommunityMessengerBootstrap,
  type CommunityMessengerCallLog,
  type CommunityMessengerProfileLite,
  type CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

export type { MessengerFriendState, MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";

export type UnifiedRoomListItem = {
  room: CommunityMessengerRoomSummary;
  preview: string;
  previewKind: "message" | "call";
  callStatus: CommunityMessengerCallLog["status"] | null;
  callKind: CommunityMessengerCallLog["callKind"] | null;
  lastEventAt: string;
};

type Params = {
  data: CommunityMessengerBootstrap | null;
  mainSection: MessengerMainSection;
  chatInboxFilter: MessengerChatInboxFilter;
  chatKindFilter: MessengerChatKindFilter;
  roomSearchKeyword: string;
  openGroupSearch: string;
};

export function useCommunityMessengerHomeState({
  data,
  mainSection,
  chatInboxFilter,
  chatKindFilter,
  roomSearchKeyword,
  openGroupSearch,
}: Params) {
  /** 렌더 중 Date.now() 금지(react-hooks/purity) — lazy init + 부트스트랩 갱신 시 시각 동기화 */
  const [friendSortEpochMs, setFriendSortEpochMs] = useState(() => Date.now());
  useEffect(() => {
    setFriendSortEpochMs(Date.now());
  }, [data]);

  const hiddenFriendIds = useMemo(() => new Set((data?.hidden ?? []).map((friend) => friend.id)), [data?.hidden]);

  const favoriteFriendIds = useMemo(
    () =>
      new Set(
        (data?.friends ?? [])
          .filter((friend) => friend.isFavoriteFriend && !hiddenFriendIds.has(friend.id))
          .map((friend) => friend.id)
      ),
    [data?.friends, hiddenFriendIds]
  );

  const directRoomMapStableRef = useRef<Map<string, CommunityMessengerRoomSummary>>(new Map());

  const directRoomByPeerId = useMemo(() => {
    const map = new Map<string, CommunityMessengerRoomSummary>();
    for (const room of data?.chats ?? []) {
      if (room.roomType !== "direct" || !room.peerUserId) continue;
      const prev = map.get(room.peerUserId);
      if (!prev || new Date(room.lastMessageAt).getTime() >= new Date(prev.lastMessageAt).getTime()) {
        map.set(room.peerUserId, room);
      }
    }
    const prevStable = directRoomMapStableRef.current;
    if (directRoomMapsEqual(prevStable, map)) {
      return prevStable;
    }
    directRoomMapStableRef.current = map;
    return map;
  }, [data?.chats]);

  /** 카카오톡 친구 탭과 유사: 최근 맺은 친구(기본 7일)는 상단·최근 수락 순, 이후 이름순 */
  const sortedFriends = useMemo(() => {
    const NEW_FRIEND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    const now = friendSortEpochMs;
    const isNewFriend = (friend: CommunityMessengerProfileLite) => {
      const raw = friend.friendshipAcceptedAt;
      if (!raw) return false;
      const t = new Date(raw).getTime();
      if (!Number.isFinite(t)) return false;
      return now - t <= NEW_FRIEND_WINDOW_MS;
    };
    return [...(data?.friends ?? [])]
      .filter((friend) => !hiddenFriendIds.has(friend.id))
      .sort((a, b) => {
        const newA = isNewFriend(a) ? 1 : 0;
        const newB = isNewFriend(b) ? 1 : 0;
        if (newA !== newB) return newB - newA;
        if (newA && newB) {
          const ta = new Date(a.friendshipAcceptedAt ?? 0).getTime();
          const tb = new Date(b.friendshipAcceptedAt ?? 0).getTime();
          if (ta !== tb) return tb - ta;
        }
        return a.label.localeCompare(b.label, "ko");
      });
  }, [data?.friends, friendSortEpochMs, hiddenFriendIds]);

  const friendStateModel = useMemo(
    () => buildMessengerFriendStateModel(data, directRoomByPeerId),
    [
      data?.friends,
      data?.hidden,
      data?.blocked,
      data?.requests,
      data?.following,
      directRoomByPeerId,
    ]
  );

  const sortedChats = useMemo(() => sortRooms(data?.chats ?? []), [data?.chats]);
  const sortedGroups = useMemo(() => sortRooms(data?.groups ?? []), [data?.groups]);

  const filteredDiscoverableGroups = useMemo(() => {
    const keyword = openGroupSearch.trim().toLowerCase();
    return [...(data?.discoverableGroups ?? [])]
      .filter((group) => {
        if (!keyword) return true;
        const haystack = [group.title, group.summary, group.ownerLabel].join(" ").toLowerCase();
        return haystack.includes(keyword);
      })
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [data?.discoverableGroups, openGroupSearch]);

  const sortedCalls = useMemo(
    () => mergeCallsByConversation(sortCallsByTime(data?.calls ?? [])),
    [data?.calls]
  );

  const unifiedRoomsRowCacheRef = useRef<Map<string, UnifiedRoomListItem>>(new Map());
  const unifiedRoomsStableListRef = useRef<UnifiedRoomListItem[] | null>(null);

  const unifiedRooms = useMemo<UnifiedRoomListItem[]>(() => {
    const roomMap = new Map<string, UnifiedRoomListItem>();
    for (const room of [...sortedChats, ...sortedGroups]) {
      roomMap.set(room.id, {
        room,
        preview: getRoomPreviewText(room),
        previewKind: "message",
        callStatus: null,
        callKind: null,
        lastEventAt: room.lastMessageAt,
      });
    }
    for (const call of sortedCalls) {
      if (!call.roomId) continue;
      const existing = roomMap.get(call.roomId);
      if (!existing) continue;
      const callAt = new Date(call.startedAt).getTime();
      const roomAt = new Date(existing.lastEventAt).getTime();
      if (Number.isFinite(callAt) && (!Number.isFinite(roomAt) || callAt >= roomAt)) {
        roomMap.set(call.roomId, {
          room: existing.room,
          preview: formatCallPreview(call),
          previewKind: "call",
          callStatus: call.status,
          callKind: call.callKind,
          lastEventAt: call.startedAt,
        });
      }
    }
    const merged = collapseDirectPeerRooms([...roomMap.values()]);
    const sortedNext = merged.sort(sortUnifiedRoomListItems);

    const rowCache = unifiedRoomsRowCacheRef.current;
    const reconciled: UnifiedRoomListItem[] = [];
    for (const item of sortedNext) {
      const id = item.room.id;
      const prevRow = rowCache.get(id);
      if (prevRow && unifiedListItemRowVisualEqual(prevRow, item)) {
        reconciled.push(prevRow);
      } else {
        rowCache.set(id, item);
        reconciled.push(item);
      }
    }
    const nextIds = new Set(reconciled.map((r) => r.room.id));
    for (const rid of rowCache.keys()) {
      if (!nextIds.has(rid)) rowCache.delete(rid);
    }

    const prevList = unifiedRoomsStableListRef.current;
    if (
      prevList &&
      prevList.length === reconciled.length &&
      prevList.every((row, i) => row === reconciled[i])
    ) {
      return prevList;
    }
    unifiedRoomsStableListRef.current = reconciled;
    return reconciled;
  }, [sortedChats, sortedGroups, sortedCalls]);

  const baseChatListItems = useMemo(() => {
    return unifiedRooms.filter((item) => item.room.roomType !== "open_group" && !communityMessengerRoomIsInboxHidden(item.room));
  }, [unifiedRooms]);

  const archiveListItems = useMemo(
    () => unifiedRooms.filter((item) => communityMessengerRoomIsInboxHidden(item.room)),
    [unifiedRooms]
  );

  const openChatJoinedItems = useMemo(() => {
    return unifiedRooms.filter((item) => item.room.roomType === "open_group" && !communityMessengerRoomIsInboxHidden(item.room));
  }, [unifiedRooms]);

  const visibleChatListItems = useMemo(() => {
    const keyword = roomSearchKeyword.trim().toLowerCase();
    return baseChatListItems.filter((item) => {
      const room = item.room;
      if (chatInboxFilter === "unread" && room.unreadCount < 1) return false;
      if (chatInboxFilter === "pinned" && !room.isPinned) return false;
      if (chatKindFilter === "direct" && room.roomType !== "direct") return false;
      if (chatKindFilter === "private_group" && room.roomType !== "private_group") return false;
      if (chatKindFilter === "trade" && !communityMessengerRoomIsTrade(room)) return false;
      if (chatKindFilter === "delivery" && !communityMessengerRoomIsDelivery(room)) return false;
      if (!keyword) return true;
      const haystack = [room.title, room.subtitle, room.summary, item.preview].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [baseChatListItems, chatInboxFilter, chatKindFilter, roomSearchKeyword]);

  const searchSheetRoomItems = useMemo(() => {
    const keyword = roomSearchKeyword.trim().toLowerCase();
    if (!keyword) return [];
    return unifiedRooms
      .filter((item) => {
        const room = item.room;
        const haystack = [room.title, room.subtitle, room.summary, item.preview].join(" ").toLowerCase();
        return haystack.includes(keyword);
      })
      .slice(0, 24);
  }, [roomSearchKeyword, unifiedRooms]);

  const primaryListItems = useMemo(() => {
    if (mainSection === "chats") return visibleChatListItems;
    if (mainSection === "archive") return archiveListItems;
    if (mainSection === "open_chat") return openChatJoinedItems;
    return [];
  }, [archiveListItems, mainSection, openChatJoinedItems, visibleChatListItems]);

  return {
    favoriteFriendIds,
    sortedFriends,
    sortedCalls,
    filteredDiscoverableGroups,
    unifiedRooms,
    baseChatListItems,
    archiveListItems,
    openChatJoinedItems,
    visibleChatListItems,
    searchSheetRoomItems,
    primaryListItems,
    friendStateModel,
  };
}

export function formatCallPreview(call: CommunityMessengerCallLog): string {
  const kindLabel = call.callKind === "video" ? "영상 통화" : "음성 통화";
  if (call.status === "missed") return "부재중 통화";
  if (call.status === "cancelled") return `${kindLabel} · 취소됨`;
  if (call.status === "rejected") return `${kindLabel} · 거절됨`;
  if (call.durationSeconds > 0) return `${kindLabel} · ${formatDurationLabel(call.durationSeconds)}`;
  return `${kindLabel} 종료`;
}

export function formatConversationTimestamp(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const date = new Date(time);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameMonth = sameYear && date.getMonth() === now.getMonth();
  const sameDate = sameMonth && date.getDate() === now.getDate();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (sameDate) return `${hh}:${mm}`;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (sameYear) return `${month}/${day} ${hh}:${mm}`;
  return `${date.getFullYear()}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")} ${hh}:${mm}`;
}

function unifiedListItemRowVisualEqual(a: UnifiedRoomListItem, b: UnifiedRoomListItem): boolean {
  return (
    a.room === b.room &&
    a.preview === b.preview &&
    a.previewKind === b.previewKind &&
    a.callStatus === b.callStatus &&
    a.callKind === b.callKind &&
    a.lastEventAt === b.lastEventAt
  );
}

function directRoomMapsEqual(
  a: Map<string, CommunityMessengerRoomSummary>,
  b: Map<string, CommunityMessengerRoomSummary>
): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of b) {
    if (a.get(k) !== v) return false;
  }
  return true;
}

export function getRoomTypeBadgeLabel(room: CommunityMessengerRoomSummary): string {
  if (room.roomType === "open_group") return "오픈";
  if (room.roomType === "private_group") return "그룹";
  if (room.contextMeta?.kind === "delivery") return "배달";
  if (room.contextMeta?.kind === "trade") return "거래";
  if (communityMessengerRoomIsDelivery(room)) return "배달";
  if (communityMessengerRoomIsTrade(room)) return "거래";
  return "1:1";
}

function getRoomPreviewText(room: CommunityMessengerRoomSummary): string {
  const lastMessage = room.lastMessage?.trim();
  const lastMessageType = room.lastMessageType ?? "text";
  if (lastMessageType === "image") return "사진";
  if (lastMessageType === "voice") return "음성 메시지";
  if (lastMessageType === "file") {
    if (!lastMessage) return "파일";
    return lastMessage === "파일" ? lastMessage : `파일 · ${lastMessage}`;
  }
  if (lastMessageType === "system") {
    return formatSystemPreview(lastMessage);
  }
  if (lastMessageType === "call_stub") {
    if (!lastMessage) return "통화";
    return lastMessage.includes("통화") ? lastMessage : `통화 · ${lastMessage}`;
  }
  if (lastMessage) return lastMessage;
  const meta = room.contextMeta;
  if (meta?.headline) return meta.headline;
  const summary = room.summary?.trim();
  if (summary) {
    if (meta) return "메시지를 확인해 주세요.";
    if (summary[0] === "{") return "거래·주문 안내";
    return summary;
  }
  return "최근 메시지가 아직 없습니다.";
}

function formatSystemPreview(value: string): string {
  const text = value.trim();
  if (!text) return "시스템 메시지";
  if (text.startsWith("공지 수정")) return "공지 변경";
  if (text.startsWith("공지 변경")) return "공지 변경";
  if (text === "공지 삭제" || text === "공지가 삭제되었습니다.") return "공지 삭제";
  if (text.startsWith("운영 권한 변경") || text === "그룹 권한이 변경되었습니다.") return "권한 변경";
  if (text.startsWith("관리자 지정")) return text;
  if (text.startsWith("관리자 해제")) return text;
  if (text.startsWith("방장 위임")) return text;
  if (text.startsWith("멤버 초대")) return text;
  if (text.startsWith("멤버 내보내기")) return text;
  if (text.includes("주문") && (text.includes("접수") || text.includes("접수됨"))) return "주문 접수됨";
  if (text.includes("거래") && text.includes("제안")) {
    const m = text.match(/[\d,.\s]+[₱₩$€원]/);
    return m ? `거래 제안 ${m[0].trim()}` : "거래 제안";
  }
  return "시스템 메시지";
}

function sortRooms(rooms: CommunityMessengerRoomSummary[]): CommunityMessengerRoomSummary[] {
  return [...rooms].sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
    const timeA = new Date(a.lastMessageAt).getTime();
    const timeB = new Date(b.lastMessageAt).getTime();
    if (timeA !== timeB) return timeB - timeA;
    if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
    return a.title.localeCompare(b.title, "ko");
  });
}

/**
 * 동일 peer 의 1:1 방이 여러 개(거래·배달 등)여도 목록에서는 한 줄로 본다.
 * 최근 이벤트가 있는 방을 대표로 쓰고, 읽지 않은 수·핀·뮤트는 OR/합산에 가깝게 반영.
 */
function collapseDirectPeerRooms(items: UnifiedRoomListItem[]): UnifiedRoomListItem[] {
  const groups = new Map<string, UnifiedRoomListItem[]>();
  for (const item of items) {
    const gkey = messengerDirectThreadListCollapseKey(item.room);
    const list = groups.get(gkey) ?? [];
    list.push(item);
    groups.set(gkey, list);
  }
  const out: UnifiedRoomListItem[] = [];
  for (const [, group] of groups) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const sorted = [...group].sort(
      (a, b) => new Date(b.lastEventAt).getTime() - new Date(a.lastEventAt).getTime()
    );
    const best = sorted[0];
    const totalUnread = group.reduce((sum, g) => sum + Math.max(0, g.room.unreadCount), 0);
    out.push({
      ...best,
      room: {
        ...best.room,
        unreadCount: totalUnread,
        isPinned: group.some((g) => g.room.isPinned),
        isMuted: group.some((g) => g.room.isMuted),
      },
    });
  }
  return out;
}

function sortUnifiedRoomListItems(a: UnifiedRoomListItem, b: UnifiedRoomListItem): number {
  if (Boolean(a.room.isPinned) !== Boolean(b.room.isPinned)) return a.room.isPinned ? -1 : 1;
  const timeA = new Date(a.lastEventAt).getTime();
  const timeB = new Date(b.lastEventAt).getTime();
  if (timeA !== timeB) return timeB - timeA;
  if (a.room.unreadCount !== b.room.unreadCount) return b.room.unreadCount - a.room.unreadCount;
  return a.room.title.localeCompare(b.room.title, "ko");
}

function sortCallsByTime(calls: CommunityMessengerCallLog[]): CommunityMessengerCallLog[] {
  return [...calls].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

function mergeCallsByConversation(sortedNewestFirst: CommunityMessengerCallLog[]): CommunityMessengerCallLog[] {
  const seen = new Set<string>();
  const out: CommunityMessengerCallLog[] = [];
  for (const call of sortedNewestFirst) {
    const roomKey = call.roomId && String(call.roomId).trim() ? `room:${call.roomId}` : null;
    const key = roomKey ?? (call.peerUserId ? `peer:${call.peerUserId}` : `label:${call.title}\0${call.peerLabel}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(call);
    if (out.length >= 40) break;
  }
  return out;
}

function formatDurationLabel(seconds: number): string {
  return formatCommunityMessengerCallDurationLabel(seconds);
}
