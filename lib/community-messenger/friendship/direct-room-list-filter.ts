import { batchResolveCommunityMessengerFriendshipStatus } from "@/lib/community-messenger/friendship/friendship-resolver";
import {
  isGeneralCommunityDirectKey,
  peerIdFromDirectKey,
  trimFriendshipText,
} from "@/lib/community-messenger/friendship/friendship-utils";

type DirectRoomLike = {
  id: string;
  room_type?: string;
  roomType?: string;
  direct_key?: string | null;
  directKey?: string | null;
};

export async function filterGeneralDirectRoomsByFriendshipAccepted<T extends DirectRoomLike>(
  viewerUserId: string,
  roomRows: T[]
): Promise<T[]> {
  const viewer = trimFriendshipText(viewerUserId);
  if (!viewer || !roomRows.length) return roomRows;

  const generalRooms: Array<{ room: T; peerId: string }> = [];
  for (const room of roomRows) {
    const type = trimFriendshipText(room.room_type ?? room.roomType);
    const key = trimFriendshipText(room.direct_key ?? room.directKey);
    if (type !== "direct" || !isGeneralCommunityDirectKey(key)) continue;
    const peerId = peerIdFromDirectKey(key, viewer);
    if (peerId) generalRooms.push({ room, peerId });
  }
  if (!generalRooms.length) return roomRows;

  const peerIds = generalRooms.map((item) => item.peerId);
  const roomIdByPeer = new Map(generalRooms.map((item) => [item.peerId, item.room.id]));
  const states = await batchResolveCommunityMessengerFriendshipStatus(viewer, peerIds, roomIdByPeer);
  const allowedPeerIds = new Set(
    [...states.entries()].filter(([, state]) => state.status === "accepted").map(([peerId]) => peerId)
  );
  const allowedRoomIds = new Set(
    generalRooms.filter((item) => allowedPeerIds.has(item.peerId)).map((item) => item.room.id)
  );

  return roomRows.filter((room) => {
    const type = trimFriendshipText(room.room_type ?? room.roomType);
    const key = trimFriendshipText(room.direct_key ?? room.directKey);
    if (type !== "direct" || !isGeneralCommunityDirectKey(key)) return true;
    return allowedRoomIds.has(room.id);
  });
}
