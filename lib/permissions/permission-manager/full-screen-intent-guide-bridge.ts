/**
 * FullScreenIntentGuideHost ↔ guide flow bridge (non-React).
 */

export type FullScreenIntentGuideContext = "login" | "call";

export type FullScreenIntentGuideChoice = "open_settings" | "later" | "dismiss_permanent";

type Pending = {
  context: FullScreenIntentGuideContext;
  resolve: (choice: FullScreenIntentGuideChoice) => void;
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

export function subscribeFullScreenIntentGuideBridge(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getFullScreenIntentGuidePending(): Pending {
  return pending;
}

export function openFullScreenIntentGuideSheet(
  context: FullScreenIntentGuideContext,
): Promise<FullScreenIntentGuideChoice> {
  return new Promise((resolve) => {
    pending = { context, resolve };
    bump();
  });
}

export function settleFullScreenIntentGuideSheet(choice: FullScreenIntentGuideChoice): void {
  if (!pending) return;
  const r = pending.resolve;
  pending = null;
  r(choice);
  bump();
}

export function resetFullScreenIntentGuideBridgeForTests(): void {
  pending = null;
  listeners.clear();
}
