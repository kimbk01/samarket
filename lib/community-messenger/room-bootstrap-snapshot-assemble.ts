/**
 * Parse unified room bootstrap snapshot RPC payload → wave A state (CPU-only downstream).
 */
import { sliceGroupParticipantsForRoomBootstrap } from "@/lib/community-messenger/service";
import {
  COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP,
  COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT,
  isCommunityMessengerGroupRoomType,
  type CommunityMessengerRoomType,
} from "@/lib/community-messenger/types";

export type RoomBootstrapSnapshotPayloadJson = {
  room?: Record<string, unknown> | null;
  participants?: unknown[];
  messages?: unknown[];
  message_limit?: number;
  has_more_older_messages?: boolean;
  snapshot_tier?: string;
  viewer_unread_count?: number;
  updated_at?: string;
};

export type RoomBootstrapSnapshotWaveA = {
  room: Record<string, unknown>;
  participants: unknown[];
  messages: unknown[];
  embeddedProfiles: Map<
    string,
    {
      id: string;
      display_name: string | null;
      nickname: string | null;
      username: string | null;
      avatar_url: string | null;
      bio: null;
    }
  >;
  roomTotalMemberCount: number;
  membersTruncated: boolean;
  snapshotBootstrapInitialMessageLimit: number;
  snapshotHasMoreOlderMessages: boolean;
};

function trimText(v: unknown): string {
  return String(v ?? "").trim();
}

function parseParticipantsWithProfiles(raw: unknown[]): {
  rows: unknown[];
  profiles: Map<
    string,
    {
      id: string;
      display_name: string | null;
      nickname: string | null;
      username: string | null;
      avatar_url: string | null;
      bio: null;
    }
  >;
} {
  const rows: unknown[] = [];
  const profiles = new Map<
    string,
    {
      id: string;
      display_name: string | null;
      nickname: string | null;
      username: string | null;
      avatar_url: string | null;
      bio: null;
    }
  >();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const profRaw = row.profiles;
    const { profiles: _drop, ...rest } = row;
    rows.push(rest);
    if (profRaw && typeof profRaw === "object" && !Array.isArray(profRaw)) {
      const pr = profRaw as Record<string, unknown>;
      const id = trimText(pr.id ?? row.user_id);
      if (!id) continue;
      profiles.set(id, {
        id,
        display_name: (pr.display_name as string | null) ?? null,
        nickname: (pr.nickname as string | null) ?? null,
        username: (pr.username as string | null) ?? null,
        avatar_url: (pr.avatar_url as string | null) ?? null,
        bio: null,
      });
    }
  }
  return { rows, profiles };
}

export function parseRoomBootstrapSnapshotPayload(
  userId: string,
  payload: RoomBootstrapSnapshotPayloadJson
): RoomBootstrapSnapshotWaveA | null {
  const roomRaw = payload.room;
  if (!roomRaw || typeof roomRaw !== "object") return null;

  const participantArr = Array.isArray(payload.participants) ? payload.participants : [];
  const { rows: rawParticipantRows, profiles: embeddedProfiles } =
    parseParticipantsWithProfiles(participantArr);

  const viewerInList = rawParticipantRows.some(
    (p) => trimText((p as Record<string, unknown>).user_id) === userId
  );
  if (!viewerInList) return null;

  const roomType = trimText(roomRaw.room_type) as CommunityMessengerRoomType;
  let participants: unknown[] = rawParticipantRows;
  let membersTruncated = false;
  const roomTotalMemberCount = rawParticipantRows.length;

  if (
    isCommunityMessengerGroupRoomType(roomType) &&
    rawParticipantRows.length > COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP
  ) {
    const sliced = sliceGroupParticipantsForRoomBootstrap(
      rawParticipantRows as Parameters<typeof sliceGroupParticipantsForRoomBootstrap>[0],
      userId,
      COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP
    );
    participants = sliced.rows;
    membersTruncated = sliced.truncated;
  } else if (rawParticipantRows.length > COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP) {
    participants = rawParticipantRows.slice(0, COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP);
    membersTruncated = true;
  }

  const messageLimit = Math.max(
    1,
    Math.floor(Number(payload.message_limit) || COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT)
  );
  const messages = Array.isArray(payload.messages) ? payload.messages.slice() : [];

  return {
    room: roomRaw,
    participants,
    messages,
    embeddedProfiles,
    roomTotalMemberCount,
    membersTruncated,
    snapshotBootstrapInitialMessageLimit: messageLimit,
    snapshotHasMoreOlderMessages: Boolean(payload.has_more_older_messages),
  };
}

export function parseRoomBootstrapSnapshotRpcData(data: unknown): RoomBootstrapSnapshotPayloadJson | null {
  if (!data || typeof data !== "object") return null;
  return data as RoomBootstrapSnapshotPayloadJson;
}
