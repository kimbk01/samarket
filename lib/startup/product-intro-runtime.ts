/** Runtime gate — Product Intro overlay suppresses competing first-entry ads. */

let productIntroOverlayActive = false;
const listeners = new Set<() => void>();

export function setProductIntroOverlayActive(active: boolean): void {
  if (productIntroOverlayActive === active) return;
  productIntroOverlayActive = active;
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

export function isProductIntroOverlayActive(): boolean {
  return productIntroOverlayActive;
}

export function subscribeProductIntroOverlayActive(onStore: () => void): () => void {
  listeners.add(onStore);
  return () => {
    listeners.delete(onStore);
  };
}
