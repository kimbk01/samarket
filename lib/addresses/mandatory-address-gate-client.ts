/**
 * GET /api/me/mandatory-address-gate — single-flight + short TTL (shell gate dedupe).
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { logShellFetchTrace } from "@/lib/dibay/shell-fetch-trace";

const GATE_FETCH_FLIGHT = "mandatory-address-gate:GET:/api/me/mandatory-address-gate";
const GATE_CLIENT_TTL_MS = 15_000;

let cached: { expiresAt: number; response: Response } | null = null;

export function peekMandatoryAddressGateCached(): Response | null {
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) cached = null;
    return null;
  }
  return cached.response.clone();
}

export function invalidateMandatoryAddressGateClientCache(): void {
  cached = null;
}

export function fetchMandatoryAddressGateDeduped(opts?: {
  component?: string;
  reason?: string;
  bypassCache?: boolean;
}): Promise<Response> {
  const component = opts?.component ?? "mandatory-address-gate-client";
  const reason = opts?.reason ?? "fetchMandatoryAddressGateDeduped";

  if (!opts?.bypassCache) {
    const hit = peekMandatoryAddressGateCached();
    if (hit) {
      logShellFetchTrace({
        api: "/api/me/mandatory-address-gate",
        component,
        reason: `${reason}_memory_hit`,
      });
      return Promise.resolve(hit);
    }
  }

  return runSingleFlight(GATE_FETCH_FLIGHT, () => {
    logShellFetchTrace({
      api: "/api/me/mandatory-address-gate",
      component,
      reason: `${reason}_network`,
    });
    return fetch("/api/me/mandatory-address-gate", {
      credentials: "include",
      cache: "no-store",
    });
  }).then((res) => {
    if (res.ok) {
      cached = { expiresAt: Date.now() + GATE_CLIENT_TTL_MS, response: res.clone() };
    } else {
      cached = null;
    }
    return res;
  });
}
