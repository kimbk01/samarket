/**
 * Phase 6 general_direct Bootstrap API service + Persistent CachePort.
 */
import {
  buildDomainBootstrapApiResponse,
  DomainBootstrapHttpError,
  type DomainBootstrapApiResponse,
} from "@/lib/messenger/contracts/bootstrap-api-response";
import { createDomainPersistentCachePort } from "@/lib/messenger/contracts/persistent-cache-port";
import type { DomainTombstone } from "@/lib/messenger/contracts/domain-bootstrap-cache";
import {
  assertGeneralDirectViewerPermission,
} from "@/lib/messenger/general-direct/permission";
import { parseGeneralDirectIdentityKey } from "@/lib/messenger/general-direct/identity";
import { buildGeneralDirectListSnapshot } from "@/lib/messenger/general-direct/list";
import { GENERAL_DIRECT_DOMAIN, type GeneralDirectListItem, type GeneralDirectRoomInput } from "@/lib/messenger/general-direct/types";
import { buildGeneralDirectRowModel } from "@/lib/messenger/general-direct/row-model";

export const generalDirectPhase6Cache = createDomainPersistentCachePort<GeneralDirectListItem>(
  GENERAL_DIRECT_DOMAIN,
  "chat.general"
);

export type GeneralDirectBootstrapSource = Readonly<{
  loadRooms: (viewerUserId: string) => Promise<ReadonlyArray<GeneralDirectRoomInput>>;
}>;

export function createGeneralDirectFixtureBootstrapSource(
  rooms: ReadonlyArray<GeneralDirectRoomInput>
): GeneralDirectBootstrapSource {
  return {
    loadRooms: async () => rooms,
  };
}

export async function runGeneralDirectBootstrap(input: {
  viewerUserId: string;
  generation: string;
  snapshotKind: "full" | "partial";
  source: GeneralDirectBootstrapSource;
  tombstones?: ReadonlyArray<DomainTombstone>;
}): Promise<DomainBootstrapApiResponse<GeneralDirectListItem, null>> {
  const viewerUserId = input.viewerUserId.trim();
  if (!viewerUserId) throw new DomainBootstrapHttpError(401, "unauthorized", "viewer required");

  const rooms = await input.source.loadRooms(viewerUserId);
  for (const room of rooms) {
    if (room.chatDomain && room.chatDomain !== GENERAL_DIRECT_DOMAIN) {
      throw new DomainBootstrapHttpError(500, "foreign_domain", `foreign row:${room.chatDomain}`);
    }
  }

  const authorized: GeneralDirectRoomInput[] = [];
  for (const room of rooms) {
    try {
      const identityKey = String(room.domainIdentityKey ?? "");
      const { userA, userB } = parseGeneralDirectIdentityKey(identityKey);
      assertGeneralDirectViewerPermission({
        viewerUserId,
        room: {
          roomId: String(room.roomId ?? ""),
          chatDomain: room.chatDomain,
          domainIdentityKey: identityKey,
          // viewer 를 합성으로 끼워 넣지 않음 — Identity 쌍만 참여자로 사용
          participantUserIds: [userA, userB],
        },
      });
      authorized.push(room);
    } catch {
      throw new DomainBootstrapHttpError(403, "forbidden", `room:${room.roomId}`);
    }
  }

  const listed = buildGeneralDirectListSnapshot({
    viewerUserId,
    generation: input.generation,
    rooms: authorized,
  });
  if (!listed.ok) {
    throw new DomainBootstrapHttpError(500, listed.error, listed.error);
  }

  return buildDomainBootstrapApiResponse({
    domain: GENERAL_DIRECT_DOMAIN,
    viewerUserId,
    generation: listed.snapshot.generation,
    snapshotKind: input.snapshotKind,
    rows: listed.snapshot.rows,
    tombstones: input.tombstones,
    hub: null,
  });
}

export function generalDirectSnapshotRowsToRowModels(rows: ReadonlyArray<GeneralDirectListItem>) {
  return rows.map(buildGeneralDirectRowModel);
}
