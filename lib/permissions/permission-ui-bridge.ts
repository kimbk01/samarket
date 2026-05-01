/**
 * PermissionGuideModal 과 device-permission-manager 사이의 비 React 브리지.
 * 사용자 제스처 이후에만 모달을 띄우고, Promise 로 결과를 되돌린다.
 */

import type { DevicePermissionKind } from "@/lib/permissions/device-permission-kind";

export type PermissionGuideChoice = "allow" | "later";

type Pending = {
  kind: DevicePermissionKind;
  resolve: (choice: PermissionGuideChoice) => void;
} | null;

let pending: Pending = null;
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

export function subscribePermissionUiBridge(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getPermissionGuidePending(): Pending {
  return pending;
}

export function openPermissionGuideModal(kind: DevicePermissionKind): Promise<PermissionGuideChoice> {
  return new Promise((resolve) => {
    pending = { kind, resolve };
    bump();
  });
}

export function settlePermissionGuideModal(choice: PermissionGuideChoice): void {
  if (!pending) return;
  const r = pending.resolve;
  pending = null;
  r(choice);
  bump();
}
