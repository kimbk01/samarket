/**
 * general_direct ListPort — general_direct 방만 반환. fail-closed.
 * 임의 pair 병합 금지. 중복 identity 는 계약 오류.
 */
import { parseGeneralDirectIdentityKey } from "@/lib/messenger/general-direct/identity";
import {
  GENERAL_DIRECT_DOMAIN,
  GENERAL_DIRECT_PEER_PLACEHOLDER_NAME,
  type GeneralDirectListItem,
  type GeneralDirectListSnapshot,
  type GeneralDirectRoomInput,
} from "@/lib/messenger/general-direct/types";

export type GeneralDirectListPortResult =
  | { ok: true; snapshot: GeneralDirectListSnapshot }
  | { ok: false; error: string };

function trimOrEmpty(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

function rejectForeignOrInvalid(row: GeneralDirectRoomInput): string | null {
  const domain = trimOrEmpty(row.chatDomain as string | null | undefined);
  const identityKey = trimOrEmpty(row.domainIdentityKey);
  if (!domain) return "dibay_general_direct_domain_missing";
  if (domain === "group" || domain === "trade" || domain === "store_order") {
    return `dibay_general_direct_rejects_${domain}`;
  }
  if (domain !== GENERAL_DIRECT_DOMAIN) return "dibay_general_direct_domain_mismatch";
  if (!identityKey) return "dibay_general_direct_identity_missing";
  if (!identityKey.startsWith("general_direct:")) return "dibay_general_direct_identity_prefix_mismatch";
  try {
    parseGeneralDirectIdentityKey(identityKey);
  } catch (e) {
    return e instanceof Error ? e.message : "dibay_general_direct_identity_invalid";
  }
  if (!trimOrEmpty(row.roomId)) return "dibay_general_direct_room_id_required";
  if (!trimOrEmpty(row.peerUserId)) return "dibay_general_direct_peer_required";
  return null;
}

export function mapGeneralDirectListItem(
  row: GeneralDirectRoomInput,
  generation: string
): GeneralDirectListItem {
  const err = rejectForeignOrInvalid(row);
  if (err) throw new Error(err);

  const peerName = trimOrEmpty(row.peerDisplayName) || GENERAL_DIRECT_PEER_PLACEHOLDER_NAME;
  const lastAt = trimOrEmpty(row.lastMessageAt) || trimOrEmpty(row.updatedAt) || "";
  return {
    roomId: trimOrEmpty(row.roomId),
    chatDomain: GENERAL_DIRECT_DOMAIN,
    domainIdentityKey: trimOrEmpty(row.domainIdentityKey),
    peerUserId: trimOrEmpty(row.peerUserId),
    peerDisplayName: peerName,
    peerAvatarUrl: trimOrEmpty(row.peerAvatarUrl) || null,
    lastMessage: trimOrEmpty(row.lastMessage),
    lastMessageAt: lastAt,
    unreadCount: Math.max(0, Math.floor(Number(row.unreadCount) || 0)),
    updatedAt: trimOrEmpty(row.updatedAt) || lastAt,
    generation,
  };
}

/**
 * Fixture / repository adapter 입력 → general_direct snapshot.
 * 타 Domain 이 하나라도 있으면 전체 fail-closed (추측·필터 통과 금지).
 * 동일 domainIdentityKey 가 2개 이상이면 병합하지 않고 오류.
 */
export function buildGeneralDirectListSnapshot(input: {
  viewerUserId: string;
  generation: string;
  rooms: ReadonlyArray<GeneralDirectRoomInput>;
}): GeneralDirectListPortResult {
  const viewerUserId = input.viewerUserId.trim();
  if (!viewerUserId) return { ok: false, error: "dibay_general_direct_viewer_required" };
  const generation = input.generation.trim() || "0";

  const seenIdentity = new Map<string, string>();
  const rows: GeneralDirectListItem[] = [];

  for (const room of input.rooms) {
    const foreign = rejectForeignOrInvalid(room);
    if (foreign) return { ok: false, error: foreign };
    let item: GeneralDirectListItem;
    try {
      item = mapGeneralDirectListItem(room, generation);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "dibay_general_direct_list_map_failed" };
    }
    const prevRoom = seenIdentity.get(item.domainIdentityKey);
    if (prevRoom && prevRoom !== item.roomId) {
      return {
        ok: false,
        error: `dibay_general_direct_duplicate_identity:${item.domainIdentityKey}`,
      };
    }
    seenIdentity.set(item.domainIdentityKey, item.roomId);
    rows.push(item);
  }

  return {
    ok: true,
    snapshot: {
      domain: GENERAL_DIRECT_DOMAIN,
      viewerUserId,
      generation,
      rows,
    },
  };
}

/** 테스트용: 타 Domain 포함 배치에서 accept 가능한 행만 고르지 않음 — 전체 reject 검증용 헬퍼와 대비 */
export function generalDirectListAcceptsOnlyOwnDomain(rooms: ReadonlyArray<GeneralDirectRoomInput>): boolean {
  return rooms.every((r) => rejectForeignOrInvalid(r) === null);
}
