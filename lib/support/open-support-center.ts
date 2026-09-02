import type { SupportContext } from "@/lib/support/support-context";
import {
  isSupportContextEnabled,
  SUPPORT_CONTEXT_SESSION_KEY,
} from "@/lib/support/support-context";
import { deliverSupportOpen } from "@/lib/support/deliver-support-open";

export const SUPPORT_CENTER_ENTER_PATH = "/support/enter";

/** sessionStorage flag: cold-start case restore after shell mounts */
export const SUPPORT_MODAL_RESTORE_CASE_KEY = "dibay_support_modal_restore_case_id";

export type OpenSupportCenterResult =
  | { ok: true; href: string }
  | { ok: false; error: "disabled" | "storage_unavailable" };

/**
 * Persist START context for cold enter alias only.
 * Daily FAB/CTA must use navigateToSupportCenter → deliverSupportOpen.
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
 * Daily FAB/CTA entry — deliverSupportOpen only (no hard navigation).
 */
export function navigateToSupportCenter(context: SupportContext): boolean {
  if (!isSupportContextEnabled(context)) return false;
  const delivered = deliverSupportOpen({ context, source: "fab" });
  return delivered.ok;
}
