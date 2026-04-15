import { NextRequest, NextResponse } from "next/server";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import { createRequestId, normalizeRequestId, SAMARKET_REQUEST_ID_HEADER } from "@/lib/http/request-id";
import {
  getOptionalRateLimitRedis,
  rateLimitIncrCount,
  rateLimitPttlMs,
  rateLimitRedisStorageKey,
} from "@/lib/http/rate-limit-redis";

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

export function getOrCreateRequestId(request: NextRequest): string {
  const incoming =
    normalizeRequestId(request.headers.get(SAMARKET_REQUEST_ID_HEADER)) ??
    normalizeRequestId(request.headers.get("x-request-id")) ??
    normalizeRequestId(request.headers.get("x-correlation-id"));
  return incoming ?? createRequestId();
}

export function withRequestIdHeaders(init: ResponseInit | undefined, requestId: string): ResponseInit {
  const headers = new Headers(init?.headers);
  if (!headers.has(SAMARKET_REQUEST_ID_HEADER)) {
    headers.set(SAMARKET_REQUEST_ID_HEADER, requestId);
  }
  return { ...init, headers };
}

export function jsonOkWithRequest(request: NextRequest, body: JsonObject = {}, init?: ResponseInit) {
  const requestId = getOrCreateRequestId(request);
  return NextResponse.json(
    { ok: true, requestId, ...body },
    withNoStoreHeaders(withRequestIdHeaders(init, requestId))
  );
}

/**
 * 응답 바디 shape를 바꾸면 안 되는 API용.
 * - requestId는 헤더로만 내려준다.
 * - (필요 시 호출자가 body에 requestId를 직접 포함)
 */
export function jsonWithRequestIdHeader<T>(
  request: NextRequest,
  body: T,
  init?: ResponseInit
) {
  const requestId = getOrCreateRequestId(request);
  return NextResponse.json(body as any, withNoStoreHeaders(withRequestIdHeaders(init, requestId)));
}

/**
 * 운영 환경에서는 PostgREST/DB 원문을 클라이언트에 넘기지 않음 (정보 누수·스키마 노출 완화).
 * 로컬·스테이징에서는 디버깅을 위해 상세 메시지 유지.
 */
export function clientSafeInternalErrorMessage(internalMessage: string | undefined | null): string {
  const trimmed = typeof internalMessage === "string" ? internalMessage.trim() : "";
  if (!isProductionDeploy()) return trimmed || "오류가 발생했습니다.";
  return "일시적으로 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.";
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

export function jsonErrorWithRequest(
  request: NextRequest,
  error: string,
  init: number | (ResponseInit & { code?: string }) = 400,
  extra: JsonObject = {}
) {
  const requestId = getOrCreateRequestId(request);
  const normalizedInit = typeof init === "number" ? { status: init } : init;
  const { code, ...responseInit } = normalizedInit;
  return NextResponse.json(
    {
      ok: false,
      requestId,
      error,
      ...(code ? { code } : {}),
      ...extra,
    },
    withNoStoreHeaders(withRequestIdHeaders(responseInit, requestId))
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

function enforceRateLimitMemory(options: {
  key: string;
  limit: number;
  windowMs: number;
  message?: string;
  code?: string;
}) {
  const store = getRateLimitStore();
  const now = Date.now();

  const currentBefore = store.get(options.key);
  if (currentBefore && currentBefore.resetAt <= now) {
    store.delete(options.key);
  }
  /** IP/유저 키가 많아질 때만 만료 항목 일괄 정리(매 요청 전체 순회 방지) */
  if (store.size > 2_000 && Math.random() < 0.02) {
    for (const [entryKey, entry] of store) {
      if (entry.resetAt <= now) store.delete(entryKey);
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

/** `UPSTASH_REDIS_REST_*` 가 있으면 Redis(INCR+만료), 없거나 오류 시 프로세스 메모리 */
export async function enforceRateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
  message?: string;
  code?: string;
}) {
  const redis = getOptionalRateLimitRedis();
  if (redis) {
    try {
      const storageKey = rateLimitRedisStorageKey(options.key);
      const count = await rateLimitIncrCount(redis, storageKey, options.windowMs);
      if (count > options.limit) {
        const now = Date.now();
        let pttl = await rateLimitPttlMs(redis, storageKey);
        if (pttl < 0) pttl = options.windowMs;
        const retryAfterSec = Math.max(1, Math.ceil(pttl / 1000));
        const resetAt = now + pttl;
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
                "X-RateLimit-Reset": String(resetAt),
              },
            }
          ),
        };
      }
      return { ok: true as const };
    } catch {
      /* Redis 장애 시 인메모리로 폴백 */
    }
  }
  return enforceRateLimitMemory(options);
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
