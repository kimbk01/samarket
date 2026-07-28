import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import {
  startOutgoingRingback,
  stopAllOutgoingRingback,
  stopOutgoingRingback,
} from "@/lib/community-messenger/call-outgoing-ringback-controller";
import { shouldSkipWebOutgoingRingbackSync } from "@/lib/community-messenger/call-outgoing-ringback-ownership";

export type SyncOutgoingRingbackFromSessionArgs = {
  session: CommunityMessengerCallSession | null | undefined;
  joined: boolean;
  remoteJoined: boolean;
  source: string;
  /** nav_seed·gesture priming 직후 — start/stop 모두 금지(unmount cleanup 만) */
  skipStart?: boolean;
};

/** CallClient·cleanup 경로 공통 — sessionId 없으면 전역 stop */
export function stopOutgoingRingbackForSessionId(
  sessionId: string | null | undefined,
  reason: string
): void {
  const sid = sessionId?.trim();
  if (sid) {
    stopOutgoingRingback(sid, reason);
  } else {
    stopAllOutgoingRingback(reason);
  }
}

/**
 * CONTRACT — 발신 ringing 링백 동기화 (CallClient effect 전용)
 * DO NOT: `skipStart` 일 때 stop 호출 (primed 세션 첫 마운트에서 링백 즉시 중단)
 * DO NOT: 수신(callee) 세션에 start
 * DO NOT: Android native outgoing shell 에서 Web ringback start (native owner)
 * stop: !ringing | joined | remoteJoined | terminal 경로만
 */
export function syncOutgoingRingbackFromCallSession(args: SyncOutgoingRingbackFromSessionArgs): void {
  const { session, joined, remoteJoined, source, skipStart } = args;
  if (!session?.isMineInitiator) return;
  const sid = session.id.trim();
  if (!sid) return;

  if (skipStart) {
    return;
  }

  if (session.status === "ringing" && !joined && !remoteJoined) {
    const kind = session.callKind === "video" ? "video" : "voice";
    if (shouldSkipWebOutgoingRingbackSync(kind)) {
      return;
    }
    startOutgoingRingback({ callId: sid, kind: session.callKind, source });
    return;
  }

  stopOutgoingRingback(sid, source);
}
