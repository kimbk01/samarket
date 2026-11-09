/**
 * Phase 3-2a — `/api` 세션 신선도 관문 (Auth HARD LOCK Amendment 2026-11-08 (7), 재개 조건 2 · Owner 「3-2a 승인 (조건 2)」).
 * 설계: docs/audit/phase3-auth-request-structure-design-2026-11-08.md §7
 *
 * 문제: 앱이 다시 보이면 Supabase SDK 가 잠금을 잡고 만료 임박 세션을 갱신한다(`_recoverAndRefresh`). 같은 순간 다른
 * 리스너들의 `/api` 요청은 그 갱신을 기다리지 않고 만료 토큰으로 나가 → 서버(Route Handler)가 대신 갱신한다
 * (운영: 서버 갱신 64~84%, 공유 Vercel IP 한도 1,800회/시·순간 30회).
 *
 * 계약:
 * - 같은 출처 `/api/*` 요청만. 브라우저 쿠키 토큰이 **만료 90초 이내(또는 만료)일 때만** `auth.getSession()` 을 기다린다
 *   (SDK 잠금 = 진행 중인 갱신 완료 대기 · 단일 비행). 토큰이 충분히 남았거나 로그인 쿠키가 없으면 대기 0.
 * - 대기 상한 3초 — 넘으면 그대로 보낸다(현재 동작). 관문 오류는 삼키고 그대로 보낸다. 401 계약·재시도 없음.
 * - 제외: 통화(`call` 이 들어간 경로, 통화 규정) · `/api/auth/*`(세션 관리자 자체 경로 — 잠금 교착 방지) ·
 *   `/api/telemetry/*` · `/api/app/web-version`.
 * - Supabase 자체 요청(`*.supabase.co`)은 같은 출처가 아니므로 통과 — SDK 갱신 요청이 관문에 걸리지 않는다.
 * - 세션 수명 소유는 `dibay-session-manager` 그대로. 이 관문은 갱신을 새로 일으키지 않고 SDK 갱신을 기다리기만 한다
 *   (만료면 `getSession()` 이 SDK 규칙대로 1회 갱신 — 그 갱신은 기기 IP 로 나간다).
 */
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  isAccessTokenWithinRefreshMargin,
  readAccessTokenFromCookies,
  type CookiePair,
} from "@/lib/auth/read-access-token-from-cookies";

export const SESSION_FRESHNESS_WAIT_CAP_MS = 3000;
const INSTALLED_MARK = "__dibaySessionFreshnessFetchGate";

/** 관문을 거치는 경로인지 (같은 출처 pathname 기준). */
export function isSessionFreshnessGatedApiPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/api/auth/") || pathname === "/api/auth") return false;
  if (pathname.startsWith("/api/telemetry/")) return false;
  if (pathname === "/api/app/web-version") return false;
  // 통화 규정: 통화 경로는 동작을 바꾸지 않는다 (call·calls·callback·missed-call·call-sound 등 전부 제외).
  if (/call/i.test(pathname)) return false;
  return true;
}

function requestPathname(input: RequestInfo | URL): string | null {
  try {
    const raw =
      typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const u = new URL(raw, window.location.href);
    if (u.origin !== window.location.origin) return null;
    return u.pathname;
  } catch {
    return null;
  }
}

function documentCookiePairs(): CookiePair[] {
  const out: CookiePair[] = [];
  const raw = typeof document !== "undefined" ? document.cookie : "";
  for (const seg of raw.split(";")) {
    const eq = seg.indexOf("=");
    if (eq <= 0) continue;
    const name = seg.slice(0, eq).trim();
    if (!name.startsWith("sb-")) continue;
    let value = seg.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* 원문 유지 */
    }
    out.push({ name, value });
  }
  return out;
}

/** 쿠키가 바뀌지 않았으면 이전 해석 재사용 (요청마다 파싱 비용 최소화). 만료 판정은 매번 현재 시각으로. */
/**
 * 해석 결과가 아니라 해석 Promise 를 쿠키 원문 기준으로 캐시한다 — 동시 요청이 해석 완료 전에
 * 「같은 쿠키·결과 없음」으로 대기 없이 통과하지 않게 한다 (undefined = 로그인 쿠키 없음).
 */
let lastCookieRaw: string | null = null;
let lastExpiry: Promise<number | null | undefined> | null = null;

async function tokenNeedsFreshness(nowMs: number): Promise<boolean> {
  const raw = typeof document !== "undefined" ? document.cookie : "";
  if (raw !== lastCookieRaw || !lastExpiry) {
    lastCookieRaw = raw;
    lastExpiry = readAccessTokenFromCookies(documentCookiePairs())
      .then((tok) => (tok ? tok.expiresAtSec : undefined))
      .catch(() => undefined);
  }
  const expiresAtSec = await lastExpiry;
  if (expiresAtSec === undefined) return false; // 로그인 쿠키 없음
  return isAccessTokenWithinRefreshMargin(expiresAtSec, nowMs);
}

let inflight: Promise<void> | null = null;

function waitForFreshSession(capMs: number): Promise<void> {
  if (!inflight) {
    const sb = getSupabaseClient();
    const run = sb
      ? sb.auth
          .getSession()
          .then(() => undefined)
          .catch(() => undefined)
      : Promise.resolve();
    inflight = run.finally(() => {
      inflight = null;
    });
  }
  const current = inflight;
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, capMs);
    void current.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * 요청 전에 세션 신선도만 기다린다 (fetch 를 거치지 않는 요청용 — 예: 복귀 조정자가 내는 RSC 프리페치).
 * 동작은 fetch 관문과 동일: 토큰이 만료 90초 이내일 때만 같은 단일 비행(`inflight`)을 기다리고, 상한 후 그대로 진행.
 * 새 갱신을 일으키지 않는다(만료면 `getSession()` 이 SDK 규칙대로 1회 갱신 — fetch 관문과 공유).
 */
export async function waitForSessionFreshnessIfNeeded(capMs = SESSION_FRESHNESS_WAIT_CAP_MS): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    if (await tokenNeedsFreshness(Date.now())) await waitForFreshSession(capMs);
  } catch {
    /* 관문 실패 → 그대로 진행 */
  }
}

/**
 * P0-C (Owner 4단계 C 2026-11-09) — 복귀 조정자 전용 「결과 기반」 세션 판정.
 *
 * 위 fetch 관문(Amendment 7: 3초 후 그대로 진행)은 바꾸지 않는다. 이 함수는 결과를 돌려줄 뿐 요청을 막지 않으며,
 * 새 갱신을 일으키지 않는다(만료 임박일 때만 SDK `getSession()` — SDK 잠금으로 진행 중 갱신과 합류).
 *
 * - fresh: 로그인 쿠키 토큰이 만료 90초 초과로 남음
 * - refreshed: 만료 임박이었고 상한 안에 갱신된 세션 확인
 * - pending: 상한 안에 결과 없음(갱신 진행 중)
 * - invalid: 갱신 무효(리프레시 토큰 없음·재사용 등) 또는 세션 사라짐 → 세션 관리자가 종료 처리
 * - guest: 로그인 쿠키 없음
 * - error: 일시 오류(네트워크·5xx) 또는 판정 불가
 */
export type SessionFreshnessOutcome = "fresh" | "refreshed" | "pending" | "invalid" | "guest" | "error";

type SessionResultLike = {
  data?: { session?: { expires_at?: number | null } | null } | null;
  error?: { code?: string | null; status?: number | null; name?: string | null } | null;
};

const INVALID_SESSION_CODES = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_not_found",
  "session_expired",
  "bad_jwt",
]);

/** `getSession()` 결과 분류(순수 함수 — 테스트 대상). */
export function classifySessionResult(result: SessionResultLike, nowMs: number = Date.now()): SessionFreshnessOutcome {
  const err = result.error ?? null;
  if (err) {
    const code = (err.code ?? "").trim();
    if (INVALID_SESSION_CODES.has(code)) return "invalid";
    return "error";
  }
  const session = result.data?.session ?? null;
  if (!session) return "invalid";
  const exp = typeof session.expires_at === "number" ? session.expires_at : null;
  if (exp == null) return "error";
  return isAccessTokenWithinRefreshMargin(exp, nowMs) ? "error" : "refreshed";
}

let inflightOutcome: Promise<SessionResultLike> | null = null;

function getSessionShared(): Promise<SessionResultLike> {
  if (!inflightOutcome) {
    const sb = getSupabaseClient();
    const run: Promise<SessionResultLike> = sb
      ? (sb.auth.getSession() as Promise<SessionResultLike>).catch(
          (e: unknown): SessionResultLike => ({ error: { code: "", name: e instanceof Error ? e.name : "error" } })
        )
      : Promise.resolve({ error: { code: "client_unavailable" } });
    inflightOutcome = run.finally(() => {
      inflightOutcome = null;
    });
  }
  return inflightOutcome;
}

export async function resolveSessionFreshnessOutcome(
  capMs: number = SESSION_FRESHNESS_WAIT_CAP_MS
): Promise<SessionFreshnessOutcome> {
  try {
    if (typeof window === "undefined") return "guest";
    const raw = typeof document !== "undefined" ? document.cookie : "";
    if (raw !== lastCookieRaw || !lastExpiry) {
      lastCookieRaw = raw;
      lastExpiry = readAccessTokenFromCookies(documentCookiePairs())
        .then((tok) => (tok ? tok.expiresAtSec : undefined))
        .catch(() => undefined);
    }
    const expiresAtSec = await lastExpiry;
    if (expiresAtSec === undefined) return "guest";
    if (!isAccessTokenWithinRefreshMargin(expiresAtSec, Date.now())) return "fresh";

    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), capMs);
    });
    const winner = await Promise.race([getSessionShared(), timeout]);
    if (timer) clearTimeout(timer);
    if (winner === "timeout") return "pending";
    return classifySessionResult(winner, Date.now());
  } catch {
    return "error";
  }
}

export function resetSessionFreshnessOutcomeForTests(): void {
  inflightOutcome = null;
}

type FetchLike = typeof fetch;

/** 테스트에서 직접 감쌀 수 있게 분리. */
export function wrapFetchWithSessionFreshness(base: FetchLike, capMs = SESSION_FRESHNESS_WAIT_CAP_MS): FetchLike {
  const gated = async function gatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    try {
      const path = requestPathname(input);
      if (path && isSessionFreshnessGatedApiPath(path) && (await tokenNeedsFreshness(Date.now()))) {
        await waitForFreshSession(capMs);
      }
    } catch {
      /* 관문 실패 → 그대로 보낸다 */
    }
    return base(input, init);
  } as FetchLike;
  (gated as unknown as Record<string, boolean>)[INSTALLED_MARK] = true;
  return gated;
}

/** 문서당 1회 — 모듈 로드 시점(가장 이른 클라이언트 지점)에 설치. 멱등. */
export function installSessionFreshnessFetchGate(): void {
  try {
    if (typeof window === "undefined" || typeof window.fetch !== "function") return;
    if ((window.fetch as unknown as Record<string, boolean>)[INSTALLED_MARK]) return;
    window.fetch = wrapFetchWithSessionFreshness(window.fetch.bind(window));
  } catch {
    /* 설치 실패 → 기존 fetch 그대로 */
  }
}

export function resetSessionFreshnessFetchGateForTests(): void {
  lastCookieRaw = null;
  lastExpiry = null;
  inflight = null;
}
