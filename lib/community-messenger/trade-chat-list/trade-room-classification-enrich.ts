/**
 * home-sync `deferTradeMetaEnrich` 경로 — pillar/inbox 분류에 필요한 최소 trade contextMeta 만 동기 적용.
 * 썸네일·category·seller hydrate 는 클라 `trade-chat-list-meta` 가 담당한다.
 *
 * CONTRACT (4 domain): general friend pair-key 방에는 trade contextMeta 를 절대 부여하지 않는다.
 * orphan product_chat peer-pair fallback 로 GD 를 trade 로 재분류하는 경로 금지.
 */
import {
  newDomainSeparationCorrelationId,
  traceDomainSeparation,
} from "@/lib/chat-domain/domain-separation-trace";
import {
  communityMessengerRoomIsConfirmedTrade,
  isMessengerCommerceDirectKey,
  isMessengerGeneralFriendDirectKey,
} from "@/lib/community-messenger/messenger-room-domain";
import { parseTradeMessengerDirectKey } from "@/lib/messenger-policy/parse-trade-messenger-direct-key";
import type { CommunityMessengerRoomContextMetaV1, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

type ClassificationSupabase = {
  from: (table: string) => { select: (cols: string) => unknown };
};

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function assignMinimalTradeContextMeta(
  summary: CommunityMessengerRoomSummary,
  patch: { productChatId: string; postId?: string }
): void {
  if (communityMessengerRoomIsConfirmedTrade(summary)) return;
  /** GD pair key — never stamp trade (friend room must stay general_direct). */
  if (isMessengerGeneralFriendDirectKey(summary.messengerDirectKey)) return;
  if (summary.chatDomain === "general_direct" || summary.chatDomain === "group" || summary.chatDomain === "store_order") {
    return;
  }
  const productChatId = trim(patch.productChatId);
  const postId = trim(patch.postId);
  if (!productChatId) return;
  const prev = summary.contextMeta?.kind === "trade" ? summary.contextMeta : null;
  const next: CommunityMessengerRoomContextMetaV1 = {
    ...(prev ?? {}),
    v: 1,
    kind: "trade",
    productChatId,
    ...(postId ? { postId } : {}),
  };
  summary.contextMeta = next;
}

function directTargetsNeedingClassification(
  summaries: CommunityMessengerRoomSummary[]
): CommunityMessengerRoomSummary[] {
  return summaries.filter(
    (s) =>
      s.roomType === "direct" &&
      !communityMessengerRoomIsConfirmedTrade(s) &&
      s.contextMeta?.kind !== "delivery" &&
      !isMessengerGeneralFriendDirectKey(s.messengerDirectKey) &&
      s.chatDomain !== "general_direct"
  );
}

/**
 * Classification Phase D — commerce-key / unknown direct only.
 * DO NOT include general friend DM (pair key); that path stamped trade onto GF and hid it from inbox.
 */
function summaryEligibleForClassificationPhaseD(
  room: Pick<CommunityMessengerRoomSummary, "roomType" | "contextMeta" | "messengerDirectKey" | "chatDomain">
): boolean {
  if (room.roomType !== "direct") return false;
  if (room.contextMeta?.kind === "delivery") return false;
  if (room.chatDomain === "general_direct" || room.chatDomain === "group" || room.chatDomain === "store_order") {
    return false;
  }
  if (isMessengerGeneralFriendDirectKey(room.messengerDirectKey)) return false;
  if (isMessengerCommerceDirectKey(room.messengerDirectKey)) return false;
  return true;
}

/** home-sync defer — product_chats FK / item_trade ledger / trade_pc key 로만 trade kind 확정 */
export async function enrichTradeRoomClassificationForDeferredHomeSync(
  sb: ClassificationSupabase | null | undefined,
  viewerUserId: string,
  summaries: CommunityMessengerRoomSummary[]
): Promise<void> {
  const viewer = trim(viewerUserId);
  if (!sb || !viewer || summaries.length === 0) return;

  const correlationId = newDomainSeparationCorrelationId();
  const targets = directTargetsNeedingClassification(summaries);
  if (!targets.length) {
    traceDomainSeparation({
      correlationId,
      phase: "classification_enrich",
      writer: "enrichTradeRoomClassificationForDeferredHomeSync",
      reason: "no_targets",
      viewer,
    });
    return;
  }

  const roomIds = targets.map((s) => s.id).filter(Boolean);
  // Supabase query builder — duck-typed like commerce lifecycle enrich
  const sbAny = sb as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => { in: (col: string, vals: string[]) => Promise<{ data: unknown }> };
        in: (col: string, vals: string[]) => Promise<{ data: unknown }>;
      };
    };
  };

  const { data: pcByRoomRows } = await sbAny
    .from("product_chats")
    .select("id, post_id, community_messenger_room_id")
    .in("community_messenger_room_id", roomIds);
  const pcByRoomId = new Map<string, { productChatId: string; postId?: string }>();
  for (const row of (pcByRoomRows ?? []) as Array<Record<string, unknown>>) {
    const roomId = trim(row.community_messenger_room_id);
    const productChatId = trim(row.id);
    const postId = trim(row.post_id);
    if (!roomId || !productChatId || pcByRoomId.has(roomId)) continue;
    pcByRoomId.set(roomId, { productChatId, ...(postId ? { postId } : {}) });
  }

  const { data: ledgerRows } = await sbAny
    .from("chat_rooms")
    .select("id, item_id, community_messenger_room_id")
    .eq("room_type", "item_trade")
    .in("community_messenger_room_id", roomIds);
  const ledgerByRoomId = new Map<string, { productChatId: string; postId: string }>();
  for (const row of (ledgerRows ?? []) as Array<Record<string, unknown>>) {
    const roomId = trim(row.community_messenger_room_id);
    const productChatId = trim(row.id);
    const postId = trim(row.item_id);
    if (!roomId || !productChatId || !postId || ledgerByRoomId.has(roomId)) continue;
    ledgerByRoomId.set(roomId, { productChatId, postId });
  }

  for (const summary of targets) {
    const rid = summary.id;
    if (isMessengerGeneralFriendDirectKey(summary.messengerDirectKey)) {
      traceDomainSeparation({
        correlationId,
        phase: "classification_enrich",
        writer: "enrichTradeRoomClassificationForDeferredHomeSync",
        reason: "skipped_general_key",
        roomId: rid,
      });
      continue;
    }
    const fromPc = pcByRoomId.get(rid);
    if (fromPc) {
      assignMinimalTradeContextMeta(summary, fromPc);
      if (summary.contextMeta?.kind === "trade") {
        traceDomainSeparation({
          correlationId,
          phase: "classification_enrich",
          writer: "enrichTradeRoomClassificationForDeferredHomeSync",
          reason: "pc_fk",
          roomId: rid,
          productChatId: fromPc.productChatId,
        });
      }
      continue;
    }
    const fromLedger = ledgerByRoomId.get(rid);
    if (fromLedger) {
      assignMinimalTradeContextMeta(summary, fromLedger);
      continue;
    }
    const parsed = parseTradeMessengerDirectKey(summary.messengerDirectKey);
    if (parsed?.kind === "trade_pc") {
      assignMinimalTradeContextMeta(summary, { productChatId: parsed.productChatId });
    }
  }

  /**
   * Phase D peer-pair orphan fallback REMOVED.
   * It stamped trade onto the sole general friend room when product_chats FK was still null.
   * Remaining targets without commerce key stay unclassified (not trade).
   */
  const phaseDEligible = summaries.filter(
    (s) =>
      summaryEligibleForClassificationPhaseD(s) &&
      !communityMessengerRoomIsConfirmedTrade(s) &&
      trim(s.peerUserId)
  );
  if (phaseDEligible.length > 0) {
    traceDomainSeparation({
      correlationId,
      phase: "classification_enrich",
      writer: "enrichTradeRoomClassificationForDeferredHomeSync",
      reason: "orphan_peer_pair_disabled",
      skippedCount: phaseDEligible.length,
    });
  }
}
