import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { createRequestId, normalizeRequestId, SAMARKET_REQUEST_ID_HEADER } from "@/lib/http/request-id";

export type FetchJsonErrorCode =
  | "timeout"
  | "aborted"
  | "network_error"
  | "http_error"
  | "invalid_json";

export class FetchJsonError extends Error {
  code: FetchJsonErrorCode;
  status?: number;
  requestId?: string;

  constructor(message: string, code: FetchJsonErrorCode, opts?: { status?: number; requestId?: string }) {
    super(message);
    this.name = "FetchJsonError";
    this.code = code;
    this.status = opts?.status;
    this.requestId = opts?.requestId;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isIdempotentMethod(method: string | undefined): boolean {
  const m = (method || "GET").toUpperCase();
  return m === "GET" || m === "HEAD" || m === "OPTIONS" || m === "PUT" || m === "DELETE";
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  options: (RequestInit & { timeoutMs?: number; retries?: number; retryBaseDelayMs?: number; requestId?: string }) = {}
): Promise<T> {
  const {
    retries = 1,
    retryBaseDelayMs = 250,
    timeoutMs = 12_000,
    requestId: requestIdRaw,
    headers,
    ...rest
  } = options;

  const requestId = normalizeRequestId(requestIdRaw) ?? createRequestId("cli");
  const hdrs = new Headers(headers);
  if (!hdrs.has("Accept")) hdrs.set("Accept", "application/json");
  if (!hdrs.has(SAMARKET_REQUEST_ID_HEADER)) hdrs.set(SAMARKET_REQUEST_ID_HEADER, requestId);

  const canRetry = isIdempotentMethod(rest.method);
  const maxAttempts = Math.max(1, Math.floor(retries) + 1);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetchWithTimeout(input, { ...rest, headers: hdrs, timeoutMs });

      const resRequestId =
        normalizeRequestId(res.headers.get(SAMARKET_REQUEST_ID_HEADER)) ??
        normalizeRequestId(res.headers.get("x-request-id")) ??
        requestId;

      if (!res.ok) {
        const msg = `HTTP ${res.status}`;
        // 5xx는 재시도, 4xx는 즉시 실패(보통 검증/권한)
        if (canRetry && res.status >= 500 && attempt < maxAttempts) {
          await sleep(retryBaseDelayMs * attempt);
          continue;
        }
        throw new FetchJsonError(msg, "http_error", { status: res.status, requestId: resRequestId });
      }

      try {
        return (await res.json()) as T;
      } catch {
        throw new FetchJsonError("Invalid JSON", "invalid_json", { status: res.status, requestId: resRequestId });
      }
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const name = e instanceof Error ? e.name : "";
      const aborted =
        name === "AbortError" || /aborted/i.test(msg) || /The operation was aborted/i.test(msg);

      if (aborted) {
        // 타임아웃과 사용자 abort를 구분하기 어려운 런타임이 있어 기본은 timeout 취급
        const code: FetchJsonErrorCode = "timeout";
        if (attempt < maxAttempts && canRetry) {
          await sleep(retryBaseDelayMs * attempt);
          continue;
        }
        throw new FetchJsonError("Request timed out", code, { requestId });
      }

      if (attempt < maxAttempts && canRetry) {
        await sleep(retryBaseDelayMs * attempt);
        continue;
      }

      throw e instanceof FetchJsonError ? e : new FetchJsonError(msg, "network_error", { requestId });
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

