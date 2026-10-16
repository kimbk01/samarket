import type { ReactNode } from "react";

/**
 * Room segment layout — no behind-the-scenes ShellChromeFrame.
 * (May–Jul BN13/BN14 fake shell host removed: it painted header-without-back first.)
 */
export default function CommunityMessengerRoomSegmentLayout({ children }: { children: ReactNode }) {
  /**
   * 동기 layout — `await params` 제거(방 id 는 클라이언트 `useParams`). 방 진입 시 이 세그먼트가
   * 서버 왕복을 기다리는 구간을 줄인다(5단계: 누르는 즉시 방 그리기).
   */
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" data-cm-room-segment-layout="">
      <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
