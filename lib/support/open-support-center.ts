import type { SupportContext } from "@/lib/support/support-context";
import {
  isSupportContextEnabled,
  SUPPORT_CONTEXT_SESSION_KEY,
} from "@/lib/support/support-context";

export const SUPPORT_CENTER_ENTER_PATH = "/support/enter";

export type OpenSupportCenterResult =
  | { ok: true; href: string }
  | { ok: false; error: "disabled" | "storage_unavailable" };

/**
 * Canonical Support Center entry — FAB and inline CTAs must use this only.
 * sessionStorage stashes UX context only; authorization happens on POST /api/support/cases/open.
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

export function navigateToSupportCenter(context: SupportContext): boolean {
  const res = openSupportCenter(context);
  if (!res.ok) return false;
  window.location.assign(res.href);
  return true;
}
