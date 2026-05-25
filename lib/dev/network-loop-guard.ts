/**
 * Dev-only — Network 탭 반복 fetch/RSC 루프 원인 추적.
 * `[network-loop-guard]` 로 endpoint·caller·차단/TTL/single-flight·replace skip 을 남긴다.
 */

const WINDOW_MS = 60_000;

type GuardIntervalId = string | number | ReturnType<typeof setInterval> | null;

type GuardEntry = {
  endpoint: string;
  caller: string;
  reason: string;
  dedupe_hit?: boolean;
  ttl_hit?: boolean;
  interval_id?: GuardIntervalId;
  refresh_blocked?: boolean;
  request_count_60s?: number;
  source?: string;
  current_url?: string;
  target_url?: string;
  replace_skipped_same_url?: boolean;
  replace_allowed?: boolean;
};

const recentByEndpoint = new Map<string, number[]>();

function pruneWindow(now: number, bucket: number[]): number[] {
  const cutoff = now - WINDOW_MS;
  let i = 0;
  while (i < bucket.length && bucket[i]! < cutoff) i += 1;
  return i > 0 ? bucket.slice(i) : bucket;
}

export function getBrowserUrlPathAndSearch(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

export function recordNetworkLoopGuardRequest(endpoint: string, now = Date.now()): number {
  const key = endpoint.trim() || "(unknown)";
  const prev = recentByEndpoint.get(key) ?? [];
  const next = pruneWindow(now, prev);
  next.push(now);
  recentByEndpoint.set(key, next);
  return next.length;
}

export function logNetworkLoopGuard(entry: GuardEntry): void {
  if (process.env.NODE_ENV !== "development") return;
  const endpoint = entry.endpoint.trim() || entry.target_url?.trim() || "(unknown)";
  const request_count_60s =
    entry.request_count_60s ?? recordNetworkLoopGuardRequest(endpoint);
  console.debug("[network-loop-guard]", {
    endpoint,
    caller: entry.caller,
    reason: entry.reason,
    dedupe_hit: entry.dedupe_hit ?? false,
    ttl_hit: entry.ttl_hit ?? false,
    interval_id: entry.interval_id ?? null,
    refresh_blocked: entry.refresh_blocked ?? false,
    request_count_60s,
    ...(entry.source != null ? { source: entry.source } : {}),
    ...(entry.current_url != null ? { current_url: entry.current_url } : {}),
    ...(entry.target_url != null ? { target_url: entry.target_url } : {}),
    ...(entry.replace_skipped_same_url != null
      ? { replace_skipped_same_url: entry.replace_skipped_same_url }
      : {}),
    ...(entry.replace_allowed != null ? { replace_allowed: entry.replace_allowed } : {}),
  });
}

export function logNetworkLoopGuardBlocked(args: {
  endpoint: string;
  caller: string;
  reason: string;
  ttl_hit?: boolean;
  dedupe_hit?: boolean;
  interval_id?: GuardIntervalId;
  source?: string;
}): void {
  logNetworkLoopGuard({
    ...args,
    refresh_blocked: true,
    ttl_hit: args.ttl_hit ?? false,
    dedupe_hit: args.dedupe_hit ?? false,
  });
}

export function logNetworkLoopGuardReplace(args: {
  source: string;
  targetUrl: string;
  reason: string;
  currentUrl?: string;
}): { allowed: boolean; skippedSameUrl: boolean; currentUrl: string } {
  const currentUrl = args.currentUrl ?? getBrowserUrlPathAndSearch();
  const skippedSameUrl = currentUrl === args.targetUrl;
  const replace_allowed = !skippedSameUrl;
  logNetworkLoopGuard({
    endpoint: args.targetUrl,
    caller: args.source,
    source: args.source,
    reason: args.reason,
    current_url: currentUrl,
    target_url: args.targetUrl,
    replace_skipped_same_url: skippedSameUrl,
    replace_allowed,
    refresh_blocked: skippedSameUrl,
  });
  return { allowed: replace_allowed, skippedSameUrl, currentUrl };
}

export function guardedRouterReplace(
  router: { replace: (href: string, opts?: { scroll?: boolean }) => void },
  targetUrl: string,
  args: { source: string; reason: string; scroll?: boolean }
): boolean {
  const { allowed } = logNetworkLoopGuardReplace({
    source: args.source,
    targetUrl,
    reason: args.reason,
  });
  if (!allowed) return false;
  if (args.scroll === false) {
    router.replace(targetUrl, { scroll: false });
  } else {
    router.replace(targetUrl);
  }
  return true;
}
