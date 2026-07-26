/**
 * Owner hub badge poll may run only while an Owner surface explicitly marks itself active.
 * BottomNav/global shell must not keep the 180s interval alive after leaving Owner routes.
 */
let ownerSurfaceActiveCount = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function isDeliveryOwnerSurfaceActive(): boolean {
  return ownerSurfaceActiveCount > 0;
}

export function subscribeDeliveryOwnerSurfaceActive(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Call from Owner hub/runtime mount. Returns disposer. */
export function markDeliveryOwnerSurfaceActive(): () => void {
  ownerSurfaceActiveCount += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    ownerSurfaceActiveCount = Math.max(0, ownerSurfaceActiveCount - 1);
    emit();
  };
}
