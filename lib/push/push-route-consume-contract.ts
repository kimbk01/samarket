/**
 * Native push-route pending consume contract.
 * Delivery (JS inject / CustomEvent) ≠ consumption. Clear only after SPA ACK.
 */

export function normalizePushRoutePath(path: string): string {
  const raw = path.trim();
  if (!raw.startsWith("/")) return "";
  try {
    const url = new URL(raw, "https://dibay.local");
    return `${url.pathname}${url.search}`;
  } catch {
    return raw.split("#")[0] ?? raw;
  }
}

/** Idempotent match: exact path+search, or pathname-only when target has no search. */
export function pathsMatchForPushConsume(currentHrefOrPath: string, targetPath: string): boolean {
  const current = normalizePushRoutePath(
    currentHrefOrPath.includes("://")
      ? (() => {
          try {
            const u = new URL(currentHrefOrPath);
            return `${u.pathname}${u.search}`;
          } catch {
            return currentHrefOrPath;
          }
        })()
      : currentHrefOrPath
  );
  const target = normalizePushRoutePath(targetPath);
  if (!current || !target) return false;
  if (current === target) return true;
  const curPath = current.split("?")[0] ?? current;
  const tgtPath = target.split("?")[0] ?? target;
  if (curPath !== tgtPath) return false;
  // Target without query: pathname match is enough (SPA may add section params later).
  return !target.includes("?");
}

export function isCallPushRoutePath(path: string): boolean {
  return normalizePushRoutePath(path).startsWith("/community-messenger/calls/");
}

/** Delivery alone must never authorize pending clear. */
export function mayClearPendingOnDeliveryOnly(): false {
  return false;
}

export type PushRouteAckDecision =
  | { action: "ack"; reason: "path_matched" | "same_route_skip" }
  | { action: "hold"; reason: "awaiting_navigation" | "auth_hold" | "delivery_only" };

export function decidePushRouteAck(args: {
  targetPath: string;
  currentPath: string;
  authGate: "allow" | "hold" | "login";
  deliveryOnly?: boolean;
}): PushRouteAckDecision {
  if (args.deliveryOnly) return { action: "hold", reason: "delivery_only" };
  if (args.authGate === "hold" || args.authGate === "login") {
    return { action: "hold", reason: "auth_hold" };
  }
  if (pathsMatchForPushConsume(args.currentPath, args.targetPath)) {
    return { action: "ack", reason: "path_matched" };
  }
  return { action: "hold", reason: "awaiting_navigation" };
}
