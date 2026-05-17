import { CommunityMessengerRoomPageClientEntry } from "@/components/community-messenger/room/CommunityMessengerRoomPageClientEntry";
import { MessengerRoomR2M11BServerTimingBridge } from "@/components/community-messenger/room/MessengerRoomR2M11BServerTimingBridge";
import { measureRoomSegmentServerWall } from "@/lib/community-messenger/room/cm-room-r2-m11c-layout-server-timers";

/**
 * R2-M10B / R2-M11 — client-first room page.
 * - 서버 await·segment `force-dynamic` 없음 (R2-M10B)
 * - page 래퍼 Suspense 제거 — `loading.tsx` 세그먼트 경계 1개만 (R2-M11)
 * - R2-M11B / R2-M11C — `page` 동기 구간 start/done 계측만(데이터 fetch 없음)
 *
 * @see docs/dynamic-route-exception-community-messenger-room.md
 */
export default function CommunityMessengerRoomPage() {
  /** 7. room page server start/done — 동기 구간만 */
  const roomSegmentTiming = measureRoomSegmentServerWall();
  return (
    <>
      <MessengerRoomR2M11BServerTimingBridge
        roomPageServerWallMs={roomSegmentTiming.room_segment_server_wall_ms}
        roomSegmentTiming={roomSegmentTiming}
      />
      <CommunityMessengerRoomPageClientEntry />
    </>
  );
}
