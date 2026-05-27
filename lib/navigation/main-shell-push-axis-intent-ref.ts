import type { MainShellRoutePushAxis } from "@/components/route-transition/route-transition-config";

/** `beginMenuNavigation` 직후·pathname 갱신 전 push 축 — React state 레이스 방지 */
type PendingPushAxisIntent = {
  axis: MainShellRoutePushAxis;
  targetPath: string | null;
  at: number;
};

const MAX_PENDING_AGE_MS = 4000;
let pendingPushAxis: PendingPushAxisIntent | null = null;

function normalizePath(pathname: string | null | undefined): string {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "");
  return p && p.length > 0 ? p : "/";
}

function isExpired(intent: PendingPushAxisIntent): boolean {
  return Date.now() - intent.at > MAX_PENDING_AGE_MS;
}

function pathMatchesTarget(pathname: string, targetPath: string | null): boolean {
  if (!targetPath) return true;
  if (pathname === targetPath) return true;
  return pathname.startsWith(`${targetPath}/`);
}

export function setMainShellPushAxisIntent(axis: MainShellRoutePushAxis | null, targetPath?: string): void {
  if (!axis) {
    pendingPushAxis = null;
    return;
  }
  pendingPushAxis = {
    axis,
    targetPath: targetPath ? normalizePath(targetPath) : null,
    at: Date.now(),
  };
}

export function peekMainShellPushAxisIntent(): MainShellRoutePushAxis | null {
  if (!pendingPushAxis) return null;
  if (isExpired(pendingPushAxis)) {
    pendingPushAxis = null;
    return null;
  }
  return pendingPushAxis.axis;
}

export function consumeMainShellPushAxisIntent(pathname?: string | null): MainShellRoutePushAxis | null {
  if (!pendingPushAxis) return null;
  if (isExpired(pendingPushAxis)) {
    pendingPushAxis = null;
    return null;
  }
  if (pathname != null && !pathMatchesTarget(normalizePath(pathname), pendingPushAxis.targetPath)) {
    return null;
  }
  const axis = pendingPushAxis;
  pendingPushAxis = null;
  return axis.axis;
}
