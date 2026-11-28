import { SUPPORT_CONTEXT_SESSION_KEY } from "@/lib/support/support-context";

/** sessionStorage flag: cold-start case restore after shell mounts */
export const SUPPORT_MODAL_RESTORE_CASE_KEY = "dibay_support_modal_restore_case_id";

export function stashSupportModalRestoreCaseId(caseId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SUPPORT_MODAL_RESTORE_CASE_KEY, caseId.trim());
  } catch {
    /* ignore */
  }
}

export function consumeSupportModalRestoreCaseId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = sessionStorage.getItem(SUPPORT_MODAL_RESTORE_CASE_KEY)?.trim() || null;
    if (id) sessionStorage.removeItem(SUPPORT_MODAL_RESTORE_CASE_KEY);
    return id;
  } catch {
    return null;
  }
}

/**
 * DEF-10 — user dismissed the Support sheet: drop the cold-start restore marker so a
 * later reload / full navigation does not re-open a case the user already closed.
 * Cold-start push restore is unaffected (the host consumes the marker on mount).
 */
export function clearSupportModalRestoreCaseId(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SUPPORT_MODAL_RESTORE_CASE_KEY);
  } catch {
    /* ignore */
  }
}

/* ───────────── 로그인 뒤 같은 창 (비로그인 「로그인」·「회원가입」) ───────────── */

/** 로그인 안내에서 로그인·가입으로 나갔다 — 로그인 뒤 같은 창(맥락은 SUPPORT_CONTEXT_SESSION_KEY · 문의면 그 id)을 다시 연다 */
export const SUPPORT_LOGIN_RETURN_KEY = "dibay_support_login_return";
/** 오래된 표시로 한참 뒤 로그인할 때 창이 뜨지 않게 */
export const SUPPORT_LOGIN_RETURN_TTL_MS = 30 * 60 * 1000;

export type SupportLoginReturn = {
  caseId: string | null;
  /** 이 로그인 시도가 기다리는 사용자(세션 만료 401 처럼 알 때만) — 다른 사용자가 로그인하면 버린다 */
  expectUserId: string | null;
};

/** 이 로그인 시도 1번의 표시 — 로그인 확인 때 열고, 비로그인 채 일반 화면으로 돌아오면 버린다 */
export function stashSupportLoginReturn(input: { caseId: string | null; expectUserId?: string | null }): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      SUPPORT_LOGIN_RETURN_KEY,
      JSON.stringify({ at: Date.now(), caseId: input.caseId, expectUserId: input.expectUserId ?? null })
    );
  } catch {
    /* ignore */
  }
}

/** 표시를 읽는다(지우지 않음) — 없거나 오래됐으면 null(오래된 것은 지움) */
export function readSupportLoginReturn(): SupportLoginReturn | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SUPPORT_LOGIN_RETURN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: unknown; caseId?: unknown; expectUserId?: unknown };
    const at = Number(parsed.at);
    if (!Number.isFinite(at) || Date.now() - at > SUPPORT_LOGIN_RETURN_TTL_MS) {
      // 3차 재감사: 표시와 그 로그인 시도의 맥락은 한 묶음 — 기한이 지나면 맥락도 지운다(나중 새로고침에 옛 쓰기 창 금지)
      sessionStorage.removeItem(SUPPORT_LOGIN_RETURN_KEY);
      sessionStorage.removeItem(SUPPORT_CONTEXT_SESSION_KEY);
      return null;
    }
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return { caseId: str(parsed.caseId), expectUserId: str(parsed.expectUserId) };
  } catch {
    return null;
  }
}

export function clearSupportLoginReturn(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SUPPORT_LOGIN_RETURN_KEY);
  } catch {
    /* ignore */
  }
}

export function hasSupportLoginReturn(): boolean {
  return readSupportLoginReturn() != null;
}

/** 표시를 꺼낸다(1번) — 없거나 오래됐으면 null */
export function consumeSupportLoginReturn(): SupportLoginReturn | null {
  const ret = readSupportLoginReturn();
  clearSupportLoginReturn();
  return ret;
}
