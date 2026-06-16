import { logDibayCallFlow } from "@/lib/call/logging/call-flow-log";
import {
  isDibayCallTerminalLatched,
  markDibayCallTerminal,
  shouldAllowDibayCallRoute,
} from "@/lib/community-messenger/call-orchestrator";

const ROUTE_LATCH_TTL_MS = 8_000;
const claimedRoutes = new Map<string, { href: string; at: number; source: string }>();

function prune(now: number): void {
  for (const [callId, entry] of [...claimedRoutes.entries()]) {
    if (now - entry.at > ROUTE_LATCH_TTL_MS) {
      claimedRoutes.delete(callId);
    }
  }
}

export function claimCallRouteLatch(
  callId: string,
  href: string,
  source = "unknown",
  now = Date.now(),
): { ok: true } | { ok: false; reason: "duplicate" | "terminal" } {
  const sid = callId.trim();
  const path = href.trim();
  if (!sid || !path) return { ok: false, reason: "duplicate" };

  prune(now);
  if (isDibayCallTerminalLatched(sid, now)) {
    logDibayCallFlow("route_latch_rejected", { callId: sid, href: path, source, reason: "terminal" });
    return { ok: false, reason: "terminal" };
  }

  const prev = claimedRoutes.get(sid);
  if (prev && now - prev.at < ROUTE_LATCH_TTL_MS && prev.href === path) {
    logDibayCallFlow("route_latch_rejected", { callId: sid, href: path, source, reason: "duplicate" });
    logDibayCallFlow("duplicate_activity_blocked", { callId: sid, href: path, source });
    return { ok: false, reason: "duplicate" };
  }

  claimedRoutes.set(sid, { href: path, at: now, source });
  logDibayCallFlow("route_latch_claimed", { callId: sid, href: path, source });
  return { ok: true };
}

export function releaseCallRouteLatch(callId: string, source = "release"): void {
  const sid = callId.trim();
  if (!sid) return;
  const had = claimedRoutes.has(sid);
  claimedRoutes.delete(sid);
  if (had) {
    logDibayCallFlow("route_latch_cleared", { callId: sid, sessionId: sid, source });
  }
}

export function shouldOpenCallRoute(path: string | null | undefined, now = Date.now()): boolean {
  prune(now);
  if (!shouldAllowDibayCallRoute(path, now)) return false;
  const match = path?.trim().match(/^\/community-messenger\/calls\/([^/?#]+)/);
  const callId = match?.[1]?.trim();
  if (!callId) return true;
  const entry = claimedRoutes.get(callId);
  if (!entry) return true;
  return now - entry.at <= ROUTE_LATCH_TTL_MS;
}

export function markCallRouteTerminal(callId: string, now = Date.now()): void {
  markDibayCallTerminal(callId, now);
  releaseCallRouteLatch(callId);
}

export function resetCallRouteLatchForTests(): void {
  claimedRoutes.clear();
}
