/**
 * Permission education UI ↔ orchestrator bridge (non-React).
 */

import type { PermissionEducationChoice, PermissionEducationContext } from "@/lib/permissions/education/permission-education-types";

type EducationPending = {
  context: PermissionEducationContext;
  resolve: (choice: PermissionEducationChoice) => void;
} | null;

let educationPending: EducationPending = null;
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

export function openPermissionEducationSheet(
  context: PermissionEducationContext,
): Promise<PermissionEducationChoice> {
  return new Promise((resolve) => {
    educationPending = { context, resolve };
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
