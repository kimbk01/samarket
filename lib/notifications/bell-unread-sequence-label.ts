/**
 * Bell Modal unread presentation numbers.
 *
 * Contract:
 * - Unread count N → labels N … 1 (newest / top = N).
 * - NEVER 1 … N ascending.
 * - After one unread is opened/removed, remaining list re-labels from new length.
 *   Example: was 6,5,4,3,2,1 → open "3" → remaining 5,4,3,2,1.
 */
export function resolveBellUnreadSequenceLabel(index: number, total: number): string {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  const i = Math.max(0, Math.floor(Number(index) || 0));
  if (n <= 0 || i >= n) return "";
  return String(n - i).padStart(2, "0");
}
