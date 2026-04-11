"use client";

import { useMemo } from "react";
import type { MessengerChatInboxFilter, MessengerChatKindFilter, MessengerMainSection } from "@/lib/community-messenger/messenger-ia";
import { buildMessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";
import { communityMessengerRoomIsDelivery, communityMessengerRoomIsTrade } from "@/lib/community-messenger/messenger-room-domain";
import { communityMessengerRoomIsInboxHidden, type CommunityMessengerBootstrap, type CommunityMessengerCallLog, type CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

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
  const hiddenFriendIds = useMemo(() => new Set((data?.hidden ?? []).map((friend) => friend.id)), [data?.hidden]);

  const favoriteFriends = useMemo(
    () => (data?.friends ?? []).filter((friend) => friend.isFavoriteFriend && !hiddenFriendIds.has(friend.id)),
    [data?.friends, hiddenFriendIds]
  );

  const favoriteFriendIds = useMemo(() => new Set(favoriteFriends.map((friend) => friend.id)), [favoriteFriends]);

  const directRoomByPeerId = useMemo(() => {
    const map = new Map<string, CommunityMessengerRoomSummary>();
    for (const room of data?.chats ?? []) {
      if (room.roomType !== "direct" || !room.peerUserId) continue;
      const prev = map.get(room.peerUserId);
      if (!prev || new Date(room.lastMessageAt).getTime() >= new Date(prev.lastMessageAt).getTime()) {
        map.set(room.peerUserId, room);
      }
    }
    return map;
  }, [data?.chats]);

  const sortedFriends = useMemo(() => {
    const interactionTimeByFriendId = new Map<string, number>();
    for (const friend of data?.friends ?? []) {
      if (hiddenFriendIds.has(friend.id)) continue;
      const room = directRoomByPeerId.get(friend.id);
      const score = room ? new Date(room.lastMessageAt).getTime() : Number.NEGATIVE_INFINITY;
      interactionTimeByFriendId.set(friend.id, Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY);
    }
    return [...(data?.friends ?? [])]
      .filter((friend) => !hiddenFriendIds.has(friend.id))
      .sort((a, b) => {
      const scoreA = interactionTimeByFriendId.get(a.id) ?? Number.NEGATIVE_INFINITY;
      const scoreB = interactionTimeByFriendId.get(b.id) ?? Number.NEGATIVE_INFINITY;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.label.localeCompare(b.label, "ko");
      });
  }, [data?.friends, directRoomByPeerId, hiddenFriendIds]);

  const friendStateModel = useMemo(
    () => buildMessengerFriendStateModel(data, directRoomByPeerId),
    [data, directRoomByPeerId]
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
    return [...roomMap.values()].sort(sortUnifiedRoomListItems);
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

  const sectionNavBadges = useMemo((): Partial<Record<MessengerMainSection, number>> => {
    if (!data) return {};
    const chatsUnread = baseChatListItems.reduce((sum, item) => sum + Math.max(0, item.room.unreadCount), 0);
    const openHint = openChatJoinedItems.length + (data.discoverableGroups?.length ?? 0);
    return {
      friends: data.friends.length,
      chats: chatsUnread,
      open_chat: openHint,
      archive: archiveListItems.length,
    };
  }, [archiveListItems.length, baseChatListItems, data, openChatJoinedItems.length]);

  const totalUnreadCount = useMemo(
    () => baseChatListItems.reduce((sum, item) => sum + Math.max(0, item.room.unreadCount), 0),
    [baseChatListItems]
  );

  return {
    favoriteFriends,
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
    sectionNavBadges,
    totalUnreadCount,
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

export function getRoomTypeBadgeLabel(room: CommunityMessengerRoomSummary): string {
  if (room.roomType === "open_group") return "오픈";
  if (room.roomType === "private_group") return "그룹";
  if (room.contextMeta?.kind === "delivery") return "배달";
  if (room.contextMeta?.kind === "trade") return "거래";
  if (communityMessengerRoomIsDelivery(room)) return "배달";
  if (communityMessengerRoomIsTrade(room)) return "거래";
  return "친구";
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
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 1) return `${secs}초`;
  return `${mins}분 ${secs.toString().padStart(2, "0")}초`;
}
