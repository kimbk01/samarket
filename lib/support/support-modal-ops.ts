/**
 * 고객센터 문의 창 요청 실행기 — 단일 정의 (계약 `docs/audit/customer-support-full-fix-contract-2026-11-28.md` §5).
 *
 * 접수 · 추가 문의 · 확인했어요 · seen · 상세 읽기 · 진행 중 목록 이 모두 이것 하나만 쓴다.
 * - 쓰기(접수·추가 문의·확인했어요)는 동시에 1개 — 상태 기계 `inflight` 로 표시, 모든 버튼이 같은 `busy` 로 비활성.
 * - AbortController + 시간 제한: 쓰기 20초 · 읽기 15초. 끊기면 `network_error`(같은 requestId 로 다시 시도 → 서버 replay).
 * - 401 = `ensureSessionHealthy` 1번 뒤 다시 보내고, 그래도 401 이면 로그인 화면(auth_out). 규칙은 여기 하나.
 * - 결과는 (창 회차, 화면 id, 문의 id) 가 맞을 때만 `current: true`. 쓰기 결과는 `apply` 를 부른 뒤 inflight 를 풀고
 *   보관한 intent(닫기·뒤로·열기)를 실행한다(결과가 먼저 그 화면에 붙는다).
 */

import {
  beginSupportModalWrite,
  dispatchSupportModalIntent,
  endSupportModalWrite,
  isSupportModalViewCurrent,
  supportModalTokenFor,
  type SupportModalOpToken,
  type SupportModalWriteKind,
} from "@/lib/support/support-modal-machine";

export const SUPPORT_MODAL_WRITE_TIMEOUT_MS = 20_000;
export const SUPPORT_MODAL_READ_TIMEOUT_MS = 15_000;

export type SupportOpResult<T> =
  | { ok: true; status: number; json: T; current: boolean }
  | { ok: false; status: number; error: string; json: Partial<T> & { error?: string }; current: boolean };

type RequestSpec = {
  url: string;
  method?: "GET" | "POST";
  body?: unknown;
  /** fetch 캐시 — 목록은 no-store */
  cache?: RequestCache;
};

/** 요청 id — 단일 정의 `support-request-id.ts` (고객 창·어드민 같은 함수) */
export { newSupportRequestId } from "@/lib/support/support-request-id";

async function fetchWithTimeout(spec: RequestSpec, timeoutMs: number): Promise<Response> {
  const abort = new AbortController();
  const host = typeof window !== "undefined" ? window : globalThis;
  const timer = host.setTimeout(() => abort.abort(), timeoutMs);
  try {
    return await fetch(spec.url, {
      method: spec.method ?? "GET",
      credentials: "include",
      ...(spec.cache ? { cache: spec.cache } : {}),
      ...(spec.body !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(spec.body) }
        : {}),
      signal: abort.signal,
    });
  } finally {
    host.clearTimeout(timer);
  }
}

async function ensureSessionOnce(reason: string): Promise<void> {
  try {
    const { ensureSessionHealthy } = await import("@/lib/auth/dibay-session-manager");
    await ensureSessionHealthy(reason);
  } catch {
    /* 세션을 살리지 못함 — 다시 보낸 요청이 401 이면 로그인 화면 */
  }
}

async function execute<T>(
  spec: RequestSpec,
  timeoutMs: number,
  token: SupportModalOpToken | null,
  fallbackError: string
): Promise<SupportOpResult<T>> {
  const current = () => (token ? isSupportModalViewCurrent(token) : true);
  try {
    let res = await fetchWithTimeout(spec, timeoutMs);
    if (res.status === 401) {
      await ensureSessionOnce("support_modal_request");
      res = await fetchWithTimeout(spec, timeoutMs);
    }
    if (res.status === 401) {
      // 한 규칙: 로그인 화면 — 그 화면이 아직 이 창에 있을 때만
      if (token && current()) dispatchSupportModalIntent({ type: "auth_out" });
      return { ok: false, status: 401, error: "unauthorized", json: {}, current: current() };
    }
    const json = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      const error =
        json.error ?? (res.status === 429 ? "rate_limited" : res.status === 403 || res.status === 404 ? "forbidden" : fallbackError);
      return { ok: false, status: res.status, error, json, current: current() };
    }
    return { ok: true, status: res.status, json, current: current() };
  } catch {
    return { ok: false, status: 0, error: "network_error", json: {}, current: current() };
  }
}

/**
 * 쓰기 요청 — 동시에 1개. 이미 진행 중이면 아무것도 보내지 않고 `null`.
 * `apply` 는 결과가 도착하면 inflight 를 풀기 **전에** 한 번 부른다(current 여부와 함께 — 화면 밖 일(초안 지우기)은 current 와 무관).
 */
export async function runSupportModalWrite<T>(
  kind: SupportModalWriteKind,
  view: { viewId: string; caseId: string | null },
  spec: RequestSpec,
  apply: (res: SupportOpResult<T>, token: SupportModalOpToken) => void,
  fallbackError = "send_failed"
): Promise<SupportOpResult<T> | null> {
  const token = supportModalTokenFor(view.viewId, view.caseId);
  const opId = beginSupportModalWrite(kind, token);
  if (opId == null) return null;
  let res: SupportOpResult<T> | null = null;
  try {
    res = await execute<T>({ ...spec, method: spec.method ?? "POST" }, SUPPORT_MODAL_WRITE_TIMEOUT_MS, token, fallbackError);
    apply(res, token);
    return res;
  } finally {
    endSupportModalWrite(opId);
  }
}

/** 읽기 요청(상세·진행 중 목록) 과 seen — busy 를 걸지 않는다. view 가 있으면 current 판정. */
export function runSupportModalRead<T>(
  view: { viewId: string; caseId: string | null } | null,
  spec: RequestSpec,
  fallbackError = "load_failed"
): Promise<SupportOpResult<T>> {
  const token = view ? supportModalTokenFor(view.viewId, view.caseId) : null;
  return execute<T>(spec, SUPPORT_MODAL_READ_TIMEOUT_MS, token, fallbackError);
}

/**
 * 실패 결과의 오류 **코드**(화면 상태에 넣는 값). 문구는 그릴 때 `supportErrorLabel` 이 i18n 키로 바꾼다 —
 * 서버 문장을 그대로 보이지 않는다(i18n SSOT `client-raw-server-error`).
 */
export function supportOpErrorCode(res: SupportOpResult<unknown>, fallback = "send_failed"): string {
  return res.ok ? fallback : res.error || fallback;
}
