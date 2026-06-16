import { shouldRunIncomingCallBackupHttpPoll } from "@/lib/layout/incoming-call-backup-poll-policy";

export type IncomingCallVisibilityState = "visible" | "hidden" | "prerender" | "unloaded";

export function isIncomingCallWindowForeground(): boolean {
  if (typeof document === "undefined") return true;
  if (document.visibilityState !== "visible" || document.hidden) return false;
  return typeof document.hasFocus === "function" ? document.hasFocus() : true;
}

export function readIncomingCallVisibilityState(): IncomingCallVisibilityState {
  if (typeof document === "undefined") return "visible";
  const state = String(document.visibilityState);
  return state === "visible" || state === "hidden" || state === "prerender" || state === "unloaded"
    ? state
    : document.hidden
      ? "hidden"
      : "visible";
}

export function shouldRunIncomingCallBackupHttpRequest(args: {
  pathname: string | null;
  hasRingingDirectCallee: boolean;
  realtimeOk: boolean;
}): boolean {
  if (!shouldRunIncomingCallBackupHttpPoll(args.pathname, args.hasRingingDirectCallee)) return false;
  /** ringing 중에는 탭이 숨겨져 있어도 취소/상태 동기화를 위해 HTTP 백업을 허용한다. */
  if (args.hasRingingDirectCallee) return true;
  if (!isIncomingCallWindowForeground()) return false;
  /** Realtime·Broadcast·SW 로 목록이 갱신되면 2.4s 백업 GET 은 중단. */
  if (args.realtimeOk) return false;
  return true;
}

