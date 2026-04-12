import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import type { CommunityMessengerReadPort, CommunityMessengerRoomSnapshotOptions } from "../ports/community-messenger-read";

/** BFF 부트스트랩 — 도메인 포트만 의존 (인프라 무관) */
export async function loadCommunityMessengerRoomBootstrap(
  port: CommunityMessengerReadPort,
  userId: string,
  roomId: string,
  options?: CommunityMessengerRoomSnapshotOptions
): Promise<CommunityMessengerRoomSnapshot | null> {
  return port.getRoomSnapshot(userId, roomId, options);
}
