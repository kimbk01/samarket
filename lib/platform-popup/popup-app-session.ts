/**
 * CUT 2 — Platform Popup app-session identity (SESSION suppression).
 * Survives route changes; resets on new browser/app session (sessionStorage).
 */

const SESSION_KEY = "dibay.platform_popup.app_session_id";

export function getOrCreatePlatformPopupAppSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY)?.trim();
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `pps-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `pps-mem-${Date.now().toString(36)}`;
  }
}

export function readPlatformPopupAppSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(SESSION_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * 광고 감사 G-6 — 이 앱 실행(같은 sessionStorage 수명 = SESSION 숨김과 같은 수명) 동안 다시 띄우지 않을 캠페인.
 * × 닫기·CTA 이동 후 기록. DB 숨김 행은 쓰지 않는다(`close_only` 「빈도 숨김 없음」 유지).
 * 호스트가 다시 마운트돼도(메인 ↔ 어드민 셸) 유지되도록 sessionStorage 에 둔다. 저장 실패 시 메모리.
 */
const SESSION_BLOCKED_KEY = "dibay.platform_popup.session_blocked_campaigns";
let sessionBlockedMemory: string[] = [];

function readSessionBlocked(): string[] {
  if (typeof window === "undefined") return sessionBlockedMemory;
  try {
    const raw = window.sessionStorage.getItem(SESSION_BLOCKED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return sessionBlockedMemory;
  }
}

export function addPlatformPopupSessionBlockedCampaign(campaignId: string): void {
  const id = campaignId.trim();
  if (!id) return;
  const next = [...new Set([...readSessionBlocked(), id])].slice(-200);
  sessionBlockedMemory = next;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_BLOCKED_KEY, JSON.stringify(next));
  } catch {
    /* 메모리 값 사용 */
  }
}

/** 재감사 E-7: 서버 조회에 같이 보내 1위가 막힌 캠페인이면 다음 순위를 받는다 */
export function listPlatformPopupSessionBlockedCampaigns(): string[] {
  return readSessionBlocked();
}

export function isPlatformPopupSessionBlockedCampaign(campaignId: string): boolean {
  return readSessionBlocked().includes(campaignId.trim());
}

/** 로그인 계정이 바뀌면 이전 계정의 닫기 기록을 쓰지 않는다 */
export function clearPlatformPopupSessionBlockedCampaigns(): void {
  sessionBlockedMemory = [];
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_BLOCKED_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 광고 최종 점검 P2 — 계정 변경 판정 (× 닫기 기록을 지울지).
 * 로그인 확인 중(`authReady=false`)은 계정이 정해지지 않은 상태라 판정하지 않는다: 새로고침 직후
 * 확인 중을 손님(`anon:`)으로 잡았다가 회원으로 확인되면 「계정 변경」으로 보고 닫은 기록을 지우던 결함.
 * 첫 확정값은 기준으로만 기록한다(변경 아님). 실제 로그인·로그아웃·계정 전환만 `changed=true`.
 */
export function decidePlatformPopupIdentity(input: {
  previous: string | null;
  authReady: boolean;
  userId: string | null;
  deviceKey: string;
}): { identity: string | null; changed: boolean } {
  if (!input.authReady) return { identity: input.previous, changed: false };
  const next = input.userId ?? `anon:${input.deviceKey}`;
  if (input.previous == null) return { identity: next, changed: false };
  return { identity: next, changed: input.previous !== next };
}

/** Tests only. */
export function resetPlatformPopupAppSessionIdForTests(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
