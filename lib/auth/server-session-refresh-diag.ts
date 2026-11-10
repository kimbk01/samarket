/**
 * 진단 전용 (Owner 「승인 한다」 2026-11-10 · docs/audit/server-refresh-remaining-cause-2026-11-10.md §3).
 *
 * 서버(@supabase/ssr `createServerClient`)가 세션 쿠키를 새로 쓰려 할 때(= 서버에서 갱신·로그인·로그아웃이 일어남)
 * Vercel 로그에 한 줄을 남긴다. 동작은 바꾸지 않는다 — 호출 위치의 기존 setAll 동작 앞에서 기록만 한다.
 *
 * 남기는 것: 구성요소 이름, 실행 지역, 요청 종류 헤더(RSC·prefetch·sec-fetch-*), 요청에 있던 토큰의 만료까지 남은 초,
 * 새로 쓰는 쿠키가 「값 있음(갱신·로그인)」인지 「비움(로그아웃)」인지. 요청 경로는 Vercel 로그 줄에 이미 붙는다.
 * 남기지 않는 것: 토큰 원문, 쿠키 값, 사용자 식별자.
 *
 * 수집이 끝나면 이 파일과 호출 줄을 함께 제거한다.
 */
import {
  readAccessTokenFromCookies,
  type CookiePair,
} from "@/lib/auth/read-access-token-from-cookies";

export const SERVER_SESSION_REFRESH_DIAG_TAG = "[dibay-srv-refresh]";

const AUTH_TOKEN_COOKIE_RE = /^sb-[^.]+-auth-token(?:\.\d+)?$/;

type HeaderReader = { get(name: string): string | null } | null | undefined;

export type ServerSessionRefreshDiagInput = {
  component: string;
  /** 갱신 전 요청 쿠키 */
  requestCookies: CookiePair[];
  /** setAll 로 받은 새 쿠키 (값만 길이 판정에 씀) */
  cookiesToSet: { name: string; value: string }[];
  headers?: HeaderReader;
  nowMs?: number;
};

/** 순수 함수 — 기록할 내용을 만든다(테스트용). 세션 쿠키 변경이 없으면 null. */
export async function buildServerSessionRefreshDiag(
  input: ServerSessionRefreshDiagInput
): Promise<Record<string, unknown> | null> {
  const authCookies = input.cookiesToSet.filter((c) => AUTH_TOKEN_COOKIE_RE.test(c.name));
  if (authCookies.length === 0) return null;
  const write = authCookies.some((c) => c.value.length > 0) ? "set" : "clear";
  const nowMs = input.nowMs ?? Date.now();
  let prevTokenRemainSec: number | null = null;
  let prevToken = false;
  try {
    const tok = await readAccessTokenFromCookies(input.requestCookies);
    if (tok) {
      prevToken = true;
      prevTokenRemainSec = tok.expiresAtSec == null ? null : Math.round(tok.expiresAtSec - nowMs / 1000);
    }
  } catch {
    /* 진단 — 실패 무시 */
  }
  const h = input.headers;
  const pick = (name: string) => {
    try {
      const v = h?.get(name);
      return v ? v.slice(0, 40) : null;
    } catch {
      return null;
    }
  };
  return {
    component: input.component,
    write,
    region: (process.env.VERCEL_REGION ?? "").trim() || null,
    prevToken,
    prevTokenRemainSec,
    rsc: pick("rsc"),
    prefetch: pick("next-router-prefetch") ?? pick("purpose"),
    secFetchDest: pick("sec-fetch-dest"),
    secFetchMode: pick("sec-fetch-mode"),
  };
}

/** 기록만 — 절대 throw 하지 않고 기다리지 않는다(호출 경로 지연 0). */
export function logServerSessionRefreshDiag(input: ServerSessionRefreshDiagInput): void {
  try {
    void buildServerSessionRefreshDiag(input)
      .then((row) => {
        if (row) console.info(`${SERVER_SESSION_REFRESH_DIAG_TAG} ${JSON.stringify(row)}`);
      })
      .catch(() => undefined);
  } catch {
    /* 진단 — 무시 */
  }
}
