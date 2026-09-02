import type { SupportContext } from "@/lib/support/support-context";
import {
  isSupportContextEnabled,
  SUPPORT_CONTEXT_SESSION_KEY,
} from "@/lib/support/support-context";
import { openSupportModal } from "@/lib/support/support-modal-controller";

export const SUPPORT_CENTER_ENTER_PATH = "/support/enter";

/** sessionStorage flag: cold-start case restore after shell mounts */
export const SUPPORT_MODAL_RESTORE_CASE_KEY = "dibay_support_modal_restore_case_id";

export type OpenSupportCenterResult =
  | { ok: true; href: string }
  | { ok: false; error: "disabled" | "storage_unavailable" };

/**
 * Canonical Support Center entry — FAB and inline CTAs must use this only.
 * sessionStorage stashes UX context only; authorization happens on POST /api/support/cases/open.
 * Daily path: opens Support Modal (does not hard-navigate).
 */
export function openSupportCenter(context: SupportContext): OpenSupportCenterResult {
  if (!isSupportContextEnabled(context)) {
    return { ok: false, error: "disabled" };
  }
  if (typeof window === "undefined") {
    return { ok: true, href: SUPPORT_CENTER_ENTER_PATH };
  }
  try {
    sessionStorage.setItem(SUPPORT_CONTEXT_SESSION_KEY, JSON.stringify(context));
  } catch {
    return { ok: false, error: "storage_unavailable" };
  }
  return { ok: true, href: SUPPORT_CENTER_ENTER_PATH };
}

export function readPendingSupportContext(): SupportContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SUPPORT_CONTEXT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SupportContext;
    if (!isSupportContextEnabled(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingSupportContext(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SUPPORT_CONTEXT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

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
 * Daily FAB/CTA entry — Support Modal on current shell (no hard navigation).
 * Falls back to /support/enter only if modal open fails (e.g. disabled).
 */
export function navigateToSupportCenter(context: SupportContext): boolean {
  const res = openSupportCenter(context);
  if (!res.ok) return false;
  if (openSupportModal({ context })) {
    return true;
  }
  window.location.assign(res.href);
  return true;
}
