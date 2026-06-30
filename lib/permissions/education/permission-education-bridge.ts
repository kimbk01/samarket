/**
 * Permission education UI ↔ orchestrator bridge (non-React).
 */

import type { PermissionCapabilitySummary, PermissionEducationChoice, PermissionEducationContext } from "@/lib/permissions/education/permission-education-types";

type EducationPending = {
  context: PermissionEducationContext;
  summary?: PermissionCapabilitySummary;
  resolve: (choice: PermissionEducationChoice) => void;
} | null;

let educationPending: EducationPending = null;
let diagnosticOpen = false;
let successToastMessage: string | null = null;
const listeners = new Set<() => void>();

function bump(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function subscribePermissionEducationBridge(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getPermissionEducationPending(): EducationPending {
  return educationPending;
}

export function isPermissionDiagnosticOpen(): boolean {
  return diagnosticOpen;
}

export function getPermissionEducationSuccessToast(): string | null {
  return successToastMessage;
}

export function openPermissionEducationSheet(
  context: PermissionEducationContext,
  summary?: PermissionCapabilitySummary,
): Promise<PermissionEducationChoice> {
  return new Promise((resolve) => {
    educationPending = { context, summary, resolve };
    bump();
  });
}

export function settlePermissionEducationSheet(choice: PermissionEducationChoice): void {
  if (!educationPending) return;
  const r = educationPending.resolve;
  educationPending = null;
  r(choice);
  bump();
}

export function openPermissionDiagnosticSheet(): void {
  diagnosticOpen = true;
  bump();
}

export function closePermissionDiagnosticSheet(): void {
  if (!diagnosticOpen) return;
  diagnosticOpen = false;
  bump();
}

export function showPermissionEducationSuccessToast(message: string): void {
  successToastMessage = message;
  bump();
  setTimeout(() => {
    if (successToastMessage === message) {
      successToastMessage = null;
      bump();
    }
  }, 3200);
}

export function clearPermissionEducationSuccessToast(): void {
  successToastMessage = null;
  bump();
}
