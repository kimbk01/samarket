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

type MandatoryAddressGateJson = {
  ok?: boolean;
  authenticated?: boolean;
  needsBlock?: boolean;
};

/** 대표 주소 미등록 등으로 주소 게이트가 화면을 막는지 (알림 온보딩 등 다른 오버레이 지연용) */
export async function readMandatoryAddressGateNeedsBlock(): Promise<boolean> {
  try {
    const res = await fetchMandatoryAddressGateDeduped({
      component: "mandatory-address-gate-client",
      reason: "readMandatoryAddressGateNeedsBlock",
    });
    if (!res.ok) return false;
    const j = (await res.clone().json()) as MandatoryAddressGateJson;
    return j.ok === true && j.authenticated === true && j.needsBlock === true;
  } catch {
    return false;
  }
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
