/**
 * Owner ops drawer open — Support FAB must stay below drawer (overlay semantic).
 */

let open = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of listeners) cb();
}

export function setOwnerOpsDrawerOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  emit();
}

export function getOwnerOpsDrawerOpen(): boolean {
  return open;
}

export function subscribeOwnerOpsDrawerOpen(onStore: () => void): () => void {
  listeners.add(onStore);
  return () => {
    listeners.delete(onStore);
  };
}
