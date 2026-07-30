import { shouldShowCommerceChatInList } from "@/lib/community-messenger/chat-room-list-lifecycle-policy";
import { sortChatListRooms } from "@/lib/community-messenger/chat-list/chat-list-sorter";
import { dedupeDeliveryMessengerRoomSummaries } from "@/lib/community-messenger/dedupe-delivery-messenger-room-summaries";
import { resolveMessengerHomeBucket } from "@/lib/community-messenger/home/inbox-pipeline/classification";
import { buildMessengerHomeProjection } from "@/lib/community-messenger/home/inbox-pipeline/projection";
import type {
  CanonicalMessengerHomeRoom,
  MessengerHomeBucket,
  MessengerHomeProjection,
  MessengerHomeSource,
} from "@/lib/community-messenger/home/inbox-pipeline/types";
import {
  communityMessengerRoomIsConfirmedDelivery,
  communityMessengerRoomIsConfirmedTrade,
} from "@/lib/community-messenger/messenger-room-domain";
import { dedupeTradeMessengerRoomSummaries } from "@/lib/community-messenger/trade-list-canonical-key";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export type TradeClassificationEvidence = {
  roomId: string;
  status: "confirmed_trade" | "confirmed_non_trade" | "unknown";
  source: "critical" | "lite" | "full" | "home_sync" | "trade_meta";
  timestamp: number;
};

export type ShadowTimelinePhase =
  | "T1_critical_payload"
  | "T2_adapter_event"
  | "T3_reducer_apply"
  | "T4_lite_payload"
  | "T5_full_payload"
  | "T6_trade_meta"
  | "T7_legacy_list_ready"
  | "T8_shadow_snapshot"
  | "T9_silent_refresh";

export type ShadowTimelineEvent = {
  phase: ShadowTimelinePhase;
  roomId: string;
  source: MessengerHomeSource;
  generation: number;
  sequence: number;
  incomingContextKind: string | null;
  canonicalBeforeKind: string | null;
  canonicalAfterKind: string | null;
  legacyKind: MessengerHomeBucket | null;
  canonicalBucket: MessengerHomeBucket | null;
  legacyBucket: MessengerHomeBucket | null;
  timestamp: number;
};

export type ShadowSettledState = {
  legacyListReady: boolean;
  bootstrapSettled: boolean;
  tradeMetaSettled: boolean;
  shadowProjectionSettled: boolean;
  silentRefreshSettled: boolean;
};

export type ShadowDiffBranch =
  | "ADAPTER_DIFF"
  | "STORE_DIFF"
  | "CLASSIFICATION_DIFF"
  | "DEDUPE_DIFF"
  | "LIFECYCLE_DIFF"
  | "SORT_ONLY_DIFF"
  | "LEGACY_SNAPSHOT_DIFF"
  | "TIMING_DIFF"
  | "NONE";

export type ShadowRoomDiffRow = {
  roomId: string;
  roomType: string | null;
  directKey: string | null;
  contextMetaKind: string | null;
  orderId: string | null;
  productChatId: string | null;
  legacyBucket: MessengerHomeBucket | null;
  canonicalBucket: MessengerHomeBucket | null;
  legacyVisible: boolean;
  canonicalVisible: boolean;
  legacyCanonicalKey: string | null;
  canonicalCanonicalKey: string | null;
  legacyLifecycleVisible: boolean;
  canonicalLifecycleVisible: boolean;
  legacyDedupeWinner: boolean;
  canonicalDedupeWinner: boolean;
  lastCanonicalSource: MessengerHomeSource | null;
  branch: ShadowDiffBranch;
};

const TIMELINE_CAP = 400;
const WATCH_ROOM_PREFIXES = ["901e97e5", "e6c03412", "b19e2672"];

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function sourceToEvidenceSource(source: MessengerHomeSource): TradeClassificationEvidence["source"] {
  switch (source) {
    case "critical":
    case "cache":
      return "critical";
    case "lite":
      return "lite";
    case "full":
      return "full";
    case "home_sync":
      return "home_sync";
    case "trade_meta":
      return "trade_meta";
    default:
      return "full";
  }
}

function sourceToPhase(source: MessengerHomeSource): ShadowTimelinePhase {
  switch (source) {
    case "critical":
      return "T1_critical_payload";
    case "cache":
      return "T1_critical_payload";
    case "lite":
      return "T4_lite_payload";
    case "full":
      return "T5_full_payload";
    case "trade_meta":
      return "T6_trade_meta";
    case "home_sync":
      return "T9_silent_refresh";
    default:
      return "T3_reducer_apply";
  }
}

function legacyBucketFromSummary(room: CommunityMessengerRoomSummary): MessengerHomeBucket {
  if (room.roomStatus === "archived" || room.roomStatus === "blocked" || room.isArchivedByViewer || room.isBlockedHiddenByViewer || room.deletedAt) {
    return "excluded";
  }
  if (communityMessengerRoomIsConfirmedTrade(room)) return "trade";
  if (communityMessengerRoomIsConfirmedDelivery(room)) return "delivery";
  if (room.roomType === "private_group") return "group";
  if (room.roomType === "direct") return "direct";
  return "excluded";
}

function tradeCanonicalKey(room: CommunityMessengerRoomSummary): string | null {
  const meta = room.contextMeta?.kind === "trade" ? room.contextMeta : null;
  if (meta?.productChatId) return `trade_pc:${meta.productChatId}`;
  const dk = room.messengerDirectKey?.trim() ?? "";
  if (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:")) return dk;
  return null;
}

function deliveryCanonicalKey(room: CommunityMessengerRoomSummary): string | null {
  const meta = room.contextMeta?.kind === "delivery" ? room.contextMeta : null;
  if (meta?.storeOrderId) return `store_order:${meta.storeOrderId}`;
  const dk = room.messengerDirectKey?.trim() ?? "";
  if (dk.startsWith("store_order:") || dk.startsWith("trade_order:")) return dk;
  return null;
}

function canonicalRoomToSummary(room: CanonicalMessengerHomeRoom): CommunityMessengerRoomSummary {
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
    chatDomain: room.chatDomain,
    domainIdentity: room.domainIdentity,
  };
}

function isDedupeWinner(
  room: CommunityMessengerRoomSummary,
  bucket: MessengerHomeBucket,
  rooms: CommunityMessengerRoomSummary[]
): boolean {
  if (bucket === "trade") {
    const winners = new Set(
      sortChatListRooms(
        dedupeTradeMessengerRoomSummaries(rooms.filter((r) => communityMessengerRoomIsConfirmedTrade(r)))
      ).map((r) => r.id)
    );
    return winners.has(room.id);
  }
  if (bucket === "delivery") {
    const winners = new Set(
      sortChatListRooms(
        dedupeDeliveryMessengerRoomSummaries(rooms.filter((r) => communityMessengerRoomIsConfirmedDelivery(r)))
      ).map((r) => r.id)
    );
    return winners.has(room.id);
  }
  return true;
}

function isVisibleInProjection(roomId: string, projection: MessengerHomeProjection): boolean {
  return (
    projection.tradeRoomIds.includes(roomId) ||
    projection.deliveryRoomIds.includes(roomId) ||
    projection.inboxRoomIds.includes(roomId)
  );
}

export function createShadowDiagnosticsState() {
  const timeline: ShadowTimelineEvent[] = [];
  const classificationEvidence = new Map<string, TradeClassificationEvidence>();
  const settled: ShadowSettledState = {
    legacyListReady: false,
    bootstrapSettled: false,
    tradeMetaSettled: true,
    shadowProjectionSettled: false,
    silentRefreshSettled: true,
  };
  let lastCanonicalSource: MessengerHomeSource | null = null;

  const shouldWatchRoom = (roomId: string) =>
    WATCH_ROOM_PREFIXES.some((prefix) => roomId.startsWith(prefix));

  return {
    settled,
    recordReducerApply(args: {
      source: MessengerHomeSource;
      generation: number;
      sequence: number;
      roomId: string;
      before: CanonicalMessengerHomeRoom | null;
      after: CanonicalMessengerHomeRoom | null;
      incomingContextKind: string | null;
      legacyBootstrap: CommunityMessengerBootstrap | null | undefined;
      viewerUserId: string | null | undefined;
    }) {
      lastCanonicalSource = args.source;
      const watchTimeline =
        shouldWatchRoom(args.roomId) || args.incomingContextKind === "trade" || args.after?.contextMeta?.kind === "trade";
      if (watchTimeline) {
        const legacyRoom =
          [...(args.legacyBootstrap?.chats ?? []), ...(args.legacyBootstrap?.groups ?? [])].find(
            (room) => room.id === args.roomId
          ) ?? null;
        const legacyKind = legacyRoom ? legacyBucketFromSummary(legacyRoom) : null;
        const canonicalBucket = args.after
          ? resolveMessengerHomeBucket(args.after, args.viewerUserId ?? "")
          : null;
        timeline.push({
          phase: sourceToPhase(args.source),
          roomId: args.roomId,
          source: args.source,
          generation: args.generation,
          sequence: args.sequence,
          incomingContextKind: args.incomingContextKind,
          canonicalBeforeKind: args.before?.contextMeta?.kind ?? null,
          canonicalAfterKind: args.after?.contextMeta?.kind ?? null,
          legacyKind,
          canonicalBucket,
          legacyBucket: legacyKind,
          timestamp: nowMs(),
        });
        if (timeline.length > TIMELINE_CAP) timeline.shift();
      }

      if (!args.after) return;
      const incomingKind = args.incomingContextKind;
      const afterKind = args.after.contextMeta?.kind ?? null;
      let status: TradeClassificationEvidence["status"] = "unknown";
      if (afterKind === "trade") status = "confirmed_trade";
      else if (afterKind === "delivery") status = "confirmed_non_trade";
      else if (incomingKind === null && afterKind == null && args.after) status = "confirmed_non_trade";
      classificationEvidence.set(args.roomId, {
        roomId: args.roomId,
        status,
        source: sourceToEvidenceSource(args.source),
        timestamp: nowMs(),
      });
    },
    markLegacyListReady() {
      settled.legacyListReady = true;
      timeline.push({
        phase: "T7_legacy_list_ready",
        roomId: "*",
        source: "full",
        generation: 0,
        sequence: timeline.length + 1,
        incomingContextKind: null,
        canonicalBeforeKind: null,
        canonicalAfterKind: null,
        legacyKind: null,
        canonicalBucket: null,
        legacyBucket: null,
        timestamp: nowMs(),
      });
    },
    markShadowSnapshot() {
      timeline.push({
        phase: "T8_shadow_snapshot",
        roomId: "*",
        source: "full",
        generation: 0,
        sequence: timeline.length + 1,
        incomingContextKind: null,
        canonicalBeforeKind: null,
        canonicalAfterKind: null,
        legacyKind: null,
        canonicalBucket: null,
        legacyBucket: null,
        timestamp: nowMs(),
      });
    },
    markBootstrapSettled() {
      settled.bootstrapSettled = true;
    },
    markTradeMetaInFlight() {
      settled.tradeMetaSettled = false;
    },
    markTradeMetaSettled() {
      settled.tradeMetaSettled = true;
    },
    markSilentRefreshStarted() {
      settled.silentRefreshSettled = false;
    },
    markSilentRefreshSettled() {
      settled.silentRefreshSettled = true;
    },
    markShadowProjectionSettled() {
      settled.shadowProjectionSettled = true;
    },
    getTimeline(): ShadowTimelineEvent[] {
      return [...timeline];
    },
    getSettled(): ShadowSettledState {
      return { ...settled };
    },
    getClassificationEvidence(): TradeClassificationEvidence[] {
      return [...classificationEvidence.values()];
    },
    getClassificationEvidenceForRoom(roomId: string): TradeClassificationEvidence | null {
      return classificationEvidence.get(roomId) ?? null;
    },
    buildRoomDiffBreakdown(args: {
      legacy: CommunityMessengerBootstrap | null | undefined;
      canonicalRooms: Iterable<CanonicalMessengerHomeRoom>;
      legacyProjection: MessengerHomeProjection;
      canonicalProjection: MessengerHomeProjection;
      viewerUserId: string;
    }): ShadowRoomDiffRow[] {
      const legacyRooms = [...(args.legacy?.chats ?? []), ...(args.legacy?.groups ?? [])];
      const legacyById = new Map(legacyRooms.map((room) => [room.id, room]));
      const canonicalList = [...args.canonicalRooms];
      const canonicalById = new Map(canonicalList.map((room) => [room.roomId, room]));
      const canonicalSummaries = canonicalList.map(canonicalRoomToSummary);
      const ids = new Set<string>([...legacyById.keys(), ...canonicalById.keys()]);

      const rows: ShadowRoomDiffRow[] = [];
      for (const roomId of ids) {
        const legacyRoom = legacyById.get(roomId) ?? null;
        const canonicalRoom = canonicalById.get(roomId) ?? null;
        const legacyBucket = legacyRoom ? legacyBucketFromSummary(legacyRoom) : null;
        const canonicalBucket = canonicalRoom
          ? resolveMessengerHomeBucket(canonicalRoom, args.viewerUserId)
          : null;
        const legacySummary = legacyRoom;
        const canonicalSummary = canonicalRoom ? canonicalRoomToSummary(canonicalRoom) : null;
        const legacyVisible = isVisibleInProjection(roomId, args.legacyProjection);
        const canonicalVisible = isVisibleInProjection(roomId, args.canonicalProjection);
        const legacyLifecycleVisible = legacySummary ? shouldShowCommerceChatInList(legacySummary) : false;
        const canonicalLifecycleVisible = canonicalSummary ? shouldShowCommerceChatInList(canonicalSummary) : false;

        let branch: ShadowDiffBranch = "NONE";
        if (!legacyRoom && canonicalRoom) {
          branch = "STORE_DIFF";
        } else if (legacyRoom && !canonicalRoom) {
          branch = "STORE_DIFF";
        } else if (legacyBucket !== canonicalBucket) {
          const legacyConfirmedTrade = legacySummary ? communityMessengerRoomIsConfirmedTrade(legacySummary) : false;
          const canonicalConfirmedTrade = canonicalSummary ? communityMessengerRoomIsConfirmedTrade(canonicalSummary) : false;
          if (legacyConfirmedTrade !== canonicalConfirmedTrade) {
            branch = legacyRoom?.contextMeta?.kind !== canonicalRoom?.contextMeta?.kind ? "ADAPTER_DIFF" : "CLASSIFICATION_DIFF";
          } else {
            branch = "CLASSIFICATION_DIFF";
          }
        } else if (legacyVisible !== canonicalVisible) {
          if (legacyLifecycleVisible !== canonicalLifecycleVisible) {
            branch = "LIFECYCLE_DIFF";
          } else if (legacySummary && canonicalSummary) {
            const legacyWinner = isDedupeWinner(legacySummary, legacyBucket ?? "excluded", legacyRooms);
            const canonicalWinner = isDedupeWinner(
              canonicalSummary,
              canonicalBucket ?? "excluded",
              canonicalSummaries
            );
            if (legacyWinner !== canonicalWinner) branch = "DEDUPE_DIFF";
            else branch = "LIFECYCLE_DIFF";
          } else {
            branch = "DEDUPE_DIFF";
          }
        } else if (
          args.legacyProjection.inboxRoomIds.indexOf(roomId) !== args.canonicalProjection.inboxRoomIds.indexOf(roomId)
        ) {
          branch = "SORT_ONLY_DIFF";
        }

        rows.push({
          roomId,
          roomType: legacyRoom?.roomType ?? canonicalRoom?.roomType ?? null,
          directKey: legacyRoom?.messengerDirectKey ?? canonicalRoom?.directKey ?? null,
          contextMetaKind: legacyRoom?.contextMeta?.kind ?? canonicalRoom?.contextMeta?.kind ?? null,
          orderId:
            legacyRoom?.contextMeta?.kind === "delivery"
              ? legacyRoom.contextMeta.storeOrderId ?? null
              : canonicalRoom?.contextMeta?.kind === "delivery"
                ? canonicalRoom.contextMeta.storeOrderId ?? null
                : null,
          productChatId:
            legacyRoom?.contextMeta?.kind === "trade"
              ? legacyRoom.contextMeta.productChatId ?? null
              : canonicalRoom?.contextMeta?.kind === "trade"
                ? canonicalRoom.contextMeta.productChatId ?? null
                : null,
          legacyBucket,
          canonicalBucket,
          legacyVisible,
          canonicalVisible,
          legacyCanonicalKey: legacySummary
            ? tradeCanonicalKey(legacySummary) ?? deliveryCanonicalKey(legacySummary)
            : null,
          canonicalCanonicalKey: canonicalSummary
            ? tradeCanonicalKey(canonicalSummary) ?? deliveryCanonicalKey(canonicalSummary)
            : null,
          legacyLifecycleVisible,
          canonicalLifecycleVisible,
          legacyDedupeWinner: legacySummary
            ? isDedupeWinner(legacySummary, legacyBucket ?? "excluded", legacyRooms)
            : false,
          canonicalDedupeWinner: canonicalSummary
            ? isDedupeWinner(canonicalSummary, canonicalBucket ?? "excluded", canonicalSummaries)
            : false,
          lastCanonicalSource,
          branch,
        });
      }
      return rows.filter((row) => row.branch !== "NONE");
    },
  };
}

export type ProjectionOrderVariant = "dedupe_before_lifecycle" | "lifecycle_before_dedupe";

export function buildMessengerHomeProjectionWithOrder(
  rooms: Iterable<CanonicalMessengerHomeRoom>,
  viewerUserId: string,
  variant: ProjectionOrderVariant,
  nowMs: number = Date.now()
): MessengerHomeProjection {
  const base = buildMessengerHomeProjection(rooms, viewerUserId, { nowMs });
  if (variant === "dedupe_before_lifecycle") return base;

  const bucketByRoomId = new Map<string, MessengerHomeBucket>();
  const unreadByRoomId = new Map<string, number>();
  const tradeRooms: CommunityMessengerRoomSummary[] = [];
  const deliveryRooms: CommunityMessengerRoomSummary[] = [];
  const inboxRooms: CommunityMessengerRoomSummary[] = [];

  for (const room of rooms) {
    const bucket = resolveMessengerHomeBucket(room, viewerUserId);
    bucketByRoomId.set(room.roomId, bucket);
    unreadByRoomId.set(room.roomId, room.unreadCount);
    const summary = canonicalRoomToSummary(room);
    if (bucket === "trade") tradeRooms.push(summary);
    else if (bucket === "delivery") deliveryRooms.push(summary);
    else if (bucket === "direct" || bucket === "group") inboxRooms.push(summary);
  }

  const lifecycleFilter = (room: CommunityMessengerRoomSummary) => shouldShowCommerceChatInList(room, nowMs);
  const tradeLifecycle = tradeRooms.filter(lifecycleFilter);
  const deliveryLifecycle = deliveryRooms.filter(lifecycleFilter);
  const tradeDeduped = dedupeTradeMessengerRoomSummaries(tradeLifecycle);
  const deliveryDeduped = dedupeDeliveryMessengerRoomSummaries(deliveryLifecycle);

  return {
    tradeRoomIds: sortChatListRooms(tradeDeduped).map((room) => room.id),
    deliveryRoomIds: sortChatListRooms(deliveryDeduped).map((room) => room.id),
    inboxRoomIds: sortChatListRooms(inboxRooms).map((room) => room.id),
    bucketByRoomId,
    unreadByRoomId,
  };
}
