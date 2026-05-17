import { MessengerRoomSegmentLoadingProbe } from "@/components/community-messenger/room/MessengerRoomSegmentLoadingProbe";

/**
 * R2-M11 — 세그먼트 Suspense 경계는 유지하되 시각 fallback 은 생략.
 * PRE-ROUTE overlay·Phase2 셸이 이미 chrome 을 그리므로 이중 스켈레톤을 막는다.
 */
export default function CommunityMessengerRoomSegmentLoading() {
  return <MessengerRoomSegmentLoadingProbe />;
}
