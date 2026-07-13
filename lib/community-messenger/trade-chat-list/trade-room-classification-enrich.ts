/**
 * home-sync `deferTradeMetaEnrich` 경로 — pillar/inbox 분류에 필요한 최소 trade contextMeta 만 동기 적용.
 * 썸네일·category·seller hydrate 는 클라 `trade-chat-list-meta` 가 담당한다.
 */
import {
  communityMessengerRoomIsConfirmedTrade,
  isMessengerCommerceDirectKey,
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
      s.contextMeta?.kind !== "delivery"
  );
}

/** 분류 전용 Phase D — general friend DM 도 peer-pair 로 trade kind 확정(썸네일 enrich Phase D 와 분리). */
function summaryEligibleForClassificationPhaseD(
  room: Pick<CommunityMessengerRoomSummary, "roomType" | "contextMeta" | "messengerDirectKey">
): boolean {
  if (room.roomType !== "direct") return false;
  if (room.contextMeta?.kind === "delivery") return false;
  if (isMessengerCommerceDirectKey(room.messengerDirectKey)) return false;
  return true;
}

/** home-sync defer — product_chats.room_id / item_trade ledger / peer-pair 로 trade kind 확정 */
export async function enrichTradeRoomClassificationForDeferredHomeSync(
  sb: ClassificationSupabase | null | undefined,
  viewerUserId: string,
  summaries: CommunityMessengerRoomSummary[]
): Promise<void> {
  const viewer = trim(viewerUserId);
  if (!sb || !viewer || summaries.length === 0) return;

  const targets = directTargetsNeedingClassification(summaries);
  if (!targets.length) return;

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
    const fromPc = pcByRoomId.get(rid);
    if (fromPc) {
      assignMinimalTradeContextMeta(summary, fromPc);
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

  const phaseDTargets = summaries.filter(
    (s) =>
      summaryEligibleForClassificationPhaseD(s) &&
      !communityMessengerRoomIsConfirmedTrade(s) &&
      trim(s.peerUserId)
  );
  const peers = [...new Set(phaseDTargets.map((s) => trim(s.peerUserId)).filter(Boolean))];
  if (!peers.length) return;

  const [{ data: pcSellerMe }, { data: pcBuyerMe }] = await Promise.all([
    sbAny
      .from("product_chats")
      .select("id, post_id, seller_id, buyer_id, updated_at, community_messenger_room_id")
      .eq("seller_id", viewer)
      .in("buyer_id", peers),
    sbAny
      .from("product_chats")
      .select("id, post_id, seller_id, buyer_id, updated_at, community_messenger_room_id")
      .eq("buyer_id", viewer)
      .in("seller_id", peers),
  ]);

  type PcPairRow = {
    id: string;
    postId?: string;
    updatedAt: string;
    cmRoomId: string;
  };
  const byPeer = new Map<string, PcPairRow[]>();
  const pushRow = (row: Record<string, unknown>) => {
    const id = trim(row.id);
    const postId = trim(row.post_id);
    const sellerId = trim(row.seller_id);
    const buyerId = trim(row.buyer_id);
    if (!id || !sellerId || !buyerId) return;
    const peer = viewer === sellerId ? buyerId : viewer === buyerId ? sellerId : "";
    if (!peer || !peers.includes(peer)) return;
    const rec: PcPairRow = {
      id,
      ...(postId ? { postId } : {}),
      updatedAt: trim(row.updated_at) || "",
      cmRoomId: trim(row.community_messenger_room_id),
    };
    const list = byPeer.get(peer) ?? [];
    list.push(rec);
    byPeer.set(peer, list);
  };
  for (const row of (pcSellerMe ?? []) as Array<Record<string, unknown>>) pushRow(row);
  for (const row of (pcBuyerMe ?? []) as Array<Record<string, unknown>>) pushRow(row);

  const pickPcForRoom = (
    roomId: string,
    peer: string,
    opts?: { allowOrphanFallback?: boolean }
  ): PcPairRow | null => {
    const list = byPeer.get(peer);
    if (!list?.length) return null;
    const linked = list.find((r) => r.cmRoomId && r.cmRoomId === roomId);
    if (linked) return linked;
    if (opts?.allowOrphanFallback === false) return null;
    /** 다른 CM 방에 이미 FK 된 product_chat 은 friend DM peer-pair fallback 대상에서 제외 */
    const orphans = list.filter((r) => !r.cmRoomId);
    if (!orphans.length) return null;
    const sorted = [...orphans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return sorted[0] ?? null;
  };

  const generalFriendRoomsByPeer = new Map<string, number>();
  for (const summary of phaseDTargets) {
    const peer = trim(summary.peerUserId);
    if (!peer) continue;
    generalFriendRoomsByPeer.set(peer, (generalFriendRoomsByPeer.get(peer) ?? 0) + 1);
  }

  for (const summary of phaseDTargets) {
    if (communityMessengerRoomIsConfirmedTrade(summary)) continue;
    const peer = trim(summary.peerUserId);
    if (!peer) continue;
    const peerGeneralFriendRoomCount = generalFriendRoomsByPeer.get(peer) ?? 0;
    const pc = pickPcForRoom(summary.id, peer, {
      allowOrphanFallback: peerGeneralFriendRoomCount === 1,
    });
    if (!pc) continue;
    assignMinimalTradeContextMeta(summary, {
      productChatId: pc.id,
      ...(pc.postId ? { postId: pc.postId } : {}),
    });
  }
}

