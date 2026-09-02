/**
 * Support Modal Controller SSOT — daily entry opens sheet overlay (not hard-nav).
 * Close ≠ resolve case / revoke session (Admin owns end consultation).
 */

import type { SupportContext } from "@/lib/support/support-context";
import { isSupportContextEnabled } from "@/lib/support/support-context";

export type SupportModalPhase = "closed" | "open";

export type SupportModalView = "START" | "LOADING" | "ACTIVE" | "RESOLVED";

export type SupportModalState = {
  phase: SupportModalPhase;
  context: SupportContext | null;
  caseId: string | null;
  /** When restoring an existing case from deeplink/bootstrap. */
  restoreCaseId: string | null;
};

const INITIAL: SupportModalState = {
  phase: "closed",
  context: null,
  caseId: null,
  restoreCaseId: null,
};

let state: SupportModalState = { ...INITIAL };
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function getSupportModalState(): SupportModalState {
  return state;
}

export function subscribeSupportModalState(onStore: () => void): () => void {
  listeners.add(onStore);
  return () => {
    listeners.delete(onStore);
  };
}

export function isSupportModalOpen(): boolean {
  return state.phase === "open";
}

export type OpenSupportModalInput = {
  context?: SupportContext | null;
  /** Open directly into an existing case (notification / cold-start). */
  caseId?: string | null;
};

/**
 * Open Support Sheet on the current shell. Does not create a case by itself.
 */
export function openSupportModal(input: OpenSupportModalInput = {}): boolean {
  const context = input.context ?? null;
  const caseId = input.caseId?.trim() || null;
  const enabled =
    context &&
    context.enabled === true &&
    (Boolean(String(context.category ?? "").trim()) ||
      context.needsCategorySelection === true);
  if (!caseId && !enabled) {
    return false;
  }
  state = {
    phase: "open",
    context: enabled ? context : null,
    caseId,
    restoreCaseId: caseId,
  };
  emit();
  return true;
}

/** UI-only close — does not resolve case or revoke session. */
export function closeSupportModal(): void {
  if (state.phase === "closed") return;
  state = { ...INITIAL };
  emit();
}

export function setSupportModalCaseId(caseId: string | null): void {
  if (state.phase !== "open") return;
  state = { ...state, caseId: caseId?.trim() || null, restoreCaseId: null };
  emit();
}

/** After 새 문의하기 — return to generic triage START (no silent reopen). */
export function resetSupportModalToStart(nextContext?: SupportContext | null): void {
  if (state.phase !== "open") return;
  state = {
    ...state,
    caseId: null,
    restoreCaseId: null,
    context:
      nextContext && isSupportContextEnabled(nextContext)
        ? nextContext
        : state.context
          ? {
              ...state.context,
              category: "",
              needsCategorySelection: true,
              referenceType: undefined,
              referenceId: undefined,
              explicitOtherSelection: undefined,
            }
          : null,
  };
  emit();
}
