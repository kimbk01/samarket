/**
 * 서버 API 오류 → 화면 문구 — 단일 정의 (`docs/i18n-ssot.md` §3-3 「서버 API 는 화면 문장 대신 오류 코드를 보내고,
 * 문구는 클라이언트 카탈로그가 정한다」 · 설계 `docs/audit/i18n-full-reaudit-fix-design-2026-11-27.md` §1-1).
 *
 * - 서버 문장(한국어·영어)은 **어떤 경우에도** 화면에 내보내지 않는다. 코드만 본다.
 * - 고르는 순서: `code` → `error`(코드 모양일 때) → 도메인 표 → 상태 번호 → `fallbackKey`.
 * - 바꿔 끼우는 값은 서버 `params` 로 받는다(숫자·문자열만).
 */
import type { MessageKey } from "@/lib/i18n/messages";

export type ApiErrorTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** 도메인 오류 코드 → 카탈로그 키 */
export type ApiErrorCodeMap = Readonly<Record<string, MessageKey>>;

const ERROR_CODE_SHAPE = /^[a-z][a-z0-9_]*$/;

function readRecord(json: unknown): Record<string, unknown> | null {
  return json != null && typeof json === "object" ? (json as Record<string, unknown>) : null;
}

/** 응답에서 오류 코드만 꺼낸다 — 문장이면 null */
export function pickApiErrorCode(json: unknown): string | null {
  const rec = readRecord(json);
  if (!rec) return null;
  for (const field of ["code", "error"] as const) {
    const v = rec[field];
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (ERROR_CODE_SHAPE.test(trimmed)) return trimmed;
    }
  }
  return null;
}

/** 서버 `params` — 숫자·문자열 값만 */
export function pickApiErrorParams(json: unknown): Record<string, string | number> | undefined {
  const params = readRecord(readRecord(json)?.params);
  if (!params) return undefined;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 상태 번호 → 공통 문구 키 (도메인 표에 없을 때) */
export function apiStatusFallbackKey(status: number | null | undefined): MessageKey | null {
  if (status === 401) return "common_login_required";
  if (status === 403) return "common_api_forbidden";
  if (status === 429) return "common_api_too_many_requests";
  if (typeof status === "number" && status >= 500) return "net_dibay_error";
  return null;
}

export function resolveApiErrorText(input: {
  json?: unknown;
  /** 오류 코드를 이미 꺼낸 경우(라이브러리 함수가 돌려준 code 등) — json 보다 먼저 본다 */
  code?: string | null;
  status?: number | null;
  map?: ApiErrorCodeMap;
  fallbackKey: MessageKey;
  t: ApiErrorTranslate;
}): string {
  const direct = typeof input.code === "string" && ERROR_CODE_SHAPE.test(input.code.trim()) ? input.code.trim() : null;
  const code = direct ?? pickApiErrorCode(input.json);
  if (code && input.map && Object.prototype.hasOwnProperty.call(input.map, code)) {
    return input.t(input.map[code]!, pickApiErrorParams(input.json));
  }
  const statusKey = apiStatusFallbackKey(input.status);
  if (statusKey) return input.t(statusKey);
  return input.t(input.fallbackKey);
}
