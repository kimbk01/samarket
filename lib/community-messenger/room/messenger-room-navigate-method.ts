/**
 * P5 (부록 P5 §A5·§B3-8) — 방으로 가는 직접 이동의 방식 단일 정의.
 * ≥768 분할 화면에서 방 → 다른 방 = 목록이 그대로인 같은 층 이동 → replace (목록 행 `community-messenger-room-forward-navigation`
 * 의 「같은 층 replace」와 같은 규칙). 기록이 [허브, 방] 으로 유지되어 헤더 ‹ 와 Android ◁ 가 같은 목록으로 간다.
 * 그 밖(휴대폰·허브 → 첫 방) = push.
 */
import { matchesMessengerSplitViewport } from "@/lib/ui/app-viewport-layout-breakpoints";
import { isCommunityMessengerRoomRoutePathname } from "@/lib/community-messenger/messenger-room-pathname";

type RoomNavRouter = {
  push: (href: string) => void;
  replace: (href: string) => void;
};

export function messengerRoomNavigateMethod(router: RoomNavRouter): (href: string) => void {
  const sameLayerRoomSwitch =
    typeof window !== "undefined" &&
    matchesMessengerSplitViewport() &&
    isCommunityMessengerRoomRoutePathname(window.location.pathname);
  return sameLayerRoomSwitch ? (href) => router.replace(href) : (href) => router.push(href);
}
