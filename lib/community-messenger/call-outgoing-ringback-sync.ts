import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import {
  getOutgoingRingbackSnapshot,
  startOutgoingRingback,
  stopAllOutgoingRingback,
  stopOutgoingRingback,
} from "@/lib/community-messenger/call-outgoing-ringback-controller";

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
 * DO NOT: 수신(callee) 세션에 start
 * skipStart: nav_seed·gesture 에서 이미 재생 중이면 중복 start 만 생략 (미재생이면 handoff 복구)
 * stop: !ringing | joined | remoteJoined | terminal 경로만
 */
export function syncOutgoingRingbackFromCallSession(args: SyncOutgoingRingbackFromSessionArgs): void {
  const { session, joined, remoteJoined, source, skipStart } = args;
  if (!session?.isMineInitiator) return;
  const sid = session.id.trim();
  if (!sid) return;

  if (session.status === "ringing" && !joined && !remoteJoined) {
    if (skipStart && getOutgoingRingbackSnapshot().playing) {
      return;
    }
    startOutgoingRingback({ callId: sid, kind: session.callKind, source });
    return;
  }

  stopOutgoingRingback(sid, source);
}
