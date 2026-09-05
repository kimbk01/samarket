/**
 * OwnerMobileBottomNav mount occupancy — Support FAB / overlay clearance SSOT.
 * Independent of main BottomNav (`useBottomNavOccupiesClearance`).
 */

let occupiesClearance = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Call when Owner bottom nav is mounted and should reserve clearance. */
export function setOwnerBottomNavOccupiesClearance(next: boolean): void {
  if (occupiesClearance === next) return;
  occupiesClearance = next;
  emit();
}

export function getOwnerBottomNavOccupiesClearance(): boolean {
  return occupiesClearance;
}

export function subscribeOwnerBottomNavOccupiesClearance(onStore: () => void): () => void {
  listeners.add(onStore);
  return () => {
    listeners.delete(onStore);
  };
}
