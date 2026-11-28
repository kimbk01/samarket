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

export function stashSupportLoginReturn(input: { caseId: string | null }): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SUPPORT_LOGIN_RETURN_KEY, JSON.stringify({ at: Date.now(), caseId: input.caseId }));
  } catch {
    /* ignore */
  }
}

export function hasSupportLoginReturn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(sessionStorage.getItem(SUPPORT_LOGIN_RETURN_KEY));
  } catch {
    return false;
  }
}

/** 표시를 꺼낸다(1번) — 없거나 오래됐으면 null */
export function consumeSupportLoginReturn(): { caseId: string | null } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SUPPORT_LOGIN_RETURN_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SUPPORT_LOGIN_RETURN_KEY);
    const parsed = JSON.parse(raw) as { at?: unknown; caseId?: unknown };
    const at = Number(parsed.at);
    if (!Number.isFinite(at) || Date.now() - at > SUPPORT_LOGIN_RETURN_TTL_MS) return null;
    return { caseId: typeof parsed.caseId === "string" && parsed.caseId.trim() ? parsed.caseId.trim() : null };
  } catch {
    return null;
  }
}
