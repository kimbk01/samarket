"use client";

/**
 * Phase 3 — Canonical Projection READ adapter (표시 경로 전용).
 *
 * 목적: 메신저 홈 인박스 목록의 **표시 데이터 소스**를 Legacy bootstrap 에서 Canonical store 로 전환한다.
 *
 * 핵심 계약:
 *  - Writer / Reducer / Realtime / Cache / Bootstrap / Participant / Unread 로직은 **읽기만** 한다 (Phase 2 LOCK).
 *  - Canonical 이 **권위**를 가지는 축: 방 집합(membership) · bucket 분류(contextMeta/directKey/roomType/status/archived)
 *    · unread · 정렬 키(lastMessageAt) · 마지막 메시지 단위(preview/type).
 *  - Cosmetic 필드(title·avatar·subtitle·summary·isPinned·notice·peerUserId·memberCount 등)는
 *    Canonical 모델에 없으므로 **Legacy 행에서 보존**한다 (0 visual diff 보장).
 *  - 결과 객체는 기존 `useCommunityMessengerHomeState` 의 `data` 입력으로 그대로 전달된다.
 *    (Freeze 대상인 hook 자체는 수정하지 않는다.)
 *  - `source==="legacy"` 이거나 canonical store 가 비어 있으면 **legacy 객체를 그대로(참조 동일) 반환** → 완전 무해.
 *
 * 설계 문서: docs/dibay-messenger-home-inbox-phase3-canonical-projection-cutover-design.md §6
 */

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { resolveMessengerHomeBucket } from "@/lib/community-messenger/home/inbox-pipeline/classification";
import type {
  CanonicalMessengerHomeRoom,
  MessengerHomeBucket,
} from "@/lib/community-messenger/home/inbox-pipeline/types";
import type { MessengerHomeShadowDispatch } from "@/lib/community-messenger/home/inbox-pipeline/shadow";
import { roomSummaryListRowShallowEqual } from "@/lib/community-messenger/home/merge-bootstrap-lists-preserve-refs";
import {
  isCommunityMessengerGroupRoomType,
  type CommunityMessengerBootstrap,
  type CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import type {
  MessengerHomeProjectionPillarScope,
  MessengerHomeProjectionSource,
} from "@/lib/community-messenger/home/projection-source-flag";

function normId(id: string): string {
  return String(id ?? "").trim().toLowerCase();
}

/** canonical bucket → 단계 검증 scope 매핑 (direct/group = inbox). */
function bucketInScope(bucket: MessengerHomeBucket, scope: MessengerHomeProjectionPillarScope): boolean {
  if (scope === "all") return true;
  if (scope === "trade") return bucket === "trade";
  if (scope === "delivery") return bucket === "delivery";
  if (scope === "inbox") return bucket === "direct" || bucket === "group";
  return false;
}

/**
 * Canonical-only 방(legacy 행 없음) → 최소 summary.
 * `projection.ts` 의 `toRoomSummary` 와 동일 매핑을 표시 경로용으로 복제한다(Freeze 파일 미수정 목적).
 */
function canonicalOnlyRoomToSummary(room: CanonicalMessengerHomeRoom): CommunityMessengerRoomSummary {
  return {
    id: room.roomId,
    roomType: room.roomType,
    roomStatus: room.roomStatus,
    visibility: room.roomType === "open_group" ? "public" : "private",
    joinPolicy: room.roomType === "open_group" ? "free" : "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: room.title,
    subtitle: "",
    summary: "",
    avatarUrl: room.avatarUrl,
    unreadCount: room.unreadCount,
    lastMessage: room.latestMessage,
    lastMessageType: room.latestMessageType,
    lastMessageAt: room.lastMessageAt,
    memberCount: room.memberCount,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: room.roomType === "open_group",
    requiresPassword: false,
    allowMemberInvite: true,
    messengerDirectKey: room.directKey,
    isArchivedByViewer: room.isArchived,
    isBlockedHiddenByViewer: room.isBlockedHidden,
    contextMeta: room.contextMeta,
  };
}

/**
 * Legacy 행에 Canonical 권위 필드만 덮어쓴다.
 * 값이 완전히 동일하면(정합 상태) 기존 legacy 행 **참조를 그대로 반환**해 리렌더를 막는다.
 */
function overlayCanonicalOntoLegacy(
  legacyRow: CommunityMessengerRoomSummary,
  room: CanonicalMessengerHomeRoom
): CommunityMessengerRoomSummary {
  const next: CommunityMessengerRoomSummary = {
    ...legacyRow,
    // 권위 필드 (bucket / unread / 정렬 / 마지막 메시지)
    unreadCount: room.unreadCount,
    lastMessage: room.latestMessage,
    lastMessageType: room.latestMessageType,
    lastMessageAt: room.lastMessageAt,
    contextMeta: room.contextMeta,
    messengerDirectKey: room.directKey,
    roomType: room.roomType,
    roomStatus: room.roomStatus,
    isArchivedByViewer: room.isArchived,
    isBlockedHiddenByViewer: room.isBlockedHidden,
  };
  return roomSummaryListRowShallowEqual(legacyRow, next) ? legacyRow : next;
}

export type CanonicalHomeListBuildResult = {
  chats: CommunityMessengerRoomSummary[];
  groups: CommunityMessengerRoomSummary[];
  canonicalRoomCount: number;
  /** canonical store 가 비어 legacy 로 안전 폴백해야 하는 상태 */
  fellBackToLegacy: boolean;
};

/**
 * Canonical store → 표시용 chats/groups.
 * chats/groups 분할은 **legacy 위치를 우선 보존**(union 만 맞으면 hook 출력은 동일).
 * scope!==all 이면 scope 밖 bucket 은 legacy 행을 그대로 두고, scope 안 bucket 만 canonical 로 읽는다.
 */
export function buildCanonicalHomeListRooms(
  legacyData: CommunityMessengerBootstrap,
  dispatch: MessengerHomeShadowDispatch,
  scope: MessengerHomeProjectionPillarScope
): CanonicalHomeListBuildResult {
  const viewerUserId = legacyData.me?.id?.trim() ?? "";
  const legacyChats = legacyData.chats ?? [];
  const legacyGroups = legacyData.groups ?? [];

  const legacyById = new Map<string, CommunityMessengerRoomSummary>();
  for (const r of legacyChats) legacyById.set(normId(r.id), r);
  for (const r of legacyGroups) legacyById.set(normId(r.id), r);
  const legacyGroupIds = new Set(legacyGroups.map((r) => normId(r.id)));

  const state = dispatch.peekState();
  const canonicalRoomCount = state.rooms.size;

  // 안전 폴백: canonical 이 비었는데 legacy 에 방이 있으면 legacy 유지 (blank home 방지 = 암묵적 rollback).
  if (canonicalRoomCount === 0 && legacyChats.length + legacyGroups.length > 0) {
    return { chats: legacyChats, groups: legacyGroups, canonicalRoomCount, fellBackToLegacy: true };
  }

  const chats: CommunityMessengerRoomSummary[] = [];
  const groups: CommunityMessengerRoomSummary[] = [];
  const takenFromCanonical = new Set<string>();

  for (const room of state.rooms.values()) {
    const bucket = resolveMessengerHomeBucket(room, viewerUserId);
    if (!bucketInScope(bucket, scope)) continue; // scope 밖 → 아래에서 legacy 로 채움
    const id = normId(room.roomId);
    const legacyRow = legacyById.get(id) ?? null;
    const summary = legacyRow ? overlayCanonicalOntoLegacy(legacyRow, room) : canonicalOnlyRoomToSummary(room);
    takenFromCanonical.add(id);
    const isGroup = legacyGroupIds.has(id) || (!legacyRow && isCommunityMessengerGroupRoomType(room.roomType));
    (isGroup ? groups : chats).push(summary);
  }

  if (scope !== "all") {
    // scope 밖 방은 legacy 행을 그대로 유지 (부분 cutover).
    for (const r of legacyChats) if (!takenFromCanonical.has(normId(r.id))) chats.push(r);
    for (const r of legacyGroups) if (!takenFromCanonical.has(normId(r.id))) groups.push(r);
  }

  return { chats, groups, canonicalRoomCount, fellBackToLegacy: false };
}

/** 배열 내용이 행 단위로 동일하면 이전 참조 유지 (hook memo 안정화). */
function stabilizeRoomArray(
  next: CommunityMessengerRoomSummary[],
  prevRef: { current: CommunityMessengerRoomSummary[] | null }
): CommunityMessengerRoomSummary[] {
  const prev = prevRef.current;
  if (
    prev &&
    prev.length === next.length &&
    prev.every((row, i) => row === next[i] || roomSummaryListRowShallowEqual(row, next[i]!))
  ) {
    return prev;
  }
  prevRef.current = next;
  return next;
}

/**
 * 홈 컴포넌트에서 `useCommunityMessengerHomeState({ data })` 에 넘길 표시 데이터.
 *  - source==="legacy" → legacyData 그대로(참조 동일) → 완전 무해.
 *  - source==="canonical" | "dual" → chats/groups 만 canonical 로 교체한 새 객체.
 *    friends/requests/calls/discoverableGroups 등은 legacy 그대로(참조 유지) → 액션·친구·통화 경로 무영향.
 */
export function useMessengerHomeCanonicalListData(args: {
  legacyData: CommunityMessengerBootstrap | null;
  dispatch: MessengerHomeShadowDispatch;
  source: MessengerHomeProjectionSource;
  pillarScope: MessengerHomeProjectionPillarScope;
}): CommunityMessengerBootstrap | null {
  const { legacyData, dispatch, source, pillarScope } = args;
  /**
   * 목록 배열(chats/groups)만 **참조 안정화**하면 충분하다.
   * 하위 `useCommunityMessengerHomeState` 는 `data?.chats`/`data?.groups` **참조**로 memo 하므로,
   * 래퍼 객체는 매 렌더 새로 만들어도(비목록 필드 최신 반영) 재정렬을 유발하지 않는다.
   * (ref-in-useMemo 안정화 패턴은 `use-community-messenger-home-state.ts` 와 동일.)
   */
  const chatsRef = useRef<CommunityMessengerRoomSummary[] | null>(null);
  const groupsRef = useRef<CommunityMessengerRoomSummary[] | null>(null);

  /**
   * Phase 3 Read 정합성 수정 — canonical store 를 **opt-in 구독**하여 read/realtime 으로 store 가 갱신되면
   * 컴포넌트를 재렌더하고 canonical 권위값으로 memo 를 재계산한다.
   *
   * 배경: canonical reducer 가 방 unread 를 갱신하면 `store.canonicalState` 참조가 바뀌지만
   * (`shadow.ts` immutable), store 변경은 React 재렌더를 유발하지 않았다(Root Cause: CANONICAL_RENDER_NOT_SUBSCRIBED).
   * `useSyncExternalStore` 로 canonical/dual 모드에서만 store 에 구독하여 store 변경 → 재렌더 → memo 재실행
   * → 최신 unread 반영을 성립시킨다. eventSequence(단조 증가 primitive)를 getSnapshot 으로 사용해 tearing 없이
   * 안정적 revision 을 얻는다.
   *
   * legacy 모드: 구독하지 않고(no-op subscribe) revision 은 상수 0 → canonical 변경이 재렌더·memo 재실행을
   * 유발하지 않는다(§7 legacy 무해 계약, `homeListRenderData === data` 참조 동일). subscribe/getSnapshot 은
   * useCallback 으로 고정해 매 렌더 재구독을 막는다.
   */
  const canonicalSubscribed = source !== "legacy" && dispatch.mode === "shadow";
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!canonicalSubscribed) return () => {};
      return dispatch.subscribe(onStoreChange);
    },
    [dispatch, canonicalSubscribed]
  );
  const getSnapshot = useCallback(
    () => (canonicalSubscribed ? dispatch.getEventSequence() : 0),
    [dispatch, canonicalSubscribed]
  );
  // store 변경 시 재렌더 트리거가 목적 — 반환 revision(eventSequence) 자체는 memo 에서 직접 쓰지 않는다.
  useSyncExternalStore(subscribe, getSnapshot, () => 0);
  // 재렌더 시 최신 canonical state 참조를 읽는다. immutable reducer 라 store 변경 시에만 ref 가 바뀌므로
  // 이 값이 memo dependency 로서 재계산을 유발한다(legacy 모드는 null → legacy 무해 계약 유지).
  const canonicalState = canonicalSubscribed ? dispatch.peekState() : null;

  return useMemo(() => {
    if (!legacyData) return legacyData;
    if (source === "legacy" || !canonicalState) return legacyData;
    if (dispatch.mode !== "shadow" || !legacyData.me?.id) return legacyData;

    const built = buildCanonicalHomeListRooms(legacyData, dispatch, pillarScope);
    if (built.fellBackToLegacy) return legacyData;

    const chats = stabilizeRoomArray(built.chats, chatsRef);
    const groups = stabilizeRoomArray(built.groups, groupsRef);
    if (chats === legacyData.chats && groups === legacyData.groups) return legacyData;
    return { ...legacyData, chats, groups };
  }, [legacyData, dispatch, source, pillarScope, canonicalState]);
}
