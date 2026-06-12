import { MessengerRoomSegmentLoadingProbe } from "@/components/community-messenger/room/MessengerRoomSegmentLoadingProbe";

/**
 * R2-M11 / BN14-2 — shell 은 `[roomId]/layout` server inline shell 이 담당.
 * direct full navigation 에서 loading segment 는 probe 만 — shell 은 parent layout RSC.
 */
export default function CommunityMessengerRoomSegmentLoading() {
  return <MessengerRoomSegmentLoadingProbe />;
}
