export function buildGroupRoomWebPath(roomId: string): string {
  const id = roomId.trim();
  if (!id) return "/community-messenger/rooms?type=group";
  return `/community-messenger/rooms/${encodeURIComponent(id)}?type=group`;
}

export function communityMessengerGroupRoomApiPath(roomId: string): string {
  const id = roomId.trim();
  return `/api/community-messenger/group-rooms/${encodeURIComponent(id)}`;
}
