import {
  isCommunityMessengerCallPath,
  isCommunityMessengerRoomPath,
  pathFromClientHref,
} from "@/lib/navigation/community-messenger-deep-route-path";

export const CM_DEEP_ROUTE_NAV_LOCK_TTL_MS = 2500;

export type DeepRouteLockKind = "room" | "call";

export type DeepRouteNavigationLock = {
  kind: DeepRouteLockKind;
  targetId: string;
  targetPath: string;
  startedAt: number;
  expiresAt: number;
};

export type NavigationGuardSource =
  | "bottom_nav_explicit"
  | "room_forward"
  | "call_launch"
  | "call_return"
  | "recovery"
  | "bottom_nav_async"
  | "programmatic"
  | "unknown";

let activeLock: DeepRouteNavigationLock | null = null;

function nowMs(): number {
  return Date.now();
}

function expireLockIfNeeded(): void {
  if (!activeLock) return;
  if (nowMs() >= activeLock.expiresAt) {
    activeLock = null;
  }
}

export function getActiveDeepRouteNavigationLock(): DeepRouteNavigationLock | null {
  expireLockIfNeeded();
  return activeLock;
}

export function isDeepRouteNavigationLockActive(): boolean {
  return getActiveDeepRouteNavigationLock() != null;
}

function beginDeepRouteNavigationLock(
  kind: DeepRouteLockKind,
  targetId: string,
  targetHref: string,
  ttlMs = CM_DEEP_ROUTE_NAV_LOCK_TTL_MS
): void {
  const id = String(targetId ?? "").trim();
  const targetPath = pathFromClientHref(targetHref);
  if (!id || !targetPath) return;
  const startedAt = nowMs();
  activeLock = {
    kind,
    targetId: id,
    targetPath,
    startedAt,
    expiresAt: startedAt + ttlMs,
  };
}

export function beginRoomDeepRouteNavigationLock(roomId: string, targetHref: string): void {
  beginDeepRouteNavigationLock("room", roomId, targetHref);
}

/** priority mode 등 — room 진입 중 lock TTL 연장 */
export function extendRoomDeepRouteNavigationLock(
  roomId: string,
  targetHref: string,
  ttlMs = CM_DEEP_ROUTE_NAV_LOCK_TTL_MS
): void {
  const id = String(roomId ?? "").trim();
  const targetPath = pathFromClientHref(targetHref);
  if (!id || !targetPath) return;
  expireLockIfNeeded();
  const lock = activeLock;
  if (lock?.kind === "room" && lock.targetId === id) {
    activeLock = {
      ...lock,
      targetPath,
      expiresAt: nowMs() + ttlMs,
    };
    return;
  }
  beginDeepRouteNavigationLock("room", id, targetHref, ttlMs);
}

export function beginCallDeepRouteNavigationLock(sessionId: string, targetHref: string): void {
  beginDeepRouteNavigationLock("call", sessionId, targetHref);
}

export function clearDeepRouteNavigationLock(_reason?: string): void {
  activeLock = null;
}

export type DeepRouteNavigationGuardVerdict = {
  allow: boolean;
  blockReason?: string;
};

export function evaluateDeepRouteNavigationGuard(
  targetHref: string,
  options: { source: NavigationGuardSource; fromHref?: string | null }
): DeepRouteNavigationGuardVerdict {
  expireLockIfNeeded();
  const lock = activeLock;
  if (!lock) return { allow: true };

  const targetPath = pathFromClientHref(targetHref);

  if (options.source === "bottom_nav_explicit") {
    clearDeepRouteNavigationLock("user_bottom_nav");
    return { allow: true };
  }

  if (options.source === "room_forward" || options.source === "call_launch") {
    return { allow: true };
  }

  if (targetPath === lock.targetPath || targetPath.startsWith(`${lock.targetPath}/`)) {
    return { allow: true };
  }

  if (lock.kind === "call" && isCommunityMessengerCallPath(targetPath)) {
    return { allow: true };
  }

  if (lock.kind === "room" && isCommunityMessengerRoomPath(targetPath)) {
    return { allow: true };
  }

  return {
    allow: false,
    blockReason: `deep_route_lock_${lock.kind}_active`,
  };
}

export function warnCmRoomRouteGuardBlocked(args: {
  from: string | null;
  target: string;
  reason: string;
  activeRoomEntry?: string | null;
  activeLock?: DeepRouteNavigationLock | null;
  source?: NavigationGuardSource;
}): void {
  console.warn("[cm-room-route-guard] blocked_navigation", {
    from: args.from,
    target: args.target,
    reason: args.reason,
    activeRoomEntry: args.activeRoomEntry ?? getActiveDeepRouteNavigationLock()?.targetId ?? null,
    activeLock: args.activeLock ?? getActiveDeepRouteNavigationLock(),
    source: args.source ?? "unknown",
  });
}

/** 테스트 전용 */
export function resetDeepRouteNavigationLockForTests(): void {
  activeLock = null;
}
