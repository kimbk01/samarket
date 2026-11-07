import { MessengerRoomSegmentLoadingProbe } from "@/components/community-messenger/room/MessengerRoomSegmentLoadingProbe";
import { MessengerRoomSplitLoadingFrame } from "@/components/community-messenger/room/MessengerRoomSplitLoadingFrame";

/**
 * R2-M11 / BN14-2 — shell 은 `[roomId]/layout` server inline shell 이 담당.
 * direct full navigation 에서 loading segment 는 probe 만 — shell 은 parent layout RSC.
 * 분할 화면(768px+)만 방과 같은 틀(상단바 + 대화 배경)을 그린다 — 흰 빈 칸 방지 (2026-11-07 P1).
 * 휴대폰은 probe 만 (목록 복사본 + 진입 애니메이션이 화면을 담당).
 */
export default function CommunityMessengerRoomSegmentLoading() {
  return (
    <>
      <MessengerRoomSegmentLoadingProbe />
      <MessengerRoomSplitLoadingFrame />
    </>
  );
}
