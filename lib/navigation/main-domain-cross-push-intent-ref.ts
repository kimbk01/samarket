/**
 * Bottom-nav MAIN DOMAIN cross-push intent — survives until pathname layout consumes it.
 * Separates arm authority from pendingMenuIntent clear race.
 */

let pending = false;
let at = 0;
const MAX_AGE_MS = 4000;

export function setMainDomainCrossPushIntent(active: boolean): void {
  pending = active;
  at = Date.now();
  if (!active) pending = false;
}

export function peekMainDomainCrossPushIntent(): boolean {
  if (!pending) return false;
  if (Date.now() - at > MAX_AGE_MS) {
    pending = false;
    return false;
  }
  return true;
}

export function consumeMainDomainCrossPushIntent(): boolean {
  const ok = peekMainDomainCrossPushIntent();
  pending = false;
  return ok;
}
