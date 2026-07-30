import {
  adaptCriticalRoomToCanonicalPatch,
  adaptRoomSummaryToCanonicalPatch,
  makeMessengerHomeRoomEvent,
} from "@/lib/community-messenger/home/inbox-pipeline/adapters";
import {
  createShadowDiagnosticsState,
  type ShadowRoomDiffRow,
  type ShadowSettledState,
  type ShadowTimelineEvent,
  type TradeClassificationEvidence,
} from "@/lib/community-messenger/home/inbox-pipeline/shadow-diagnostics";
import { buildMessengerHomeProjection } from "@/lib/community-messenger/home/inbox-pipeline/projection";
import {
  createMessengerHomeCanonicalState,
  reduceMessengerHomeRoomEvent,
} from "@/lib/community-messenger/home/inbox-pipeline/reducer";
import type {
  CanonicalMessengerHomeRoom,
  CanonicalMessengerHomeRoomPatch,
  MessengerHomeBucket,
  MessengerHomeCanonicalState,
  MessengerHomeProjection,
  MessengerHomeRoomEvent,
  MessengerHomeSource,
} from "@/lib/community-messenger/home/inbox-pipeline/types";
import { resolveCmHomeCutoverDispatchMode } from "@/lib/community-messenger/home/cm-home-cutover-gate-client";
import { shouldShowCommerceChatInList } from "@/lib/community-messenger/chat-room-list-lifecycle-policy";
import { sortChatListRooms } from "@/lib/community-messenger/chat-list/chat-list-sorter";
import { dedupeDeliveryMessengerRoomSummaries } from "@/lib/community-messenger/dedupe-delivery-messenger-room-summaries";
import { communityMessengerRoomIsConfirmedDelivery, communityMessengerRoomIsConfirmedTrade } from "@/lib/community-messenger/messenger-room-domain";
import { dedupeTradeMessengerRoomSummaries } from "@/lib/community-messenger/trade-list-canonical-key";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerBootstrapCritical,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

export type MessengerHomeShadowMode = "legacy" | "shadow";

export type MessengerHomeShadowRuntimeProjection = {
  tradeCount: number;
  deliveryCount: number;
  inboxCount: number;
  groupCount: number;
  bucketByRoomId: Record<string, MessengerHomeBucket>;
  unreadByRoomId: Record<string, number>;
  sortedInboxRoomIds: string[];
};

export type MessengerHomeShadowRuntimeSnapshot = {
  mode: MessengerHomeShadowMode;
  legacy: MessengerHomeShadowRuntimeProjection;
  canonical: MessengerHomeShadowRuntimeProjection;
  diff: {
    presence: number;
    bucket: number;
    unread: number;
    sort: number;
    unexplained: number;
    canonicalCorrect: number;
    legacyCorrect: number;
    presentation: number;
  };
  performance: {
    reducerTotalMs: number;
    reducerEventCount: number;
    projectionTotalMs: number;
    diffTotalMs: number;
  };
  lastEvent: LastShadowEventMeta | null;
};

export type MessengerHomeShadowRuntimeBridge = {
  mode: MessengerHomeShadowMode;
  getSnapshot: () => MessengerHomeShadowRuntimeSnapshot | null;
  getTimeline: () => ShadowTimelineEvent[];
  getSettled: () => ShadowSettledState;
  getRoomDiffBreakdown: () => ShadowRoomDiffRow[];
  getStoreRoom: (roomId: string) => ReturnType<MessengerHomeShadowDispatch["peekStoreRoom"]>;
  getClassificationEvidence: () => TradeClassificationEvidence[];
};

export type MessengerHomeShadowDispatch = {
  mode: MessengerHomeShadowMode;
  getRuntimeSnapshot: (
    legacy: CommunityMessengerBootstrap | null | undefined,
    viewerUserId: string | null | undefined
  ) => MessengerHomeShadowRuntimeSnapshot | null;
  dispatchEvent: (event: MessengerHomeRoomEvent) => void;
  dispatchRoomSummary: (
    source: MessengerHomeSource,
    generation: number,
    room: CommunityMessengerRoomSummary
  ) => void;
  dispatchRoomSummaries: (
    source: MessengerHomeSource,
    generation: number,
    rooms: readonly CommunityMessengerRoomSummary[] | null | undefined
  ) => void;
  dispatchCriticalPayload: (
    source: MessengerHomeSource,
    generation: number,
    payload: CommunityMessengerBootstrapCritical
  ) => void;
  dispatchPatch: (
    source: MessengerHomeSource,
    generation: number,
    patch: CanonicalMessengerHomeRoomPatch
  ) => void;
  dispatchRemove: (
    source: MessengerHomeSource,
    generation: number,
    roomId: string,
    reason: "leave" | "deleted" | "membership_removed"
  ) => void;
  compareLegacy: (legacy: CommunityMessengerBootstrap | null | undefined, viewerUserId: string | null | undefined) => void;
  peekState: () => MessengerHomeCanonicalState;
  peekStoreRoom: (roomId: string) => CanonicalMessengerHomeRoom | null;
  /**
   * Opt-in 구독. canonicalState 참조가 실제로 바뀐 event 에서만 listener 를 통지한다.
   * (React `useSyncExternalStore` 용. legacy 모드 소비자는 구독하지 않는다.)
   */
  subscribe: (listener: () => void) => () => void;
  /** 안정적 primitive revision — state 변경마다 단조 증가. `getSnapshot` 용. */
  getEventSequence: () => number;
  reconcileToLegacyRoomIds: (
    source: MessengerHomeSource,
    generation: number,
    roomIds: ReadonlySet<string>
  ) => void;
  markBootstrapSettled: () => void;
  markLegacyListReady: () => void;
  markTradeMetaInFlight: () => void;
  markTradeMetaSettled: () => void;
  markSilentRefreshStarted: () => void;
  markSilentRefreshSettled: () => void;
  markShadowSnapshot: () => void;
  getTimeline: () => ShadowTimelineEvent[];
  getSettled: () => ShadowSettledState;
  getRoomDiffBreakdown: (
    legacy: CommunityMessengerBootstrap | null | undefined,
    viewerUserId: string | null | undefined
  ) => ShadowRoomDiffRow[];
  getClassificationEvidence: () => import("@/lib/community-messenger/home/inbox-pipeline/shadow-diagnostics").TradeClassificationEvidence[];
};

export type LastShadowEventMeta = {
  source: MessengerHomeSource;
  roomId: string;
  generation: number;
  sequence: number;
};

export type MessengerHomeShadowState = {
  canonicalState: MessengerHomeCanonicalState;
  eventSequence: number;
  lastEvent: LastShadowEventMeta | null;
  lastDiffFingerprint: string;
  perf: {
    reducerEventCount: number;
    reducerTotalMs: number;
    projectionTotalMs: number;
    diffTotalMs: number;
  };
};

type DiffKind = "CANONICAL_CORRECT" | "LEGACY_CORRECT" | "BOTH_VALID_PRESENTATION_DIFF" | "UNEXPLAINED";

type RoomDiff = {
  roomId: string;
  diffKind: DiffKind;
  legacyPresence: boolean;
  canonicalPresence: boolean;
  legacyBucket: MessengerHomeBucket | null;
  canonicalBucket: MessengerHomeBucket | null;
  legacyUnread: number | null;
  canonicalUnread: number | null;
  legacySortIndex: number | null;
  canonicalSortIndex: number | null;
  lastCanonicalSource: MessengerHomeSource | null;
  lastCanonicalGeneration: number | null;
};

/**
 * 런타임 dispatch mode 권위. Gate(runtime cutover) 가 shadow 를 요구하면 모든 환경에서 shadow.
 * 그 외 Production 은 legacy(현재 제품과 동일), dev/test 는 기존 Phase2 shadow 동작(localStorage override) 보존.
 *
 * 고정 필드가 아니라 매 호출마다 최신 Gate snapshot 을 읽는다(§9: dispatch mode 와 read source 동일 snapshot).
 */
function resolveShadowDispatchMode(): MessengerHomeShadowMode {
  if (resolveCmHomeCutoverDispatchMode() === "shadow") return "shadow";
  if (process.env.NODE_ENV === "production") return "legacy";
  if (typeof window === "undefined") return process.env.NODE_ENV === "test" ? "shadow" : "legacy";
  try {
    const mode = window.localStorage.getItem("samarket:cm-home-shadow-mode");
    return mode == null || mode === "shadow" ? "shadow" : "legacy";
  } catch {
    return "shadow";
  }
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function legacyBucket(room: CommunityMessengerRoomSummary): MessengerHomeBucket {
  if (room.roomStatus === "archived" || room.roomStatus === "blocked" || room.isArchivedByViewer || room.isBlockedHiddenByViewer || room.deletedAt) {
    return "excluded";
  }
  if (communityMessengerRoomIsConfirmedTrade(room)) return "trade";
  if (communityMessengerRoomIsConfirmedDelivery(room)) return "delivery";
  if (room.roomType === "private_group") return "group";
  if (room.roomType === "direct") return "direct";
  return "excluded";
}

function visibleCommerceIds(
  rooms: CommunityMessengerRoomSummary[],
  dedupe: (rooms: CommunityMessengerRoomSummary[]) => CommunityMessengerRoomSummary[]
): string[] {
  return sortChatListRooms(dedupe(rooms).filter((room) => shouldShowCommerceChatInList(room))).map((room) => room.id);
}

export function buildLegacyMessengerHomeProjectionSnapshot(
  legacy: CommunityMessengerBootstrap | null | undefined
): MessengerHomeProjection {
  const bucketByRoomId = new Map<string, MessengerHomeBucket>();
  const unreadByRoomId = new Map<string, number>();
  const tradeRooms: CommunityMessengerRoomSummary[] = [];
  const deliveryRooms: CommunityMessengerRoomSummary[] = [];
  const inboxRooms: CommunityMessengerRoomSummary[] = [];
  for (const room of [...(legacy?.chats ?? []), ...(legacy?.groups ?? [])]) {
    const bucket = legacyBucket(room);
    bucketByRoomId.set(room.id, bucket);
    unreadByRoomId.set(room.id, room.unreadCount);
    if (bucket === "trade") tradeRooms.push(room);
    else if (bucket === "delivery") deliveryRooms.push(room);
    else if (bucket === "direct" || bucket === "group") inboxRooms.push(room);
  }
  return {
    tradeRoomIds: visibleCommerceIds(tradeRooms, dedupeTradeMessengerRoomSummaries),
    deliveryRoomIds: visibleCommerceIds(deliveryRooms, dedupeDeliveryMessengerRoomSummaries),
    inboxRoomIds: sortChatListRooms(inboxRooms).map((room) => room.id),
    bucketByRoomId,
    unreadByRoomId,
  };
}

function classifyDiff(args: {
  legacyBucket: MessengerHomeBucket | null;
  canonicalBucket: MessengerHomeBucket | null;
  legacyPresence: boolean;
  canonicalPresence: boolean;
}): DiffKind {
  if (args.legacyPresence !== args.canonicalPresence) return "UNEXPLAINED";
  if (args.legacyBucket === args.canonicalBucket) return "BOTH_VALID_PRESENTATION_DIFF";
  if (args.legacyBucket === "direct" && args.canonicalBucket === "trade") return "CANONICAL_CORRECT";
  return "UNEXPLAINED";
}

function projectionToRuntimeView(projection: MessengerHomeProjection): MessengerHomeShadowRuntimeProjection {
  let groupCount = 0;
  for (const bucket of projection.bucketByRoomId.values()) {
    if (bucket === "group") groupCount += 1;
  }
  return {
    tradeCount: projection.tradeRoomIds.length,
    deliveryCount: projection.deliveryRoomIds.length,
    inboxCount: projection.inboxRoomIds.length,
    groupCount,
    bucketByRoomId: Object.fromEntries(projection.bucketByRoomId.entries()),
    unreadByRoomId: Object.fromEntries(projection.unreadByRoomId.entries()),
    sortedInboxRoomIds: [...projection.inboxRoomIds],
  };
}

function compareProjection(
  legacy: MessengerHomeProjection,
  canonical: MessengerHomeProjection,
  lastEvent: LastShadowEventMeta | null
): { fingerprint: string; diffs: RoomDiff[]; aggregate: Record<string, number> } {
  const ids = new Set<string>([
    ...legacy.bucketByRoomId.keys(),
    ...canonical.bucketByRoomId.keys(),
  ]);
  const legacyOrder = new Map(legacy.inboxRoomIds.map((id, index) => [id, index]));
  const canonicalOrder = new Map(canonical.inboxRoomIds.map((id, index) => [id, index]));
  const diffs: RoomDiff[] = [];
  for (const roomId of ids) {
    const legacyPresence = legacy.bucketByRoomId.has(roomId);
    const canonicalPresence = canonical.bucketByRoomId.has(roomId);
    const legacyBucketValue = legacy.bucketByRoomId.get(roomId) ?? null;
    const canonicalBucketValue = canonical.bucketByRoomId.get(roomId) ?? null;
    const legacyUnread = legacy.unreadByRoomId.get(roomId) ?? null;
    const canonicalUnread = canonical.unreadByRoomId.get(roomId) ?? null;
    const legacySortIndex = legacyOrder.get(roomId) ?? null;
    const canonicalSortIndex = canonicalOrder.get(roomId) ?? null;
    if (
      legacyPresence === canonicalPresence &&
      legacyBucketValue === canonicalBucketValue &&
      legacyUnread === canonicalUnread &&
      legacySortIndex === canonicalSortIndex
    ) {
      continue;
    }
    diffs.push({
      roomId,
      diffKind: classifyDiff({
        legacyBucket: legacyBucketValue,
        canonicalBucket: canonicalBucketValue,
        legacyPresence,
        canonicalPresence,
      }),
      legacyPresence,
      canonicalPresence,
      legacyBucket: legacyBucketValue,
      canonicalBucket: canonicalBucketValue,
      legacyUnread,
      canonicalUnread,
      legacySortIndex,
      canonicalSortIndex,
      lastCanonicalSource: lastEvent?.source ?? null,
      lastCanonicalGeneration: lastEvent?.generation ?? null,
    });
  }
  const aggregate = {
    legacyTradeCount: legacy.tradeRoomIds.length,
    canonicalTradeCount: canonical.tradeRoomIds.length,
    legacyDeliveryCount: legacy.deliveryRoomIds.length,
    canonicalDeliveryCount: canonical.deliveryRoomIds.length,
    legacyInboxCount: legacy.inboxRoomIds.length,
    canonicalInboxCount: canonical.inboxRoomIds.length,
    bucketDiffCount: diffs.filter((diff) => diff.legacyBucket !== diff.canonicalBucket).length,
    presenceDiffCount: diffs.filter((diff) => diff.legacyPresence !== diff.canonicalPresence).length,
    unreadDiffCount: diffs.filter((diff) => diff.legacyUnread !== diff.canonicalUnread).length,
    sortDiffCount: diffs.filter((diff) => diff.legacySortIndex !== diff.canonicalSortIndex).length,
    unexplainedDiffCount: diffs.filter((diff) => diff.diffKind === "UNEXPLAINED").length,
  };
  return { fingerprint: JSON.stringify({ aggregate, diffs }), diffs, aggregate };
}

export function buildMessengerHomeShadowRuntimeSnapshot(
  dispatch: Pick<MessengerHomeShadowDispatch, "mode" | "peekState">,
  store: Pick<MessengerHomeShadowState, "lastEvent" | "perf">,
  legacy: CommunityMessengerBootstrap | null | undefined,
  viewerUserId: string | null | undefined
): MessengerHomeShadowRuntimeSnapshot | null {
  if (dispatch.mode !== "shadow" || !viewerUserId) return null;
  const legacyProjection = buildLegacyMessengerHomeProjectionSnapshot(legacy);
  const canonicalProjection = buildMessengerHomeProjection(dispatch.peekState().rooms.values(), viewerUserId);
  const diff = compareProjection(legacyProjection, canonicalProjection, store.lastEvent);
  return {
    mode: dispatch.mode,
    legacy: projectionToRuntimeView(legacyProjection),
    canonical: projectionToRuntimeView(canonicalProjection),
    diff: {
      presence: diff.aggregate.presenceDiffCount,
      bucket: diff.aggregate.bucketDiffCount,
      unread: diff.aggregate.unreadDiffCount,
      sort: diff.aggregate.sortDiffCount,
      unexplained: diff.aggregate.unexplainedDiffCount,
      canonicalCorrect: diff.diffs.filter((row) => row.diffKind === "CANONICAL_CORRECT").length,
      legacyCorrect: diff.diffs.filter((row) => row.diffKind === "LEGACY_CORRECT").length,
      presentation: diff.diffs.filter((row) => row.diffKind === "BOTH_VALID_PRESENTATION_DIFF").length,
    },
    performance: {
      reducerTotalMs: Math.round(store.perf.reducerTotalMs),
      reducerEventCount: store.perf.reducerEventCount,
      projectionTotalMs: Math.round(store.perf.projectionTotalMs),
      diffTotalMs: Math.round(store.perf.diffTotalMs),
    },
    lastEvent: store.lastEvent,
  };
}

/** Phase 2 shadow runtime — dev/test only. Production must not expose this bridge. */
export function installMessengerHomeShadowRuntimeBridge(
  dispatch: MessengerHomeShadowDispatch,
  getLegacyBootstrap: () => CommunityMessengerBootstrap | null | undefined
): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") {
    delete (window as Window & { __DIBAY_MESSENGER_HOME_SHADOW__?: MessengerHomeShadowRuntimeBridge }).__DIBAY_MESSENGER_HOME_SHADOW__;
    return;
  }
  const bridge: MessengerHomeShadowRuntimeBridge = {
    mode: dispatch.mode,
    getSnapshot: () => {
      const legacy = getLegacyBootstrap();
      const viewerUserId = legacy?.me?.id ?? null;
      dispatch.markShadowSnapshot?.();
      return dispatch.getRuntimeSnapshot(legacy, viewerUserId);
    },
    getTimeline: () => dispatch.getTimeline(),
    getSettled: () => dispatch.getSettled(),
    getRoomDiffBreakdown: () => {
      const legacy = getLegacyBootstrap();
      const viewerUserId = legacy?.me?.id ?? null;
      return dispatch.getRoomDiffBreakdown(legacy, viewerUserId);
    },
    getStoreRoom: (roomId) => dispatch.peekStoreRoom(roomId),
    getClassificationEvidence: () => dispatch.getClassificationEvidence(),
  };
  (window as Window & { __DIBAY_MESSENGER_HOME_SHADOW__?: MessengerHomeShadowRuntimeBridge }).__DIBAY_MESSENGER_HOME_SHADOW__ =
    bridge;
}

export function createMessengerHomeShadowDispatch(): MessengerHomeShadowDispatch {
  const store: MessengerHomeShadowState = {
    canonicalState: createMessengerHomeCanonicalState(),
    eventSequence: 0,
    lastEvent: null,
    lastDiffFingerprint: "",
    perf: {
      reducerEventCount: 0,
      reducerTotalMs: 0,
      projectionTotalMs: 0,
      diffTotalMs: 0,
    },
  };
  const diagnostics = createShadowDiagnosticsState();
  let lastLegacyBootstrap: CommunityMessengerBootstrap | null | undefined = null;

  /**
   * Opt-in React 구독용 listener 집합. canonicalState 참조가 실제로 바뀐 경우에만(=`dispatchEvent`
   * 의 `next === before` 조기 반환을 통과한 event) 1회 통지한다. reducer/merge/projection/분류 로직은
   * 건드리지 않으며, listener 는 순수 알림(재렌더 스케줄)만 담당한다.
   */
  const listeners = new Set<() => void>();
  const notifyStoreChanged = () => {
    for (const listener of listeners) listener();
  };

  const dispatchEvent = (event: MessengerHomeRoomEvent) => {
    if (resolveShadowDispatchMode() !== "shadow") return;
    const beforeRoom = store.canonicalState.rooms.get(event.roomId) ?? null;
    const before = store.canonicalState;
    const t0 = nowMs();
    const next = reduceMessengerHomeRoomEvent(before, event);
    store.perf.reducerEventCount += 1;
    store.perf.reducerTotalMs += nowMs() - t0;
    if (next === before) return;
    store.eventSequence += 1;
    store.canonicalState = next;
    store.lastEvent = {
      source: event.source,
      roomId: event.roomId,
      generation: event.generation,
      sequence: store.eventSequence,
    };
    if (event.kind !== "remove") {
      const afterRoom = next.rooms.get(event.roomId) ?? null;
      const incomingKind =
        event.patch.contextMeta === undefined
          ? null
          : event.patch.contextMeta?.kind ?? null;
      diagnostics.recordReducerApply({
        source: event.source,
        generation: event.generation,
        sequence: store.eventSequence,
        roomId: event.roomId,
        before: beforeRoom,
        after: afterRoom,
        incomingContextKind: incomingKind,
        legacyBootstrap: lastLegacyBootstrap,
        viewerUserId: lastLegacyBootstrap?.me?.id ?? null,
      });
    }
    // canonicalState 참조가 바뀐 경우에만(위 `next === before` 조기 반환 통과) upsert·remove 공통 1회 통지.
    notifyStoreChanged();
  };

  const dispatchPatch = (source: MessengerHomeSource, generation: number, patch: CanonicalMessengerHomeRoomPatch) => {
    dispatchEvent(makeMessengerHomeRoomEvent(source, generation, patch));
  };

  const api: MessengerHomeShadowDispatch = {
    get mode() {
      return resolveShadowDispatchMode();
    },
    getRuntimeSnapshot(legacy, viewerUserId) {
      const mode = resolveShadowDispatchMode();
      if (mode !== "shadow" || !viewerUserId) return null;
      const legacyProjection = buildLegacyMessengerHomeProjectionSnapshot(legacy);
      const canonicalProjection = buildMessengerHomeProjection(store.canonicalState.rooms.values(), viewerUserId);
      const diff = compareProjection(legacyProjection, canonicalProjection, store.lastEvent);
      return {
        mode,
        legacy: projectionToRuntimeView(legacyProjection),
        canonical: projectionToRuntimeView(canonicalProjection),
        diff: {
          presence: diff.aggregate.presenceDiffCount,
          bucket: diff.aggregate.bucketDiffCount,
          unread: diff.aggregate.unreadDiffCount,
          sort: diff.aggregate.sortDiffCount,
          unexplained: diff.aggregate.unexplainedDiffCount,
          canonicalCorrect: diff.diffs.filter((row) => row.diffKind === "CANONICAL_CORRECT").length,
          legacyCorrect: diff.diffs.filter((row) => row.diffKind === "LEGACY_CORRECT").length,
          presentation: diff.diffs.filter((row) => row.diffKind === "BOTH_VALID_PRESENTATION_DIFF").length,
        },
        performance: {
          reducerTotalMs: Math.round(store.perf.reducerTotalMs),
          reducerEventCount: store.perf.reducerEventCount,
          projectionTotalMs: Math.round(store.perf.projectionTotalMs),
          diffTotalMs: Math.round(store.perf.diffTotalMs),
        },
        lastEvent: store.lastEvent,
      };
    },
    dispatchEvent,
    dispatchPatch,
    dispatchRoomSummary(source, generation, room) {
      dispatchPatch(source, generation, adaptRoomSummaryToCanonicalPatch(room));
    },
    dispatchRoomSummaries(source, generation, rooms) {
      for (const room of rooms ?? []) {
        api.dispatchRoomSummary(source, generation, room);
      }
    },
    dispatchCriticalPayload(source, generation, payload) {
      const rows = [...(payload.chats ?? []), ...(payload.groups ?? [])];
      for (const row of rows) {
        dispatchPatch(source, generation, adaptCriticalRoomToCanonicalPatch(row));
      }
    },
    dispatchRemove(source, generation, roomId, reason) {
      dispatchEvent({ kind: "remove", source, generation, roomId, reason });
    },
    compareLegacy(legacy, viewerUserId) {
      if (resolveShadowDispatchMode() !== "shadow" || !viewerUserId) return;
      lastLegacyBootstrap = legacy;
      const tProjection0 = nowMs();
      const legacyProjection = buildLegacyMessengerHomeProjectionSnapshot(legacy);
      const canonicalProjection = buildMessengerHomeProjection(store.canonicalState.rooms.values(), viewerUserId);
      store.perf.projectionTotalMs += nowMs() - tProjection0;
      const tDiff0 = nowMs();
      const diff = compareProjection(legacyProjection, canonicalProjection, store.lastEvent);
      store.perf.diffTotalMs += nowMs() - tDiff0;
      diagnostics.markShadowProjectionSettled();
      if (diff.fingerprint === store.lastDiffFingerprint || diff.diffs.length === 0) return;
      store.lastDiffFingerprint = diff.fingerprint;
      console.debug("[cm-home-shadow-diff]", JSON.stringify({
        aggregate: {
          ...diff.aggregate,
          reducerEventCount: store.perf.reducerEventCount,
          reducerTotalMs: Math.round(store.perf.reducerTotalMs),
          projectionTotalMs: Math.round(store.perf.projectionTotalMs),
          diffTotalMs: Math.round(store.perf.diffTotalMs),
        },
        diffs: diff.diffs.slice(0, 20),
      }));
    },
    peekState() {
      return store.canonicalState;
    },
    peekStoreRoom(roomId) {
      return store.canonicalState.rooms.get(roomId) ?? null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getEventSequence() {
      return store.eventSequence;
    },
    reconcileToLegacyRoomIds(source, generation, roomIds) {
      if (resolveShadowDispatchMode() !== "shadow") return;
      for (const roomId of store.canonicalState.rooms.keys()) {
        if (!roomIds.has(roomId)) {
          api.dispatchRemove(source, generation, roomId, "membership_removed");
        }
      }
    },
    markBootstrapSettled: () => diagnostics.markBootstrapSettled(),
    markLegacyListReady: () => diagnostics.markLegacyListReady(),
    markTradeMetaInFlight: () => diagnostics.markTradeMetaInFlight(),
    markTradeMetaSettled: () => diagnostics.markTradeMetaSettled(),
    markSilentRefreshStarted: () => diagnostics.markSilentRefreshStarted(),
    markSilentRefreshSettled: () => diagnostics.markSilentRefreshSettled(),
    markShadowSnapshot: () => diagnostics.markShadowSnapshot(),
    getTimeline: () => diagnostics.getTimeline(),
    getSettled: () => diagnostics.getSettled(),
    getRoomDiffBreakdown(legacy, viewerUserId) {
      if (!viewerUserId) return [];
      const legacyProjection = buildLegacyMessengerHomeProjectionSnapshot(legacy);
      const canonicalProjection = buildMessengerHomeProjection(store.canonicalState.rooms.values(), viewerUserId);
      return diagnostics.buildRoomDiffBreakdown({
        legacy,
        canonicalRooms: store.canonicalState.rooms.values(),
        legacyProjection,
        canonicalProjection,
        viewerUserId,
      });
    },
    getClassificationEvidence: () => diagnostics.getClassificationEvidence(),
  };

  return api;
}
