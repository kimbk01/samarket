"use client";

import {
  getCallEngineSurfaceOwner,
  isCallEngineRouteLocked,
  isCallEngineTerminalConsumed,
  tryLockCallEngineRouteOnce,
} from "@/lib/community-messenger/call-engine/call-engine-locks";
import { getCallEngineState } from "@/lib/community-messenger/call-engine/call-engine-state";
import { logAcceptPipeline } from "@/lib/community-messenger/call-engine/call-engine-accept-pipeline-log";
import { readCallConsumedReason } from "@/lib/community-messenger/incoming-call-state";

export type CallEngineRouter = {
  replace?: (href: string) => void;
  push?: (href: string) => void;
};

export function buildCallEngineActiveRoute(callId: string): string {
  return `/community-messenger/calls/${encodeURIComponent(callId)}?mode=active`;
}

export function replaceCallEngineRouteOnce(router: CallEngineRouter, callId: string, href: string): boolean {
  const sid = callId.trim();
  if (!sid || isCallEngineTerminalConsumed(sid)) return false;
  if (!router.replace) return false;
  if (!tryLockCallEngineRouteOnce(sid)) return false;
  router.replace(href);
  return true;
}

export function pushCallEngineRouteOnce(router: CallEngineRouter, callId: string, href: string): boolean {
  const sid = callId.trim();
  if (!sid || isCallEngineTerminalConsumed(sid)) return false;
  if (!router.push) return false;
  if (!tryLockCallEngineRouteOnce(sid)) return false;
  router.push(href);
  return true;
}

/** Accept pipeline — accepted consumed 은 차단하지 않음, terminal consumed·route lock 만 차단 */
export function routeCallEngineForAccept(
  router: CallEngineRouter,
  callId: string,
  href: string,
): boolean {
  const sid = callId.trim();
  const phase = getCallEngineState(sid);
  const routeLock = isCallEngineRouteLocked(sid);
  logAcceptPipeline("route_request", { callId: sid, href, phase, routeLock });

  if (isCallEngineTerminalConsumed(sid)) {
    logAcceptPipeline("route_blocked", {
      callId: sid,
      href,
      reason: "terminal_consumed",
      phase,
      consumedReason: readCallConsumedReason(sid),
      surfaceOwner: getCallEngineSurfaceOwner(sid),
    });
    router.replace?.(href);
    logAcceptPipeline("route_fallback", { callId: sid, href, reason: "terminal_consumed_force_navigate" });
    return false;
  }

  if (replaceCallEngineRouteOnce(router, sid, href)) {
    logAcceptPipeline("route_allowed", { callId: sid, href });
    return true;
  }

  logAcceptPipeline("route_blocked", {
    callId: sid,
    href,
    reason: routeLock ? "route_lock" : "router_replace_unavailable",
    phase,
    consumedReason: readCallConsumedReason(sid),
    surfaceOwner: getCallEngineSurfaceOwner(sid),
  });
  router.replace?.(href);
  logAcceptPipeline("route_fallback", { callId: sid, href, reason: "replace_once_failed" });
  return false;
}
