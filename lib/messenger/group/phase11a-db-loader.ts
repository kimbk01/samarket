/**
 * Phase 11A — group DB Loader (batch). Peer 를 group title/avatar 로 사용 금지.
 */
import {
  assertNoDuplicateDomainIdentity,
  pickAuthoritativeMessagePreview,
  type DomainLoaderLatestMessageRow,
} from "@/lib/messenger/contracts/domain-loader-batch-phase11a";
import type { GroupBootstrapSource } from "@/lib/messenger/group/phase6-bootstrap";
import {
  GROUP_DOMAIN,
  type GroupRoomInput,
  type GroupSubtype,
} from "@/lib/messenger/group/types";

export type GroupLoaderBatchRow = Readonly<{
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
  groupId: string;
  groupSubtype: GroupSubtype;
  groupName: string | null;
  groupImageUrl: string | null;
  memberCount: number;
  unreadCount: number;
  /** membership — private requires viewer in list */
  memberUserIds: ReadonlyArray<string>;
  openBrowseAllowed?: boolean;
  latestMessage: DomainLoaderLatestMessageRow | null;
  roomLastMessageSummary?: string | null;
  /** forbidden as title */
  peerDisplayName?: string | null;
}>;

export function mapGroupLoaderBatchRows(input: {
  viewerUserId: string;
  rows: ReadonlyArray<GroupLoaderBatchRow>;
  failClosedOnUnauthorized?: boolean;
}): ReadonlyArray<GroupRoomInput & { memberUserIds: string[] }> {
  const viewer = input.viewerUserId.trim();
  const out: Array<GroupRoomInput & { memberUserIds: string[] }> = [];
  for (const row of input.rows) {
    if (row.chatDomain !== GROUP_DOMAIN) {
      throw new Error(`dibay_group_loader_foreign_domain:${row.chatDomain}`);
    }
    if (!row.domainIdentityKey.startsWith("group:")) {
      throw new Error("dibay_group_loader_identity_prefix_mismatch");
    }
    const expected = `group:${row.groupId}`;
    if (row.domainIdentityKey !== expected && row.domainIdentityKey !== `group:${row.roomId}`) {
      throw new Error("dibay_group_loader_identity_mismatch");
    }
    const isMember = row.memberUserIds.includes(viewer);
    const openOk =
      row.groupSubtype === "open_group" && (row.openBrowseAllowed ?? true);
    if (!isMember && !openOk) {
      if (input.failClosedOnUnauthorized) {
        throw new Error(`dibay_group_loader_forbidden:${row.roomId}`);
      }
      continue;
    }
    // peer must never become group title/avatar
    void row.peerDisplayName;
    out.push({
      roomId: row.roomId,
      chatDomain: GROUP_DOMAIN,
      domainIdentityKey: row.domainIdentityKey,
      groupId: row.groupId,
      groupSubtype: row.groupSubtype,
      groupName: row.groupName,
      groupImageUrl: row.groupImageUrl,
      memberCount: row.memberCount,
      lastMessage: pickAuthoritativeMessagePreview({
        latestMessage: row.latestMessage,
        roomLastMessageSummary: row.roomLastMessageSummary,
      }),
      lastMessageAt: row.latestMessage?.createdAt ?? null,
      unreadCount: row.unreadCount,
      memberUserIds: [...row.memberUserIds],
    });
  }
  assertNoDuplicateDomainIdentity(
    out.map((r) => ({
      domainIdentityKey: String(r.domainIdentityKey),
      roomId: String(r.roomId),
    })),
    GROUP_DOMAIN
  );
  return out;
}

export function createGroupDbLoaderSource(
  loadBatch: (viewerUserId: string) => Promise<ReadonlyArray<GroupLoaderBatchRow>>
): GroupBootstrapSource {
  return {
    loadRooms: async (viewerUserId) =>
      mapGroupLoaderBatchRows({
        viewerUserId,
        rows: await loadBatch(viewerUserId),
        failClosedOnUnauthorized: true,
      }),
  };
}

export function createGroupInMemoryLoaderSource(
  seed: ReadonlyArray<GroupLoaderBatchRow>
): GroupBootstrapSource {
  return createGroupDbLoaderSource(async (viewerUserId) =>
    seed.filter((r) => {
      if (r.chatDomain !== GROUP_DOMAIN) return false;
      const isMember = r.memberUserIds.includes(viewerUserId);
      const openOk = r.groupSubtype === "open_group" && (r.openBrowseAllowed ?? true);
      return isMember || openOk;
    })
  );
}

export const GROUP_LOADER_SQL_PLAN = {
  q1: `rooms chat_domain=group + membership / open policy`,
  q2: `latest messages ANY(room_ids)`,
  q3: `group name/image/member_count from group profile (not peer)`,
  nPlusOne: false,
} as const;
