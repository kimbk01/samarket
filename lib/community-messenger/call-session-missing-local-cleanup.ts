import {
  clearCommunityCallPresentationFlags,
  clearHostedActiveCallSession,
  peekDetachedCommunityCallSessionId,
} from "@/lib/community-messenger/call-presentation-ownership";
import { canClearLocalCallFlagsAfterConfirmedNotFound } from "@/lib/community-messenger/call-session-lookup-health";

/**
 * 404 확정 세션의 로컬 표시 플래그(dock·PiP·Android/iOS PiP·호스트 상주)를 그 sessionId 에 한해 정리한다.
 * 통화가 살아 있다는 근거(이 세션 미디어 join · detached 보관)가 있으면 아무것도 하지 않는다.
 * 미디어·벨·통화 잠금·다른 세션 플래그는 건드리지 않는다.
 * @returns 정리했으면 true
 */
export function releaseLocalCallFlagsForMissingSession(args: {
  sessionId: string;
  joinedMediaSessionId: string | null;
  notifyHostSync: () => void;
}): boolean {
  const sid = args.sessionId.trim();
  if (
    !canClearLocalCallFlagsAfterConfirmedNotFound({
      sessionId: sid,
      joinedMediaSessionId: args.joinedMediaSessionId,
      detachedSessionId: peekDetachedCommunityCallSessionId(),
    })
  ) {
    return false;
  }
  clearCommunityCallPresentationFlags(sid);
  clearHostedActiveCallSession(sid);
  args.notifyHostSync();
  return true;
}
