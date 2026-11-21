/**
 * 가입 진행 중 회원 안내 — `/api` 요청 단계 한 곳 (설계 `docs/audit/registration-action-cta-ssot-design-2026-11-21.md` §5-3).
 * 선례: `session-freshness-fetch-gate.client.ts` (같은 방식으로 `window.fetch` 를 감싼다, 문서당 1회·멱등).
 *
 * 1) 미리 확인 — 같은 출처 `/api` 쓰기 요청이 규칙 표(`member-action-registry`)의 「새 행동」이고, 서버가 알려 준 빠진 단계가
 *    있으면(`registration-pending-state`) 보내지 않고 「가입 이어하기」 창을 연다. 버튼에는 서버 거절과 같은 403 을 돌려준다.
 *    모르면 그대로 보낸다(서버가 판단).
 * 2) 안전망 — 서버가 403 `signup_incomplete`+`step` 을 주면 같은 창을 연다.
 * 3) 문구 — 응답의 `error`·`message` 를 사람 말(`auth_reg_gate_title`, 현재 화면 언어)로 바꾼다. `code`·`step` 은 그대로.
 *    원문 코드를 그대로 찍던 화면도 사람 말로 보인다. 동의 화면 이동(`redirectForBlockedAction`)도 일어나지 않는다.
 * 4) 버튼이 바뀐 응답 문장을 그대로 알림으로 띄우면 숨긴다(창과 중복) — 다른 오류 알림은 그대로.
 *
 * 제외: GET·HEAD · 다른 출처 · 통화 경로(`/calls`·`/call-`, 통화 규정). 장치 오류는 삼키고 그대로 보낸다.
 */
import { isRegistrationRequiredWrite } from "@/lib/auth/member-action-registry";
import { openRegistrationRequiredFromApiPayload } from "@/lib/auth/registration-required-client";
import {
  peekKnownRegistrationPendingStep,
  setRegistrationPendingFromServer,
  type RegistrationPendingStep,
} from "@/lib/auth/registration-pending-state.client";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { safeTranslate } from "@/lib/i18n/safe-translate";

const INSTALLED_MARK = "__dibayRegistrationGuidanceFetchGate";
const GUIDANCE_DEDUPE_MS = 1500;
const GUIDANCE_RECENT_MS = 2500;

let lastGuidanceAt = 0;

/** 「가입 이어하기」 창을 방금 열었나 — 버튼 쪽 오류 알림·동의 화면 이동을 건너뛰는 데 쓴다 */
export function isRegistrationGuidanceRecent(nowMs = Date.now()): boolean {
  return lastGuidanceAt > 0 && nowMs - lastGuidanceAt < GUIDANCE_RECENT_MS;
}

/**
 * 버튼 쪽 알림을 띄우지 않을 때 — 안내 문장 그 자체(응답 문구가 바뀐 경우)이거나, 창을 방금 연 순간의 오류 알림.
 */
export function shouldSuppressForRegistrationGuidance(message: string, _isError: boolean): boolean {
  /** 안내 창과 같은 문장(가입 거절 응답을 버튼이 그대로 띄우는 경우)만 숨긴다 — 상관없는 오류는 그대로(재감사3 #8) */
  if (lastGuidanceAt === 0) return false;
  return message.trim() === registrationGuidanceMessage();
}

/** 안내 문장 (현재 화면 언어) — 응답 문구 대체·알림 억제 비교에 같은 값을 쓴다 */
export function registrationGuidanceMessage(): string {
  return safeTranslate(getRuntimeAppLanguage(), "auth_reg_gate_title");
}

function openGuidanceOnce(step: RegistrationPendingStep): void {
  const now = Date.now();
  if (now - lastGuidanceAt < GUIDANCE_DEDUPE_MS) {
    lastGuidanceAt = now;
    return;
  }
  lastGuidanceAt = now;
  openRegistrationRequiredFromApiPayload({ code: "signup_incomplete", step });
}

function requestInfo(input: RequestInfo | URL, init?: RequestInit): { method: string; path: string } | null {
  if (typeof window === "undefined") return null;
  const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const raw = input instanceof Request ? input.url : String(input);
  let url: URL;
  try {
    url = new URL(raw, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  return { method, path: url.pathname };
}

export function isRegistrationGuidanceGatedRequest(method: string, path: string): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  if (!path.startsWith("/api/")) return false;
  if (path.includes("/calls") || path.includes("/call-")) return false;
  return true;
}

function guidanceBody(step: RegistrationPendingStep): string {
  const message = registrationGuidanceMessage();
  return JSON.stringify({ ok: false, code: "signup_incomplete", error: message, message, step, authenticated: true });
}

function guidanceResponse(step: RegistrationPendingStep, status = 403): Response {
  return new Response(guidanceBody(step), { status, headers: { "content-type": "application/json" } });
}

type FetchLike = typeof fetch;

export function wrapFetchWithRegistrationGuidance(base: FetchLike): FetchLike {
  const gated = async function registrationGuidanceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let info: { method: string; path: string } | null = null;
    try {
      info = requestInfo(input, init);
      if (info && isRegistrationGuidanceGatedRequest(info.method, info.path)) {
        const known = peekKnownRegistrationPendingStep();
        if (known && isRegistrationRequiredWrite(info.method, info.path)) {
          openGuidanceOnce(known);
          return guidanceResponse(known);
        }
      } else {
        info = null;
      }
    } catch {
      info = null;
    }
    const res = await base(input, init);
    if (!info || res.status !== 403) return res;
    try {
      const json = (await res.clone().json()) as { code?: unknown; step?: unknown } | null;
      if (json?.code !== "signup_incomplete" || (json.step !== "phone" && json.step !== "address")) return res;
      setRegistrationPendingFromServer(json.step);
      openGuidanceOnce(json.step);
      return guidanceResponse(json.step, res.status);
    } catch {
      return res;
    }
  } as FetchLike;
  (gated as unknown as Record<string, boolean>)[INSTALLED_MARK] = true;
  return gated;
}

/** 문서당 1회 — 세션 신선도 관문과 같은 곳에서 설치. 멱등. */
export function installRegistrationGuidanceFetchGate(): void {
  try {
    if (typeof window === "undefined" || typeof window.fetch !== "function") return;
    if ((window.fetch as unknown as Record<string, boolean>)[INSTALLED_MARK]) return;
    window.fetch = wrapFetchWithRegistrationGuidance(window.fetch.bind(window));
  } catch {
    /* 설치 실패 → 기존 fetch 그대로 (서버가 막는다) */
  }
}

export function resetRegistrationGuidanceForTests(): void {
  lastGuidanceAt = 0;
}
