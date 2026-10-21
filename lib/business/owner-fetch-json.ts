import type { MessageKey } from "@/lib/i18n/messages";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";

/**
 * 4-0 (RC-11) — 오너 화면 공통 JSON fetch.
 * `fetch` 예외·`res.json()` 예외·HTTP 오류·`{ ok:false, error }` 를 한 결과 형태로 모은다.
 * 오류 문구는 `owner-api-error-i18n` 매핑을 그대로 쓴다. 401/403 은 `stateKind:"no_permission"` 으로
 * 돌려 화면이 `OwnerStateView` 로 전환할 수 있게 한다.
 */

export type OwnerFetchJsonFailure = {
  ok: false;
  /** HTTP 상태 (네트워크 오류는 0) */
  status: number;
  /** 서버 `error` 코드, 없으면 `network_error` / `invalid_response` / `unauthorized` / `forbidden` / `request_failed` */
  code: string;
  /** 파싱된 본문 (파싱 실패·네트워크 오류는 null) */
  body: Record<string, unknown> | null;
  /** 401/403 → `OwnerStateView kind="no_permission"` 전환 신호 */
  stateKind: "no_permission" | null;
};

export type OwnerFetchJsonSuccess<T> = { ok: true; status: number; data: T };

export type OwnerFetchJsonResult<T> = OwnerFetchJsonSuccess<T> | OwnerFetchJsonFailure;

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

function fallbackCode(status: number): string {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  return "request_failed";
}

export async function ownerFetchJson<T = Record<string, unknown>>(
  input: string,
  init?: RequestInit
): Promise<OwnerFetchJsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, { credentials: "include", ...init });
  } catch {
    return { ok: false, status: 0, code: "network_error", body: null, stateKind: null };
  }
  const status = res.status;
  const stateKind = status === 401 || status === 403 ? "no_permission" : null;
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await res.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  if (res.ok && body && body.ok === true) {
    return { ok: true, status, data: body as T };
  }
  const serverCode = body && typeof body.error === "string" && body.error.trim() ? body.error.trim() : "";
  const code = serverCode || (res.ok ? "invalid_response" : fallbackCode(status));
  return { ok: false, status, code, body, stateKind };
}

/** 실패 결과 → 화면 문구 (`owner-api-error-i18n`). */
export function ownerFetchErrorMessage(failure: Pick<OwnerFetchJsonFailure, "code">, t: TranslateFn): string {
  return resolveOwnerApiErrorMessage(failure.code, t);
}
