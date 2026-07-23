/**
 * Domain List Canary (trade / store_order_customer) — shared rollback-to-legacy
 * instrumentation + one-shot retry, mirroring DomainRoomReadCanaryGate's
 * `logDomainRoomLegacyFallback` (room gate) so list-gate fallback frequency is
 * auditable the same way: grep prod `[domain-list-canary] legacy_fallback`.
 *
 * Retry scope: only the domain-read list fetch itself (non-ok status or thrown
 * exception) gets one immediate retry before rollback — a transient network
 * blip is the one failure mode a same-request retry can plausibly fix. Post-200
 * failures (viewer_mismatch, clientValidate shape failures) are NOT retried:
 * they indicate a real data/identity mismatch, and retrying would just repeat
 * the same wrong result while adding latency.
 */

export type DomainListCanaryBundle = "trade" | "store_order_customer";

export function logDomainListCanaryLegacyFallback(input: {
  bundle: DomainListCanaryBundle;
  reason: string;
  httpStatus?: number | null;
  retried?: boolean;
  detail?: string | null;
}): void {
  console.info("[domain-list-canary] legacy_fallback", {
    bundle: input.bundle,
    reason: input.reason,
    httpStatus: input.httpStatus ?? null,
    retried: input.retried ?? false,
    detail: input.detail ?? null,
  });
}

const RETRY_BACKOFF_MS = 300;

export type DomainListCanaryFetchResult =
  | { ok: true; res: Response; retried: boolean }
  | { ok: false; res: Response | null; retried: boolean; threw: boolean };

/** One immediate retry on non-ok status or thrown exception; success short-circuits. */
export async function fetchDomainListCanaryWithRetry(
  input: RequestInfo,
  init?: RequestInit
): Promise<DomainListCanaryFetchResult> {
  const attempt = async (): Promise<{ res: Response | null; threw: boolean }> => {
    try {
      const res = await fetch(input, init);
      return { res, threw: false };
    } catch {
      return { res: null, threw: true };
    }
  };

  const first = await attempt();
  if (first.res?.ok) return { ok: true, res: first.res, retried: false };

  await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));

  const second = await attempt();
  if (second.res?.ok) return { ok: true, res: second.res, retried: true };
  return { ok: false, res: second.res, retried: true, threw: second.threw };
}
