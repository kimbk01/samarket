"use client";

import {
  isCallEngineTerminalConsumed,
  tryLockCallEngineRouteOnce,
} from "@/lib/community-messenger/call-engine/call-engine-locks";

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
