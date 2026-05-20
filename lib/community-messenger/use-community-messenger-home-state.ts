"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bumpMessengerRenderPerf } from "@/lib/runtime/samarket-runtime-debug";
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
  /**
   * 거래/배달 전용 서브 라우트(`/community-messenger/trade-chats`, `/delivery-chats`)에서는
   * 채팅 리스트를 해당 pillar 의 방으로 강제 한정한다(칩 필터·검색은 그 위에서 동작).
   */
  pillar?: MessengerPillarMode;
};

/** 거래/배달 묶음 행이 가리키는 도메인. */
export type MessengerPillarMode = "trade" | "delivery" | null;

export type MessengerPillarSummary = {
  /** 미리보기·시간 표시에 사용할 가장 최근 방. 없으면 null. */
  lastItem: UnifiedRoomListItem | null;
  /** 해당 pillar 전체 미읽음 합. */
  unreadTotal: number;
  /** 해당 pillar 방 개수(헬퍼·디버그용). */
  count: number;
};

const EMPTY_PILLAR_SUMMARY: MessengerPillarSummary = { lastItem: null, unreadTotal: 0, count: 0 };

function summarizePillarItems(items: UnifiedRoomListItem[]): MessengerPillarSummary {
  if (items.length === 0) return EMPTY_PILLAR_SUMMARY;
  let lastItem: UnifiedRoomListItem | null = null;
  let lastTime = Number.NEGATIVE_INFINITY;
  let unreadTotal = 0;
  for (const item of items) {
    const ts = new Date(item.lastEventAt).getTime();
    if (Number.isFinite(ts) && ts > lastTime) {
      lastTime = ts;
      lastItem = item;
    }
    unreadTotal += Math.max(0, item.room.unreadCount);
  }
  if (!lastItem) {
    /** 시간 정합이 안 맞으면 첫 항목을 사용(이미 정렬 출력) */
    lastItem = items[0] ?? null;
  }
  return { lastItem, unreadTotal, count: items.length };
}

/** 거래 방만 — 서버가 enrich 후 `thumbnailUrl`이 채워지면 정렬 캐시 키도 바뀌어야 한다(아니면 예전 Room 객체가 고착). */
function messengerRoomTradeThumbKeyPart(room: CommunityMessengerRoomSummary): string {
  const m = room.contextMeta;
  if (m?.kind !== "trade") return "";
  const u = m.thumbnailUrl;
  return typeof u === "string" ? u : "";
}

/**
 * 거래 목록 행에 영향을 주는 `contextMeta` 요약.
 * `sortRoomsWithStableOutput` 캐시 키·`visibleChatListInputKey`·행 동결에 넣지 않으면
 * `productCategoryLabel`/`headline`만 바뀐 뒤에도 **옛 `CommunityMessengerRoomSummary` 참조**가 캐시 히트로 남는다.
 */
function messengerRoomTradeListMetaSig(room: CommunityMessengerRoomSummary): string {
  const m = room.contextMeta;
  if (m?.kind !== "trade") return "";
  return [
    m.headline ?? "",
    m.productCategoryLabel ?? "",
    m.categoryMenuLabel ?? "",
    m.priceLabel ?? "",
    m.itemStateLabel ?? "",
    m.postId ?? "",
    m.productChatId ?? "",
    m.sellerDisplayName ?? "",
  ].join("\x1f");
}

/** `sortRooms` 비교에 쓰이는 필드만 — 동일 내용이면 정렬·카운터 재실행 생략 */
function communityMessengerRoomsSortCacheKey(rooms: CommunityMessengerRoomSummary[]): string {
  if (rooms.length === 0) return "";
  return rooms
    .map(
      (r) =>
        `${r.id}\t${r.lastMessageAt}\t${r.isPinned ? 1 : 0}\t${r.unreadCount}\t${r.title}\t${r.philifeMeetingMemberLabel ?? ""}\t${messengerRoomTradeThumbKeyPart(r)}\t${messengerRoomTradeListMetaSig(r)}`
    )
    .join("\n");
}

const sortRoomsByInputKey = new Map<string, CommunityMessengerRoomSummary[]>();
const SORT_ROOMS_CACHE_MAX = 48;

function sortRoomsWithStableOutput(rooms: CommunityMessengerRoomSummary[]): CommunityMessengerRoomSummary[] {
  const key = communityMessengerRoomsSortCacheKey(rooms);
  const hit = sortRoomsByInputKey.get(key);
  if (hit) return hit;
  const sorted = sortRooms(rooms);
  if (sortRoomsByInputKey.size >= SORT_ROOMS_CACHE_MAX) sortRoomsByInputKey.clear();
  sortRoomsByInputKey.set(key, sorted);
  return sorted;
}

const visibleChatListByInputKey = new Map<string, UnifiedRoomListItem[]>();
const VISIBLE_CHAT_LIST_CACHE_MAX = 24;

function visibleChatListInputKey(
  items: UnifiedRoomListItem[],
  inbox: MessengerChatInboxFilter,
  kind: MessengerChatKindFilter,
  kw: string
): string {
  if (items.length === 0) return `0|${inbox}|${kind}|${kw}`;
  const k = kw.trim();
  /**
   * 검색어가 없을 때(칩만 전체→거래 등)는 필터·정합에 쓰는 필드 + 짧은 preview 시그만 넣는다.
   * 기존은 `i.preview` 전체를 키에 붙여 방·메시지가 많을수록 키 문자열·Map 조회 비용이 기하급수적으로 커졌다.
   */
  if (k) {
    const rowSig = items
      .map(
        (i) =>
          `${i.room.id}\t${i.room.unreadCount}\t${i.room.isPinned ? 1 : 0}\t${i.room.roomType}\t${messengerRoomTradeThumbKeyPart(i.room)}\t${messengerRoomTradeListMetaSig(i.room)}\t${i.preview}\t${i.room.title}\t${i.room.subtitle}\t${i.room.summary}\t${i.room.philifeMeetingMemberLabel ?? ""}`
      )
      .join("\n");
    return `${items.length}|${inbox}|${kind}|${k}|${rowSig}`;
  }
  const rowSigTight = items
    .map((i) => {
      const r = i.room;
      const p = i.preview;
      const previewTight = `${p.length}:${p.length > 96 ? `${p.slice(0, 96)}…` : p}`;
      return [
        r.id,
        r.lastMessageAt,
        r.unreadCount,
        r.isPinned ? 1 : 0,
        r.roomType,
        r.contextMeta?.kind ?? "",
        messengerRoomTradeThumbKeyPart(r),
        messengerRoomTradeListMetaSig(r),
        r.title,
        r.subtitle,
        r.summary,
        previewTight,
        r.philifeMeetingMemberLabel ?? "",
      ].join("\t");
    })
    .join("\n");
  return `${items.length}|${inbox}|${kind}||${rowSigTight}`;
}

export function useCommunityMessengerHomeState({
  data,
  mainSection,
  chatInboxFilter,
  chatKindFilter,
  roomSearchKeyword,
  openGroupSearch,
  pillar = null,
}: Params) {
  /** 렌더 중 Date.now() 금지(react-hooks/purity) — lazy init + 부트스트랩 갱신 시 시각 동기화 */
  const [friendSortEpochMs, setFriendSortEpochMs] = useState(() => Date.now());
  /** `data` 전체가 아닌 친구 배열만 바뀔 때만 정렬 시각 갱신 — 채팅/그룹만 갱신될 때 불필요한 `sortedFriends` 재정렬 방지 */
  useEffect(() => {
    setFriendSortEpochMs(Date.now());
  }, [data?.friends]);

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

  const sortedChats = useMemo(() => sortRoomsWithStableOutput(data?.chats ?? []), [data?.chats]);
  const sortedGroups = useMemo(() => sortRoomsWithStableOutput(data?.groups ?? []), [data?.groups]);

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
    bumpMessengerRenderPerf("messenger_room_list_sort");
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

  /**
   * 인박스(거래/배달 pillar 모드 아님)에서만 의미가 있는 묶음 행 요약값.
   * 추가 fetch 없이 `unifiedRooms` 에서 파생 — 거래 가볍게 invariant 유지.
   */
  const tradePillarSummary = useMemo<MessengerPillarSummary>(
    () => summarizePillarItems(baseChatListItems.filter((item) => communityMessengerRoomIsTrade(item.room))),
    [baseChatListItems]
  );

  const deliveryPillarSummary = useMemo<MessengerPillarSummary>(
    () => summarizePillarItems(baseChatListItems.filter((item) => communityMessengerRoomIsDelivery(item.room))),
    [baseChatListItems]
  );

  /**
   * visibleChatListItems 필터 입력 원본.
   * - 거래/배달 서브 라우트(`pillar`): 해당 도메인 방만.
   * - 메신저 인박스(`pillar == null`)이면서 **대화 유형이 「전체」**일 때:
   *   거래·배달 방은 상단 묶음 행(거래 채팅 / 배달 채팅)으로만 보이고,
   *   이 목록에는 **1:1·그룹(비거래·비배달)만** 둔다.
   * - `kind=거래`·`kind=배달`·`1:1`·`그룹` 등으로 좁혔을 때는 전체 base 를 쓴다(묶음 행은 UI 에서 숨김).
   */
  const pillarBaseChatListItems = useMemo(() => {
    if (pillar === "trade") {
      return baseChatListItems.filter((item) => communityMessengerRoomIsTrade(item.room));
    }
    if (pillar === "delivery") {
      return baseChatListItems.filter((item) => communityMessengerRoomIsDelivery(item.room));
    }
    if (chatKindFilter === "all") {
      return baseChatListItems.filter(
        (item) =>
          !communityMessengerRoomIsTrade(item.room) && !communityMessengerRoomIsDelivery(item.room)
      );
    }
    return baseChatListItems;
  }, [baseChatListItems, pillar, chatKindFilter]);

  const archiveListItems = useMemo(
    () => unifiedRooms.filter((item) => communityMessengerRoomIsInboxHidden(item.room)),
    [unifiedRooms]
  );

  const openChatJoinedItems = useMemo(() => {
    return unifiedRooms.filter((item) => item.room.roomType === "open_group" && !communityMessengerRoomIsInboxHidden(item.room));
  }, [unifiedRooms]);

  const visibleChatListItems = useMemo(() => {
    const keyword = roomSearchKeyword.trim().toLowerCase();
    const cacheKey = visibleChatListInputKey(pillarBaseChatListItems, chatInboxFilter, chatKindFilter, keyword);
    const cached = visibleChatListByInputKey.get(cacheKey);
    if (cached) return cached;
    bumpMessengerRenderPerf("messenger_room_list_filter");
    const out = pillarBaseChatListItems.filter((item) => {
      const room = item.room;
      if (chatInboxFilter === "unread" && room.unreadCount < 1) return false;
      if (chatInboxFilter === "pinned" && !room.isPinned) return false;
      if (chatKindFilter === "direct" && room.roomType !== "direct") return false;
      if (chatKindFilter === "private_group" && room.roomType !== "private_group") return false;
      if (chatKindFilter === "trade" && !communityMessengerRoomIsTrade(room)) return false;
      if (chatKindFilter === "delivery" && !communityMessengerRoomIsDelivery(room)) return false;
      if (!keyword) return true;
      const haystack = [room.title, room.subtitle, room.summary, item.preview, room.philifeMeetingMemberLabel ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
    if (visibleChatListByInputKey.size >= VISIBLE_CHAT_LIST_CACHE_MAX) visibleChatListByInputKey.clear();
    visibleChatListByInputKey.set(cacheKey, out);
    return out;
  }, [pillarBaseChatListItems, chatInboxFilter, chatKindFilter, roomSearchKeyword]);

  const searchSheetRoomItems = useMemo(() => {
    const keyword = roomSearchKeyword.trim().toLowerCase();
    if (!keyword) return [];
    return unifiedRooms
      .filter((item) => {
        const room = item.room;
        const haystack = [room.title, room.subtitle, room.summary, item.preview, room.philifeMeetingMemberLabel ?? ""]
          .join(" ")
          .toLowerCase();
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
    /** pillar 서브 라우트(거래/배달)에서 필터·칩 적용 전 해당 pillar 방 목록 — realtime 구독 합집합용 */
    pillarBaseChatListItems,
    archiveListItems,
    openChatJoinedItems,
    visibleChatListItems,
    searchSheetRoomItems,
    primaryListItems,
    friendStateModel,
    tradePillarSummary,
    deliveryPillarSummary,
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
    messengerRoomTradeThumbKeyPart(a.room) === messengerRoomTradeThumbKeyPart(b.room) &&
    messengerRoomTradeListMetaSig(a.room) === messengerRoomTradeListMetaSig(b.room) &&
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
  if (text.includes("주문") && (text.includes("접수") || text.includes("접수됨"))) return "주문접수";
  if (text.includes("거래") && text.includes("제안")) {
    const m = text.match(/[\d,.\s]+[₱₩$€원]/);
    return m ? `거래 제안 ${m[0].trim()}` : "거래 제안";
  }
  return "시스템 메시지";
}

function sortRooms(rooms: CommunityMessengerRoomSummary[]): CommunityMessengerRoomSummary[] {
  bumpMessengerRenderPerf("messenger_room_list_sort");
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
