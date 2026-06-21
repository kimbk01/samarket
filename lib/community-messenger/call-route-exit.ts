/**
 * 통화 라우트 즉시 이탈 SSOT.
 *
 * 종료·취소·거절 = **이벤트 핸들러에서 동기 `router.replace`**.
 * useLayoutEffect / 중간 surface / CallRouteExitSurface 같은 렌더 패치 **금지**.
 *
 * | target | 용도 |
 * |--------|------|
 * | `back` | ringing 취소·거절 — 방/return path |
 * | `call_logs` | 통화 종료 — 통화 목록 |
 */

import { hardClearActiveCallSession } from "@/lib/call/active-call-session";
import { syncTerminalCallClientState } from "@/lib/call/call-terminal-sync-cleanup";
import { logCallLatencyTerminalCleanupDone } from "@/lib/community-messenger/call-latency-trace";
import {
  navigateBackFromCommunityMessengerCall,
  navigateToCommunityMessengerCallLogsAfterTerminal,
  pinCommunityMessengerCallTerminalSurfaceDismiss,
} from "@/lib/community-messenger/call-session-navigation-seed";
import { isMessengerCallClientFailureReason } from "@/lib/community-messenger/messenger-call-join-failure-reason";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type CallRouteExitTarget = "back" | "call_logs";

export function isSoftCallRouteExit(
  status: CommunityMessengerCallSession["status"],
  endedReason?: string | null
): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  const terminal =
    normalized === "ended" ||
    normalized === "cancelled" ||
    normalized === "rejected" ||
    normalized === "missed" ||
    normalized === "failed" ||
    normalized === "declined";
  if (!terminal) return false;
  if (endedReason && isMessengerCallClientFailureReason(endedReason)) return false;
  return true;
}

/** 동기 라우트 이탈 — 1 sessionId 당 1회 (onceRef 선택) */
export function exitCommunityMessengerCallRouteNow(args: {
  router: { replace: (href: string) => void };
  sessionId: string;
  target: CallRouteExitTarget;
  source: string;
  roomId?: string | null;
  onceRef?: { current: string | null };
}): boolean {
  const sid = args.sessionId.trim();
  if (!sid) return false;
  if (args.onceRef?.current === sid) return false;
  if (args.onceRef) args.onceRef.current = sid;

  pinCommunityMessengerCallTerminalSurfaceDismiss(sid);
  syncTerminalCallClientState(sid, args.source);
  logCallLatencyTerminalCleanupDone({ sessionId: sid, source: args.source });
  void hardClearActiveCallSession(sid, args.source);

  if (args.target === "call_logs") {
    navigateToCommunityMessengerCallLogsAfterTerminal(args.router);
  } else {
    navigateBackFromCommunityMessengerCall(args.router, args.roomId ?? null);
  }
  return true;
}
