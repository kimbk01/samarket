/**
 * Phase 6 group Bootstrap API service + Persistent CachePort.
 */
import {
  buildDomainBootstrapApiResponse,
  DomainBootstrapHttpError,
  type DomainBootstrapApiResponse,
} from "@/lib/messenger/contracts/bootstrap-api-response";
import { createDomainPersistentCachePort } from "@/lib/messenger/contracts/persistent-cache-port";
import type { DomainTombstone } from "@/lib/messenger/contracts/domain-bootstrap-cache";
import { assertGroupViewerPermission } from "@/lib/messenger/group/permission";
import { buildGroupListSnapshot } from "@/lib/messenger/group/list";
import { GROUP_DOMAIN, type GroupListItem, type GroupRoomInput, type GroupSubtype } from "@/lib/messenger/group/types";
import { buildGroupRowModel } from "@/lib/messenger/group/row-model";

export const groupPhase6Cache = createDomainPersistentCachePort<GroupListItem>(GROUP_DOMAIN, "chat.group");

export type GroupBootstrapSource = Readonly<{
  loadRooms: (viewerUserId: string) => Promise<ReadonlyArray<GroupRoomInput & { memberUserIds?: string[] }>>;
}>;

export function createGroupFixtureBootstrapSource(
  rooms: ReadonlyArray<GroupRoomInput & { memberUserIds?: string[] }>
): GroupBootstrapSource {
  return { loadRooms: async () => rooms };
}

export async function runGroupBootstrap(input: {
  viewerUserId: string;
  generation: string;
  snapshotKind: "full" | "partial";
  source: GroupBootstrapSource;
  tombstones?: ReadonlyArray<DomainTombstone>;
}): Promise<DomainBootstrapApiResponse<GroupListItem, null>> {
  const viewerUserId = input.viewerUserId.trim();
  if (!viewerUserId) throw new DomainBootstrapHttpError(401, "unauthorized", "viewer required");
  const rooms = await input.source.loadRooms(viewerUserId);
  const authorized: GroupRoomInput[] = [];
  for (const room of rooms) {
    if (room.chatDomain && room.chatDomain !== GROUP_DOMAIN) {
      throw new DomainBootstrapHttpError(500, "foreign_domain", `foreign row:${room.chatDomain}`);
    }
    const subtype = (room.groupSubtype ?? "private_group") as GroupSubtype;
    try {
      assertGroupViewerPermission({
        viewerUserId,
        room: {
          roomId: String(room.roomId ?? ""),
          chatDomain: room.chatDomain,
          domainIdentityKey: room.domainIdentityKey,
          groupId: String(room.groupId ?? room.roomId ?? ""),
          subtype,
          memberUserIds: room.memberUserIds ?? [viewerUserId],
          openBrowseAllowed: subtype === "open_group",
        },
      });
      authorized.push(room);
    } catch {
      throw new DomainBootstrapHttpError(403, "forbidden", `room:${room.roomId}`);
    }
  }
  const listed = buildGroupListSnapshot({
    viewerUserId,
    generation: input.generation,
    rooms: authorized,
  });
  if (!listed.ok) throw new DomainBootstrapHttpError(500, listed.error, listed.error);
  return buildDomainBootstrapApiResponse({
    domain: GROUP_DOMAIN,
    viewerUserId,
    generation: listed.snapshot.generation,
    snapshotKind: input.snapshotKind,
    rows: listed.snapshot.rows,
    tombstones: input.tombstones,
    hub: null,
  });
}

export function groupSnapshotRowsToRowModels(rows: ReadonlyArray<GroupListItem>) {
  return rows.map(buildGroupRowModel);
}
