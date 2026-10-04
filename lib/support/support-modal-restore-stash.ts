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
