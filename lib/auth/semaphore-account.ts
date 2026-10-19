import { requireSemaphoreSmsEnv } from "@/lib/env/semaphore-sms";

export type SemaphoreAccountSnapshot = {
  ok: true;
  checkedAt: string;
  accountId: number | string | null;
  accountName: string | null;
  status: string | null;
  creditBalance: number | null;
  rateLimitRemaining: number | null;
};

export type SemaphoreAccountProbeFailure = {
  ok: false;
  checkedAt: string;
  kind: "missing_key" | "auth_rejected" | "rate_limited" | "provider_error" | "network_error" | "unexpected_shape";
  httpStatus: number | null;
  detail: string;
};

export type SemaphoreAccountProbeResult = SemaphoreAccountSnapshot | SemaphoreAccountProbeFailure;

type CacheEntry = { atMs: number; result: SemaphoreAccountProbeResult };

const CACHE_TTL_MS = 65_000;
let cache: CacheEntry | null = null;

function readCreditBalance(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * GET /api/v4/account — Gate S0 proven shape: account_id, account_name, status, credit_balance.
 * Rate limit is strict (~1/min observed) — process cache ≥65s.
 */
export async function probeSemaphoreAccount(opts?: {
  force?: boolean;
}): Promise<SemaphoreAccountProbeResult> {
  const now = Date.now();
  if (!opts?.force && cache && now - cache.atMs < CACHE_TTL_MS) {
    return cache.result;
  }

  const checkedAt = new Date().toISOString();
  const env = requireSemaphoreSmsEnv();
  if (!env.ok) {
    const result: SemaphoreAccountProbeFailure = {
      ok: false,
      checkedAt,
      kind: "missing_key",
      httpStatus: null,
      detail: "SEMAPHORE_API_KEY missing",
    };
    cache = { atMs: now, result };
    return result;
  }

  const url = `${env.apiBaseUrl.replace(/\/$/, "")}/account?apikey=${encodeURIComponent(env.apiKey)}`;
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    const remainingRaw = res.headers.get("x-ratelimit-remaining");
    const remaining = remainingRaw != null && remainingRaw !== "" ? Number(remainingRaw) : null;
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = null;
    }

    if (res.status === 401 || res.status === 403) {
      const result: SemaphoreAccountProbeFailure = {
        ok: false,
        checkedAt,
        kind: "auth_rejected",
        httpStatus: res.status,
        detail: "Semaphore API authentication rejected",
      };
      cache = { atMs: now, result };
      return result;
    }
    if (res.status === 429) {
      const result: SemaphoreAccountProbeFailure = {
        ok: false,
        checkedAt,
        kind: "rate_limited",
        httpStatus: 429,
        detail: "Semaphore account rate limited",
      };
      cache = { atMs: now, result };
      return result;
    }
    if (!res.ok) {
      const result: SemaphoreAccountProbeFailure = {
        ok: false,
        checkedAt,
        kind: "provider_error",
        httpStatus: res.status,
        detail: `Semaphore account HTTP ${res.status}`,
      };
      cache = { atMs: now, result };
      return result;
    }

    if (!json || typeof json !== "object" || Array.isArray(json)) {
      const result: SemaphoreAccountProbeFailure = {
        ok: false,
        checkedAt,
        kind: "unexpected_shape",
        httpStatus: res.status,
        detail: "Semaphore account response shape unexpected",
      };
      cache = { atMs: now, result };
      return result;
    }

    const row = json as Record<string, unknown>;
    const creditBalance = readCreditBalance(row.credit_balance);
    if (creditBalance == null && row.credit_balance != null) {
      const result: SemaphoreAccountProbeFailure = {
        ok: false,
        checkedAt,
        kind: "unexpected_shape",
        httpStatus: res.status,
        detail: "credit_balance unreadable",
      };
      cache = { atMs: now, result };
      return result;
    }

    const result: SemaphoreAccountSnapshot = {
      ok: true,
      checkedAt,
      accountId: (row.account_id as number | string | null) ?? null,
      accountName: typeof row.account_name === "string" ? row.account_name.slice(0, 120) : null,
      status: typeof row.status === "string" ? row.status : null,
      creditBalance,
      rateLimitRemaining: Number.isFinite(remaining as number) ? (remaining as number) : null,
    };
    cache = { atMs: now, result };
    return result;
  } catch (err) {
    const result: SemaphoreAccountProbeFailure = {
      ok: false,
      checkedAt,
      kind: "network_error",
      httpStatus: null,
      detail: err instanceof Error ? err.message.slice(0, 200) : "network_error",
    };
    cache = { atMs: now, result };
    return result;
  }
}

/** Test helper — clear process cache between unit tests. */
export function clearSemaphoreAccountProbeCacheForTests(): void {
  cache = null;
}
