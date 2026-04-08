import { NextRequest, NextResponse } from "next/server";

type JsonObject = Record<string, unknown>;

type ParseJsonSuccess<T> = { ok: true; value: T };
type ParseJsonFailure = { ok: false; response: NextResponse };

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, RateLimitRecord>;

declare global {
  // eslint-disable-next-line no-var
  var __samarketApiRateLimitStore: RateLimitStore | undefined;
}

function getRateLimitStore(): RateLimitStore {
  if (!globalThis.__samarketApiRateLimitStore) {
    globalThis.__samarketApiRateLimitStore = new Map<string, RateLimitRecord>();
  }
  return globalThis.__samarketApiRateLimitStore;
}

function withNoStoreHeaders(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "no-store");
  }
  return { ...init, headers };
}

export function jsonOk(body: JsonObject = {}, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...body }, withNoStoreHeaders(init));
}

export function jsonError(
  error: string,
  init: number | (ResponseInit & { code?: string }) = 400,
  extra: JsonObject = {}
) {
  const normalizedInit = typeof init === "number" ? { status: init } : init;
  const { code, ...responseInit } = normalizedInit;
  return NextResponse.json(
    {
      ok: false,
      error,
      ...(code ? { code } : {}),
      ...extra,
    },
    withNoStoreHeaders(responseInit)
  );
}

export async function parseJsonBody<T>(
  request: NextRequest,
  invalidMessage = "invalid_json"
): Promise<ParseJsonSuccess<T> | ParseJsonFailure> {
  try {
    return { ok: true, value: (await request.json()) as T };
  } catch {
    return { ok: false, response: jsonError(invalidMessage, 400) };
  }
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.trim();
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function getRateLimitKey(request: NextRequest, userId?: string | null): string {
  if (userId && userId.trim()) return `user:${userId.trim()}`;
  return `ip:${getClientIp(request)}`;
}

export function enforceRateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
  message?: string;
  code?: string;
}) {
  const store = getRateLimitStore();
  const now = Date.now();

  for (const [entryKey, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(entryKey);
    }
  }

  const current = store.get(options.key);
  if (!current || current.resetAt <= now) {
    store.set(options.key, { count: 1, resetAt: now + options.windowMs });
    return { ok: true as const };
  }

  if (current.count >= options.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return {
      ok: false as const,
      response: jsonError(
        options.message ?? "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        {
          status: 429,
          code: options.code ?? "rate_limited",
          headers: {
            "Retry-After": String(retryAfterSec),
            "X-RateLimit-Limit": String(options.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(current.resetAt),
          },
        }
      ),
    };
  }

  current.count += 1;
  store.set(options.key, current);
  return { ok: true as const };
}

export function safeErrorMessage(
  error: unknown,
  fallback = "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
): string {
  if (error instanceof Error) {
    const message = error.message?.trim();
    if (!message) return fallback;
    if (/auth|jwt|permission|rls|supabase|sql|syntax|stack|token/i.test(message)) {
      return fallback;
    }
    return message;
  }
  return fallback;
}
