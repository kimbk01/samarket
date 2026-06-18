export function buildGroupRoomWebPath(roomId: string): string {
  const id = roomId.trim();
  if (!id) return "/community-messenger/rooms?type=group";
  return `/community-messenger/rooms/${encodeURIComponent(id)}?type=group`;
}
