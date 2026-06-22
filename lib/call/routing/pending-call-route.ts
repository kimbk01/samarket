/**
 * call pending route — `dibay_call_pending_route` 단일 소유.
 */
import {
  clearCallEnginePendingRoute,
  readCallEnginePendingRoute,
  writeCallEnginePendingRoute,
} from "@/lib/community-messenger/call-engine";

export const DIBAY_CALL_PENDING_ROUTE_KEY = "dibay_call_pending_route";
const PENDING_ROUTE_TTL_MS = 60_000;

export type CallPendingRoute = {
  path: string;
  at: number;
  callId?: string;
};

export function writeCallPendingRoute(path: string, callId?: string): void {
  writeCallEnginePendingRoute(path, callId);
}

export function readCallPendingRoute(now = Date.now()): CallPendingRoute | null {
  return readCallEnginePendingRoute(now, PENDING_ROUTE_TTL_MS);
}

export function clearCallPendingRoute(): void {
  clearCallEnginePendingRoute();
}
