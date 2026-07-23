/**
 * Phase 11A — general_direct DB Loader (batch).
 * DB row → Domain RoomInput → BootstrapPort. Shell/raw 전달 금지.
 */
import {
  assertNoDuplicateDomainIdentity,
  pickAuthoritativeMessagePreview,
  type DomainLoaderLatestMessageRow,
} from "@/lib/messenger/contracts/domain-loader-batch-phase11a";
import type { GeneralDirectBootstrapSource } from "@/lib/messenger/general-direct/phase6-bootstrap";
import { parseGeneralDirectIdentityKey } from "@/lib/messenger/general-direct/identity";
import {
  GENERAL_DIRECT_DOMAIN,
  type GeneralDirectRoomInput,
} from "@/lib/messenger/general-direct/types";

export type GeneralDirectLoaderBatchRow = Readonly<{
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
  unreadCount: number;
  peerUserId: string;
  peerDisplayName: string | null;
  peerAvatarUrl: string | null;
  latestMessage: DomainLoaderLatestMessageRow | null;
  /** ignored for preview */
  roomLastMessageSummary?: string | null;
  roomTitle?: string | null;
}>;

/**
 * Batch rows → validated RoomInput[].
 * - foreign domain / identity mismatch / viewer not in pair → drop or throw
 * - duplicate identity → throw
 */
export function mapGeneralDirectLoaderBatchRows(input: {
  viewerUserId: string;
  rows: ReadonlyArray<GeneralDirectLoaderBatchRow>;
  /** when true, foreign/unauthorized rows throw 403-style instead of silent drop */
  failClosedOnUnauthorized?: boolean;
}): ReadonlyArray<GeneralDirectRoomInput> {
  const viewer = input.viewerUserId.trim();
  const out: GeneralDirectRoomInput[] = [];
  for (const row of input.rows) {
    if (row.chatDomain !== GENERAL_DIRECT_DOMAIN) {
      throw new Error(`dibay_gd_loader_foreign_domain:${row.chatDomain}`);
    }
    if (!row.domainIdentityKey.startsWith("general_direct:")) {
      throw new Error("dibay_gd_loader_identity_prefix_mismatch");
    }
    let pair: { userA: string; userB: string };
    try {
      pair = parseGeneralDirectIdentityKey(row.domainIdentityKey);
    } catch {
      throw new Error("dibay_gd_loader_identity_invalid");
    }
    if (pair.userA !== viewer && pair.userB !== viewer) {
      if (input.failClosedOnUnauthorized) {
        throw new Error(`dibay_gd_loader_forbidden:${row.roomId}`);
      }
      continue;
    }
    const peer =
      row.peerUserId.trim() ||
      (pair.userA === viewer ? pair.userB : pair.userA);
    out.push({
      roomId: row.roomId,
      chatDomain: GENERAL_DIRECT_DOMAIN,
      domainIdentityKey: row.domainIdentityKey,
      peerUserId: peer,
      peerDisplayName: row.peerDisplayName,
      peerAvatarUrl: row.peerAvatarUrl,
      lastMessage: pickAuthoritativeMessagePreview({
        latestMessage: row.latestMessage,
        roomLastMessageSummary: row.roomLastMessageSummary,
        roomTitle: row.roomTitle,
      }),
      lastMessageAt: row.latestMessage?.createdAt ?? null,
      unreadCount: row.unreadCount,
    });
  }
  assertNoDuplicateDomainIdentity(
    out.map((r) => ({
      domainIdentityKey: String(r.domainIdentityKey),
      roomId: String(r.roomId),
    })),
    GENERAL_DIRECT_DOMAIN
  );
  return out;
}

export function createGeneralDirectDbLoaderSource(
  loadBatch: (viewerUserId: string) => Promise<ReadonlyArray<GeneralDirectLoaderBatchRow>>
): GeneralDirectBootstrapSource {
  return {
    loadRooms: async (viewerUserId) =>
      mapGeneralDirectLoaderBatchRows({
        viewerUserId,
        rows: await loadBatch(viewerUserId),
        failClosedOnUnauthorized: true,
      }),
  };
}

/** In-memory batch client — simulates 3-query budget without N+1 */
export function createGeneralDirectInMemoryLoaderSource(
  seed: ReadonlyArray<GeneralDirectLoaderBatchRow>
): GeneralDirectBootstrapSource {
  return createGeneralDirectDbLoaderSource(async (viewerUserId) => {
    // simulate server-side filter: only rows viewer participates
    return seed.filter((r) => {
      if (r.chatDomain !== GENERAL_DIRECT_DOMAIN) return false;
      try {
        const { userA, userB } = parseGeneralDirectIdentityKey(r.domainIdentityKey);
        return userA === viewerUserId || userB === viewerUserId;
      } catch {
        return false;
      }
    });
  });
}

export const GENERAL_DIRECT_LOADER_SQL_PLAN = {
  q1: `SELECT r.id, r.chat_domain, r.domain_identity_key, p.unread_count
       FROM community_messenger_rooms r
       INNER JOIN community_messenger_participants p ON p.room_id = r.id
       WHERE p.user_id = $viewer AND r.chat_domain = 'general_direct'`,
  q2: `SELECT DISTINCT ON (room_id) room_id, body, is_system, created_at
       FROM community_messenger_messages WHERE room_id = ANY($room_ids)
       ORDER BY room_id, created_at DESC`,
  q3: `SELECT id, display_name, avatar_url FROM profiles WHERE id = ANY($peer_ids)`,
  nPlusOne: false,
} as const;
