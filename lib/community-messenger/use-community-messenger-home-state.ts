"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bumpMessengerRenderPerf } from "@/lib/runtime/samarket-runtime-debug";
import type { MessengerChatInboxFilter, MessengerChatKindFilter, MessengerMainSection } from "@/lib/community-messenger/messenger-ia";
import {
  buildMessengerFriendStateModel,
  type MessengerFriendState,
  type MessengerFriendStateModel,
} from "@/lib/community-messenger/messenger-friend-model";
import {
  buildGeneralDirectRoomByPeerMap,
  communityMessengerRoomIsConfirmedDelivery,
  communityMessengerRoomIsConfirmedTrade,
  messengerDirectThreadListCollapseKey,
} from "@/lib/community-messenger/messenger-room-domain";
import { matchesGroupChatListKindFilter } from "@/lib/community-messenger/group/group-room-notification-policy";
import { philifeMeetingMemberRoleLabel } from "@/lib/community-messenger/cm-ui-translate";
import {
  getRoomPreviewText,
  getRoomTypeBadgeLabel,
} from "@/lib/community-messenger/cm-home-list-copy";
import {
  profileArraysReferenceEqual,
  roomSummaryListRowShallowEqual,
} from "@/lib/community-messenger/home/merge-bootstrap-lists-preserve-refs";
import {
  communityMessengerRoomIsInboxHidden,
  communityMessengerRoomIsVisibleInMainChatInbox,
  type CommunityMessengerBootstrap,
  type CommunityMessengerCallLog,
  type CommunityMessengerProfileLite,
  type CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import { dedupeTradeMessengerRoomSummaries } from "@/lib/community-messenger/trade-list-canonical-key";
import { dedupeDeliveryMessengerRoomSummaries } from "@/lib/community-messenger/dedupe-delivery-messenger-room-summaries";
import { pickVisibleDedupedCommerceRoomIds, shouldShowCommerceChatInList } from "@/lib/community-messenger/chat-room-list-lifecycle-policy";
import {
  compareMessengerFriendsForHomeList,
  partitionMessengerFriendsByNew,
} from "@/lib/community-messenger/messenger-new-friend-window";
import {
  compareUnifiedChatListItems,
  sortChatListRooms,
} from "@/lib/community-messenger/chat-list/chat-list-sorter";
import { mergeCallHistoryForHomeList } from "@/lib/community-messenger/call-history/call-history-merge";
import { sortCallHistoryEntries } from "@/lib/community-messenger/call-history/call-history-sorter";

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
   * 거래/배달/일반 전용 서브 라우트에서는 채팅 리스트를 해당 scope 의 방으로 강제 한정한다
   * (칩 필터·검색은 그 위에서 동작).
   */
  pillar?: MessengerPillarMode;
};

/** 채팅 전용 목록이 가리키는 도메인 scope. */
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

/** memo·RoomList propsEqual — 동일 행 참조면 true */
export function roomListItemsRowRefsEqual(a: UnifiedRoomListItem[], b: UnifiedRoomListItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function messengerStringSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of b) {
    if (!a.has(id)) return false;
  }
  return true;
}

function stabilizeStringSet(next: Set<string>, stableRef: { current: Set<string> }): Set<string> {
  const prev = stableRef.current;
  if (messengerStringSetsEqual(prev, next)) return prev;
  stableRef.current = next;
  return next;
}

function stabilizeRoomListItems(
  next: UnifiedRoomListItem[],
  stableRef: { current: UnifiedRoomListItem[] }
): UnifiedRoomListItem[] {
  const prev = stableRef.current;
  if (roomListItemsRowRefsEqual(prev, next)) return prev;
  if (roomListItemsDisplayEqual(prev, next)) return prev;
  stableRef.current = next;
  return next;
}

function messengerPillarSummaryLastItemDisplayEqual(
  a: UnifiedRoomListItem | null,
  b: UnifiedRoomListItem | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return unifiedListItemRowDisplayEqual(a, b);
}

function messengerPillarSummariesEqual(a: MessengerPillarSummary, b: MessengerPillarSummary): boolean {
  return (
    a.unreadTotal === b.unreadTotal &&
    a.count === b.count &&
    messengerPillarSummaryLastItemDisplayEqual(a.lastItem, b.lastItem)
  );
}

function messengerFriendStateEntriesEqual(a: MessengerFriendState[], b: MessengerFriendState[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].profile !== b[i].profile) return false;
    const sa = a[i].states;
    const sb = b[i].states;
    if (sa.length !== sb.length) return false;
    for (let j = 0; j < sa.length; j++) {
      if (sa[j] !== sb[j]) return false;
    }
  }
  return true;
}

function messengerFriendStateModelsEqual(a: MessengerFriendStateModel, b: MessengerFriendStateModel): boolean {
  return (
    messengerFriendStateEntriesEqual(a.favorites, b.favorites) &&
    messengerFriendStateEntriesEqual(a.friends, b.friends) &&
    messengerFriendStateEntriesEqual(a.hidden, b.hidden) &&
    messengerFriendStateEntriesEqual(a.blocked, b.blocked) &&
    messengerFriendStateEntriesEqual(a.suggested, b.suggested) &&
    messengerFriendStateEntriesEqual(a.muted, b.muted)
  );
}

function stabilizeFriendStateModel(
  next: MessengerFriendStateModel,
  stableRef: { current: MessengerFriendStateModel }
): MessengerFriendStateModel {
  const prev = stableRef.current;
  if (messengerFriendStateModelsEqual(prev, next)) return prev;
  stableRef.current = next;
  return next;
}

function stabilizePillarSummary(
  next: MessengerPillarSummary,
  stableRef: { current: MessengerPillarSummary }
): MessengerPillarSummary {
  const prev = stableRef.current;
  if (messengerPillarSummariesEqual(prev, next)) return prev;
  stableRef.current = next;
  return next;
}

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
        `${r.id}\t${r.lastMessageAt}\t${r.lastMessage ?? ""}\t${r.lastMessageType ?? ""}\t${r.isPinned ? 1 : 0}\t${r.unreadCount}\t${r.title}\t${r.philifeMeetingMemberLabel ?? ""}\t${messengerRoomTradeThumbKeyPart(r)}\t${messengerRoomTradeListMetaSig(r)}`
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

  /** 신규 친구 24시간 구간 — 친구 탭 체류 중에도 epoch 갱신으로 섹션 이동 */
  useEffect(() => {
    if (mainSection !== "friends") return;
    setFriendSortEpochMs(Date.now());
    const id = window.setInterval(() => setFriendSortEpochMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [mainSection]);

  const hiddenFriendIdsStableRef = useRef<Set<string>>(new Set());
  const hiddenFriendIds = useMemo(() => {
    const next = new Set((data?.hidden ?? []).map((friend) => friend.id));
    return stabilizeStringSet(next, hiddenFriendIdsStableRef);
  }, [data?.hidden]);

  const favoriteFriendIdsStableRef = useRef<Set<string>>(new Set());
  const favoriteFriendIds = useMemo(() => {
    const next = new Set(
      (data?.friends ?? [])
        .filter((friend) => friend.isFavoriteFriend && !hiddenFriendIds.has(friend.id))
        .map((friend) => friend.id)
    );
    return stabilizeStringSet(next, favoriteFriendIdsStableRef);
  }, [data?.friends, hiddenFriendIds]);

  const directRoomMapStableRef = useRef<Map<string, CommunityMessengerRoomSummary>>(new Map());

  const directRoomByPeerId = useMemo(() => {
    const map = buildGeneralDirectRoomByPeerMap(data?.chats ?? []);
    const prevStable = directRoomMapStableRef.current;
    if (directRoomMapsEqual(prevStable, map)) {
      return prevStable;
    }
    directRoomMapStableRef.current = map;
    return map;
  }, [data?.chats]);

  /** 최근 맺은 친구(기본 24시간)는 상단·최근 수락 순, 이후 이름순 */
  const sortedFriends = useMemo(() => {
    const now = friendSortEpochMs;
    return [...(data?.friends ?? [])]
      .filter((friend) => !hiddenFriendIds.has(friend.id))
      .sort((a, b) => compareMessengerFriendsForHomeList(a, b, now));
  }, [data?.friends, friendSortEpochMs, hiddenFriendIds]);

  const { newFriends, regularFriends } = useMemo(
    () => partitionMessengerFriendsByNew(sortedFriends, friendSortEpochMs),
    [sortedFriends, friendSortEpochMs]
  );

  const friendStateModelStableRef = useRef<MessengerFriendStateModel>(
    buildMessengerFriendStateModel(null, new Map())
  );
  const friendStateModel = useMemo(() => {
    const next = buildMessengerFriendStateModel(data, directRoomByPeerId);
    return stabilizeFriendStateModel(next, friendStateModelStableRef);
  }, [
    data?.friends,
    data?.hidden,
    data?.blocked,
    data?.requests,
    data?.following,
    directRoomByPeerId,
  ]);

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
        previewKind: room.lastMessageType === "call_stub" ? "call" : "message",
        callStatus: null,
        callKind: null,
        lastEventAt: room.lastMessageAt,
      });
    }
    const merged = collapseDirectPeerRooms([...roomMap.values()]);
    const sortedNext = merged.sort(sortUnifiedRoomListItems);

    const rowCache = unifiedRoomsRowCacheRef.current;
    const reconciled: UnifiedRoomListItem[] = [];
    for (const item of sortedNext) {
      const id = item.room.id;
      const prevRow = rowCache.get(id);
      if (prevRow && unifiedListItemRowDisplayEqual(prevRow, item)) {
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
      (prevList.every((row, i) => row === reconciled[i]) ||
        roomListItemsDisplayEqual(prevList, reconciled))
    ) {
      return prevList;
    }
    bumpMessengerRenderPerf("messenger_room_list_sort");
    unifiedRoomsStableListRef.current = reconciled;
    return reconciled;
  }, [sortedChats, sortedGroups]);

  const baseChatListItemsStableRef = useRef<UnifiedRoomListItem[]>([]);
  const baseChatListItems = useMemo(() => {
    const next = unifiedRooms.filter(
      (item) =>
        item.room.roomType !== "open_group" &&
        item.room.roomType !== "private_group" &&
        communityMessengerRoomIsVisibleInMainChatInbox(item.room)
    );
    return stabilizeRoomListItems(next, baseChatListItemsStableRef);
  }, [unifiedRooms]);

  /**
   * 인박스(거래/배달 pillar 모드 아님)에서만 의미가 있는 묶음 행 요약값.
   * 추가 fetch 없이 `unifiedRooms` 에서 파생 — 거래 가볍게 invariant 유지.
   */
  const tradePillarSummaryStableRef = useRef<MessengerPillarSummary>(EMPTY_PILLAR_SUMMARY);
  const tradePillarSummary = useMemo<MessengerPillarSummary>(() => {
    const next = summarizePillarItems(
      baseChatListItems.filter(
        (item) =>
          communityMessengerRoomIsConfirmedTrade(item.room) &&
          shouldShowCommerceChatInList(item.room)
      )
    );
    return stabilizePillarSummary(next, tradePillarSummaryStableRef);
  }, [baseChatListItems]);

  const deliveryPillarSummaryStableRef = useRef<MessengerPillarSummary>(EMPTY_PILLAR_SUMMARY);
  const deliveryPillarSummary = useMemo<MessengerPillarSummary>(() => {
    const next = summarizePillarItems(
      baseChatListItems.filter(
        (item) =>
          communityMessengerRoomIsConfirmedDelivery(item.room) &&
          shouldShowCommerceChatInList(item.room)
      )
    );
    return stabilizePillarSummary(next, deliveryPillarSummaryStableRef);
  }, [baseChatListItems]);

  /**
   * visibleChatListItems 필터 입력 원본.
   * - 거래/배달 서브 라우트(`pillar`): 해당 도메인 방만.
   * - 메신저 홈 인박스(`pillar == null`) + 전체 칩: 거래·배달은 상단 그룹 행으로만 보이고,
   *   스크롤 목록에는 1:1(일반) + private_group 을 `unifiedRooms` 정렬 그대로 둔다.
   * - `kind=거래`·`kind=배달`·`1:1`·`그룹` 등으로 좁혔을 때는 kind 에 맞는 방만(묶음 행은 UI 에서 숨김).
   */
  const pillarBaseChatListItemsStableRef = useRef<UnifiedRoomListItem[]>([]);
  const pillarBaseChatListItems = useMemo(() => {
    let next: UnifiedRoomListItem[];
    if (pillar === "trade") {
      const tradeItems = baseChatListItems.filter((item) => communityMessengerRoomIsConfirmedTrade(item.room));
      const keepIds = pickVisibleDedupedCommerceRoomIds(
        tradeItems.map((item) => item.room),
        dedupeTradeMessengerRoomSummaries
      );
      next = tradeItems.filter((item) => keepIds.has(item.room.id));
    } else if (pillar === "delivery") {
      const deliveryItems = baseChatListItems.filter((item) =>
        communityMessengerRoomIsConfirmedDelivery(item.room)
      );
      const keepIds = pickVisibleDedupedCommerceRoomIds(
        deliveryItems.map((item) => item.room),
        dedupeDeliveryMessengerRoomSummaries
      );
      next = deliveryItems.filter((item) => keepIds.has(item.room.id));
    } else {
      next = unifiedRooms.filter((item) => {
        if (!communityMessengerRoomIsVisibleInMainChatInbox(item.room)) return false;
        if (item.room.roomType === "open_group") return false;
        if (chatKindFilter === "all") {
          return matchesGroupChatListKindFilter(item.room, "all");
        }
        if (item.room.roomType === "private_group") {
          return chatKindFilter === "private_group";
        }
        if (chatKindFilter === "direct") return item.room.roomType === "direct";
        if (chatKindFilter === "trade") return communityMessengerRoomIsConfirmedTrade(item.room) && shouldShowCommerceChatInList(item.room);
        if (chatKindFilter === "delivery") return communityMessengerRoomIsConfirmedDelivery(item.room) && shouldShowCommerceChatInList(item.room);
        return false;
      });
    }
    return stabilizeRoomListItems(next, pillarBaseChatListItemsStableRef);
  }, [baseChatListItems, unifiedRooms, pillar, chatKindFilter]);

  const archiveListItemsStableRef = useRef<UnifiedRoomListItem[]>([]);
  const archiveListItems = useMemo(() => {
    const next = unifiedRooms.filter((item) => communityMessengerRoomIsInboxHidden(item.room));
    return stabilizeRoomListItems(next, archiveListItemsStableRef);
  }, [unifiedRooms]);

  const openChatJoinedItemsStableRef = useRef<UnifiedRoomListItem[]>([]);
  const openChatJoinedItems = useMemo(() => {
    const next = unifiedRooms.filter(
      (item) =>
        item.room.roomType === "open_group" && !communityMessengerRoomIsInboxHidden(item.room)
    );
    return stabilizeRoomListItems(next, openChatJoinedItemsStableRef);
  }, [unifiedRooms]);

  const visibleChatListItemsStableRef = useRef<UnifiedRoomListItem[]>([]);
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
      if (chatKindFilter === "trade" && !communityMessengerRoomIsConfirmedTrade(room)) return false;
      if (chatKindFilter === "trade" && !shouldShowCommerceChatInList(room)) return false;
      if (chatKindFilter === "delivery" && !communityMessengerRoomIsConfirmedDelivery(room)) return false;
      if (chatKindFilter === "delivery" && !shouldShowCommerceChatInList(room)) return false;
      if (!keyword) return true;
      const meetingRoleHaystack = room.philifeMeetingMemberLabel
        ? philifeMeetingMemberRoleLabel(room.philifeMeetingMemberLabel)
        : "";
      const haystack = [room.title, room.subtitle, room.summary, item.preview, meetingRoleHaystack]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
    const stabilized = stabilizeRoomListItems(out, visibleChatListItemsStableRef);
    if (visibleChatListByInputKey.size >= VISIBLE_CHAT_LIST_CACHE_MAX) visibleChatListByInputKey.clear();
    visibleChatListByInputKey.set(cacheKey, stabilized);
    return stabilized;
  }, [pillarBaseChatListItems, chatInboxFilter, chatKindFilter, roomSearchKeyword]);

  const searchSheetRoomItems = useMemo(() => {
    const keyword = roomSearchKeyword.trim().toLowerCase();
    if (!keyword) return [];
    return unifiedRooms
      .filter((item) => {
        const room = item.room;
        const meetingRoleHaystack = room.philifeMeetingMemberLabel
          ? philifeMeetingMemberRoleLabel(room.philifeMeetingMemberLabel)
          : "";
        const haystack = [room.title, room.subtitle, room.summary, item.preview, meetingRoleHaystack]
          .join(" ")
          .toLowerCase();
        return haystack.includes(keyword);
      })
      .slice(0, 24);
  }, [roomSearchKeyword, unifiedRooms]);

  const primaryListItemsStableRef = useRef<UnifiedRoomListItem[]>([]);
  const primaryListItems = useMemo(() => {
    let next: UnifiedRoomListItem[];
    if (mainSection === "chats") next = visibleChatListItems;
    else if (mainSection === "archive") next = archiveListItems;
    else if (mainSection === "open_chat") next = openChatJoinedItems;
    else next = [];
    return stabilizeRoomListItems(next, primaryListItemsStableRef);
  }, [archiveListItems, mainSection, openChatJoinedItems, visibleChatListItems]);

  return {
    favoriteFriendIds,
    sortedFriends,
    friendSortEpochMs,
    newFriends,
    regularFriends,
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

export { formatCallPreview, getRoomTypeBadgeLabel } from "@/lib/community-messenger/cm-home-list-copy";

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

/** 목록 행 표시에 영향 — `room` object 참조 없이 roomId·필드 동일성만 비교 */
/** memo·RoomList propsEqual — 행 id·표시 필드 동일이면 true (배열·room 참조 무관) */
export function roomListItemsDisplayEqual(a: UnifiedRoomListItem[], b: UnifiedRoomListItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!unifiedListItemRowDisplayEqual(a[i], b[i])) return false;
  }
  return true;
}

export function unifiedListItemRowDisplayEqual(a: UnifiedRoomListItem, b: UnifiedRoomListItem): boolean {
  if (a === b) return true;
  if (a.room.id !== b.room.id) return false;
  const ar = a.room;
  const br = b.room;
  return (
    messengerRoomTradeThumbKeyPart(ar) === messengerRoomTradeThumbKeyPart(br) &&
    messengerRoomTradeListMetaSig(ar) === messengerRoomTradeListMetaSig(br) &&
    ar.unreadCount === br.unreadCount &&
    ar.isPinned === br.isPinned &&
    ar.isMuted === br.isMuted &&
    ar.lastMessageAt === br.lastMessageAt &&
    ar.title === br.title &&
    ar.subtitle === br.subtitle &&
    ar.summary === br.summary &&
    ar.peerUserId === br.peerUserId &&
    ar.roomType === br.roomType &&
    (ar.philifeMeetingMemberLabel ?? "") === (br.philifeMeetingMemberLabel ?? "") &&
    ar.memberCount === br.memberCount &&
    a.preview === b.preview &&
    a.previewKind === b.previewKind &&
    a.callStatus === b.callStatus &&
    a.callKind === b.callKind &&
    a.lastEventAt === b.lastEventAt
  );
}

export function unifiedListItemRowVisualEqual(a: UnifiedRoomListItem, b: UnifiedRoomListItem): boolean {
  return (
    a.room === b.room &&
    unifiedListItemRowDisplayEqual(a, b)
  );
}

export function communityMessengerRoomSummaryArraysRowRefsEqual(
  a: CommunityMessengerRoomSummary[] | undefined,
  b: CommunityMessengerRoomSummary[] | undefined
): boolean {
  if (a === b) return true;
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] !== bb[i]) return false;
  }
  return true;
}

/** ListPane·setData bail-out — room id·표시 필드 기준 (행 참조 무관) */
export function communityMessengerRoomSummaryListsDisplayEqual(
  a: CommunityMessengerRoomSummary[] | undefined,
  b: CommunityMessengerRoomSummary[] | undefined
): boolean {
  if (a === b) return true;
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i].id !== bb[i].id) return false;
    if (!roomSummaryListRowShallowEqual(aa[i], bb[i])) return false;
  }
  return true;
}

function messengerBootstrapTabsEqual(
  a: CommunityMessengerBootstrap["tabs"],
  b: CommunityMessengerBootstrap["tabs"]
): boolean {
  return (
    a.chats === b.chats &&
    a.groups === b.groups &&
    a.friends === b.friends &&
    a.calls === b.calls
  );
}

/** Home setData 동일 내용 bail-out — list subtree 관련 bootstrap 필드만 */
export function communityMessengerBootstrapDisplayEqual(
  a: CommunityMessengerBootstrap,
  b: CommunityMessengerBootstrap
): boolean {
  if (a === b) return true;
  return (
    a.me === b.me &&
    communityMessengerRoomSummaryListsDisplayEqual(a.chats, b.chats) &&
    communityMessengerRoomSummaryListsDisplayEqual(a.groups, b.groups) &&
    profileArraysReferenceEqual(a.friends, b.friends) &&
    profileArraysReferenceEqual(a.following, b.following) &&
    profileArraysReferenceEqual(a.hidden, b.hidden) &&
    profileArraysReferenceEqual(a.blocked, b.blocked) &&
    profileArraysReferenceEqual(a.requests, b.requests) &&
    profileArraysReferenceEqual(a.calls, b.calls) &&
    profileArraysReferenceEqual(a.discoverableGroups, b.discoverableGroups) &&
    a.deferredCallLog === b.deferredCallLog &&
    a.clientHydrationTier === b.clientHydrationTier &&
    messengerBootstrapTabsEqual(a.tabs, b.tabs)
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

function sortRooms(rooms: CommunityMessengerRoomSummary[]): CommunityMessengerRoomSummary[] {
  bumpMessengerRenderPerf("messenger_room_list_sort");
  return sortChatListRooms(rooms);
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
  return compareUnifiedChatListItems(a, b);
}

function sortCallsByTime(calls: CommunityMessengerCallLog[]): CommunityMessengerCallLog[] {
  return sortCallHistoryEntries(calls);
}

function mergeCallsByConversation(sortedNewestFirst: CommunityMessengerCallLog[]): CommunityMessengerCallLog[] {
  return mergeCallHistoryForHomeList(sortedNewestFirst);
}

