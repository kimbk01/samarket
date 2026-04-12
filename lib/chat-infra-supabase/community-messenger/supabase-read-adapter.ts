import type { CommunityMessengerReadPort, CommunityMessengerRoomSnapshotOptions } from "@/lib/chat-domain/ports/community-messenger-read";
import {
  getCommunityMessengerRoomSnapshot,
  type GetCommunityMessengerRoomSnapshotOptions,
} from "@/lib/community-messenger/service";

function toServiceOptions(o?: CommunityMessengerRoomSnapshotOptions): GetCommunityMessengerRoomSnapshotOptions | undefined {
  if (!o) return undefined;
  return { initialMessageLimit: o.initialMessageLimit };
}

/** Supabase + 기존 `service.ts` 구현을 포트 뒤에 둔 어댑터 (점진 이전용) */
export function createSupabaseCommunityMessengerReadPort(): CommunityMessengerReadPort {
  return {
    getRoomSnapshot(userId, roomId, options) {
      return getCommunityMessengerRoomSnapshot(userId, roomId, toServiceOptions(options));
    },
  };
}
