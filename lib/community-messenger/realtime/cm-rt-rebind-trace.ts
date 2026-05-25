/**
 * Community messenger Realtime rebind audit — dev-only.
 * `[rt-rebind-trace]`, `[rt-channel-lifecycle]`, `[rt-room-diff]`
 */

const isDev = typeof process !== "undefined" && process.env.NODE_ENV === "development";

export function logRtRebindTrace(args: {
  reason: string;
  roomCount?: number;
  added?: number;
  removed?: number;
}): void {
  if (!isDev) return;
  console.log("[rt-rebind-trace]", {
    reason: args.reason,
    pathname: typeof window !== "undefined" ? window.location.pathname : "",
    roomCount: args.roomCount ?? null,
    added: args.added ?? null,
    removed: args.removed ?? null,
    visibility: typeof document !== "undefined" ? document.visibilityState : "unknown",
    focused: typeof document !== "undefined" && typeof document.hasFocus === "function" ? document.hasFocus() : null,
    ts: Date.now(),
  });
}

export function logRtChannelLifecycle(args: {
  action: string;
  channel: string;
  roomId?: string | null;
  subscribers?: number;
}): void {
  if (!isDev) return;
  console.log("[rt-channel-lifecycle]", {
    action: args.action,
    channel: args.channel,
    roomId: args.roomId ?? null,
    subscribers: args.subscribers ?? null,
    ts: Date.now(),
  });
}

export function logRtRoomDiff(args: {
  prev: string[];
  next: string[];
  added: string[];
  removed: string[];
}): void {
  if (!isDev) return;
  console.log("[rt-room-diff]", {
    prev: args.prev,
    next: args.next,
    added: args.added,
    removed: args.removed,
    ts: Date.now(),
  });
}
