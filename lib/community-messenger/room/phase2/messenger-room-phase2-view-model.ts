import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import type { MessengerRoomPhase2ControllerState } from "@/lib/community-messenger/room/phase2/use-messenger-room-phase2-controller";

/** 스냅샷이 확정된 뒤 Phase2 UI 전역에 넘기는 모델(컨트롤러 상태 + non-null snapshot) */
export type MessengerRoomPhase2ViewModel = MessengerRoomPhase2ControllerState & {
  snapshot: CommunityMessengerRoomSnapshot;
};
