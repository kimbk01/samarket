/**
 * Badge/Notification First Divergence probe — log only.
 * DO NOT change control flow, totals, or delivery behavior.
 * Prefix: [badge-fd-probe]
 */
export function logBadgeFdProbe(
  stage: string,
  payload: Record<string, unknown> = {},
): void {
  try {
    console.info(
      `[badge-fd-probe] ${JSON.stringify({
        stage,
        ...payload,
        t: Date.now(),
      })}`,
    );
  } catch {
    // never throw from probe
  }
}
