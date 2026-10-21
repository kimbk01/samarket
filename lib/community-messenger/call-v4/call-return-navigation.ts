"use client";

/**
 * P-7 / L-3 R2·R4·R6 — 통화 화면 push 진입 엔트리 토큰 (sessionStorage 단일 키).
 *
 * 문제: 방 안 수락·수신 배너 확장·통화 기록 행·웹 푸시는 `router.push` 로 통화 화면에 들어오는데
 * 종료는 `router.replace(복귀 주소)` 라 기록이 [방, 방] 이 되어 뒤로가기를 두 번 눌러야 했다.
 *
 * 규칙:
 * - push 직전에 `{ callId, originPath, at }` 를 남긴다(같은 탭 세션 한정 — sessionStorage).
 * - 통화 화면(CallV4Screen) 마운트 시 같은 callId 의 대기 토큰을 「armed」 로 바꾼다.
 * - 종료 시 armed 토큰이 현재 통화 라우트 callId 와 일치하면 `router.back()` **1회만** 한다.
 *   관찰 후 push 하는 폴백은 두지 않는다(`lib/navigation/history-back-fallback.ts` 이중 이동 이력).
 * - 일치하지 않거나 토큰이 없으면 기존처럼 replace(복귀 주소·방·채팅 목록).
 * - 통화 화면을 떠나면(통화 중 뒤로 = 최소화 등) armed 토큰을 지운다 — 이후 replace 로 다시 들어온
 *   통화 화면에서 back 이 엉뚱한 엔트리로 가지 않게 한다(R6: 끝난 화면 재방문은 replace).
 *
 * `history.state` 표시(R3)는 쓰지 않는다: Next 16.1 app-router 는 navigate·refresh·server action 시
 * `preserveCustomHistoryState=false` 로 현재 엔트리 state 를 덮어써 표시가 보존된다는 보장이 없다
 * (`next/dist/client/components/app-router.js` HistoryUpdater). 설계 L-3 선행 확인 규정대로 token 만 쓴다.
 *
 * 레거시 `/community-messenger/calls/<id>` 진입도 같은 callId 로 토큰을 남긴다 — V4 레인에서는
 * 해당 페이지가 `/calls-v4/<id>` 로 replace(같은 히스토리 엔트리)하므로 그대로 일치한다.
 */

const CALL_PUSH_ENTRY_KEY = "samarket.cm.call_push_entry.v1";

/** push → 통화 화면 마운트까지 허용 시간(레거시 경로 replace·청크 로드 포함) */
export const CALL_PUSH_ENTRY_PENDING_TTL_MS = 30_000;
/** armed 토큰 상한 — 장시간 통화도 덮도록 넉넉히 */
export const CALL_PUSH_ENTRY_ARMED_TTL_MS = 12 * 60 * 60 * 1000;

export type CallPushEntryToken = {
  callId: string;
  originPath: string;
  at: number;
  armed?: boolean;
};

/** back 1회 직후 같은 화면의 중복 exit 호출(타이머·이중 터미널)이 replace 를 덧붙이지 않게 한다. */
const BACK_EXIT_DEDUPE_MS = 2_000;
let lastBackExit: { callId: string; at: number } | null = null;

const CALL_SCREEN_ROUTE_RE = /^\/community-messenger\/calls(?:-v4)?\/([^/?#]+)/;

/** 통화 화면 경로에서 callId — `/calls/logs`·`/calls/outgoing` 은 통화 화면이 아니다. */
export function readCallIdFromCallScreenPath(path: string | null | undefined): string | null {
  const raw = String(path ?? "").trim();
  const match = CALL_SCREEN_ROUTE_RE.exec(raw);
  if (!match?.[1]) return null;
  let id = match[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    /* 원문 유지 */
  }
  id = id.trim();
  if (!id) return null;
  if (!raw.startsWith("/community-messenger/calls-v4/") && (id === "logs" || id === "outgoing")) return null;
  return id;
}

function isCallScreenPath(path: string): boolean {
  return readCallIdFromCallScreenPath(path) != null;
}

function readToken(): CallPushEntryToken | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CALL_PUSH_ENTRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CallPushEntryToken>;
    const callId = typeof parsed.callId === "string" ? parsed.callId.trim() : "";
    const originPath = typeof parsed.originPath === "string" ? parsed.originPath : "";
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    if (!callId || !originPath || !at) return null;
    return { callId, originPath, at, armed: parsed.armed === true };
  } catch {
    return null;
  }
}

function writeToken(token: CallPushEntryToken): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CALL_PUSH_ENTRY_KEY, JSON.stringify(token));
  } catch {
    /* quota / private mode — replace 경로로 동작 */
  }
}

export function clearCallScreenPushEntry(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CALL_PUSH_ENTRY_KEY);
  } catch {
    /* noop */
  }
}

function currentPath(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * R2 — 통화 화면으로 `router.push` 하기 직전에 호출. 현재 위치(origin)가 통화 화면이면 남기지 않는다.
 * `targetHref` 에서 callId 를 읽고, 없으면 `callId` 인자를 쓴다.
 */
export function markCallScreenPushEntry(callId: string | null | undefined, targetHref?: string | null): void {
  if (typeof window === "undefined") return;
  const sid = (readCallIdFromCallScreenPath(targetHref ?? "") ?? callId ?? "").trim();
  if (!sid) return;
  const origin = currentPath();
  if (!origin.startsWith("/") || origin.startsWith("//") || origin.length > 512) return;
  if (isCallScreenPath(origin)) return;
  /** 자동 수락 쿼리(`callAction=`)가 붙은 화면으로 back 하면 수락 effect 가 다시 돌 수 있다 → replace 경로 유지 */
  if (/[?&]callAction=/.test(origin)) {
    clearCallScreenPushEntry();
    return;
  }
  writeToken({ callId: sid, originPath: origin, at: Date.now() });
}

/** 통화 화면 마운트 — 같은 callId 의 대기 토큰을 armed 로 전환한다. */
export function armCallScreenPushEntryOnMount(callId: string, now = Date.now()): boolean {
  const sid = callId.trim();
  if (!sid) return false;
  /** R6 — back 후 앞으로 가기로 같은 통화 화면이 새로 마운트되면 중복 방지 표시를 풀어 replace 가 동작하게 */
  if (lastBackExit?.callId === sid) lastBackExit = null;
  const token = readToken();
  if (!token || token.callId !== sid) return false;
  if (token.armed) {
    if (now - token.at > CALL_PUSH_ENTRY_ARMED_TTL_MS) {
      clearCallScreenPushEntry();
      return false;
    }
    return true;
  }
  if (now - token.at > CALL_PUSH_ENTRY_PENDING_TTL_MS) {
    clearCallScreenPushEntry();
    return false;
  }
  writeToken({ ...token, armed: true, at: now });
  return true;
}

/**
 * 통화 화면 언마운트 후 — 더 이상 같은 callId 통화 화면 위가 아니면 armed 토큰을 지운다.
 * (StrictMode 재마운트·tmp→real 같은 엔트리 교체에서는 경로가 그대로라 유지된다.)
 */
export function releaseCallScreenPushEntryIfLeft(callId: string): void {
  const sid = callId.trim();
  const token = readToken();
  if (!token || token.callId !== sid || !token.armed) return;
  if (readCallIdFromCallScreenPath(typeof window !== "undefined" ? window.location.pathname : "") === sid) return;
  clearCallScreenPushEntry();
}

/** R4 — 종료 시 현재 통화 라우트 callId 와 일치하는 armed 토큰을 1회 소비한다. */
export function takeArmedCallScreenPushEntry(routeCallId: string | null | undefined, now = Date.now()): CallPushEntryToken | null {
  const sid = (routeCallId ?? "").trim();
  const token = readToken();
  if (!token) return null;
  clearCallScreenPushEntry();
  if (!sid || token.callId !== sid || !token.armed) return null;
  if (now - token.at > CALL_PUSH_ENTRY_ARMED_TTL_MS) return null;
  return token;
}


export function noteCallScreenBackExit(callId: string, now = Date.now()): void {
  lastBackExit = { callId: callId.trim(), at: now };
}

export function isCallScreenBackExitInFlight(routeCallId: string | null | undefined, now = Date.now()): boolean {
  const sid = (routeCallId ?? "").trim();
  if (!sid || !lastBackExit) return false;
  return lastBackExit.callId === sid && now - lastBackExit.at < BACK_EXIT_DEDUPE_MS;
}

export function resetCallReturnNavigationForTests(): void {
  lastBackExit = null;
  clearCallScreenPushEntry();
}
