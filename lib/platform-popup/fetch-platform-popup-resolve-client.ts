/**
 * GET /api/platform-popup/resolve — client coalesce.
 * Canonical identity ignores `generation` (stale-guard only on client).
 */
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

export type PlatformPopupResolveClientJson = {
  ok?: boolean;
  winner?: unknown;
  reason?: string | null;
  surface?: string;
  generation?: string | null;
  impression?: boolean;
  error?: string;
};

export function platformPopupResolveFlightKey(input: {
  pathname: string;
  sessionKey: string;
  deviceKey: string;
}): string {
  const pathname = String(input.pathname || "/").trim() || "/";
  const sessionKey = String(input.sessionKey || "").trim();
  const deviceKey = String(input.deviceKey || "").trim();
  return `platform-popup:resolve:${pathname}|${sessionKey}|${deviceKey}`;
}

export async function fetchPlatformPopupResolveDeduped(input: {
  pathname: string;
  sessionKey: string;
  deviceKey: string;
  generation: string;
  signal?: AbortSignal;
}): Promise<{ status: number; json: PlatformPopupResolveClientJson }> {
  const pathname = String(input.pathname || "/").trim() || "/";
  const sessionKey = String(input.sessionKey || "").trim();
  const deviceKey = String(input.deviceKey || "").trim();
  const generation = String(input.generation || "").trim();
  const key = platformPopupResolveFlightKey({ pathname, sessionKey, deviceKey });

  if (input.signal?.aborted) {
    const err = new Error("AbortError");
    err.name = "AbortError";
    throw err;
  }

  const flight = runSingleFlight(key, async () => {
    const q = new URLSearchParams({
      pathname,
      sessionKey,
      deviceKey,
      generation,
    });
    const res = await fetch(`/api/platform-popup/resolve?${q.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      // Shared flight must not die when one effect aborts mid-cascade.
    });
    const json = (await res.json().catch(() => ({}))) as PlatformPopupResolveClientJson;
    return { status: res.status, json };
  });

  const result = await flight;
  if (input.signal?.aborted) {
    const err = new Error("AbortError");
    err.name = "AbortError";
    throw err;
  }
  return result;
}

/** @internal vitest */
export function __forgetPlatformPopupResolveFlightForTests(input: {
  pathname: string;
  sessionKey: string;
  deviceKey: string;
}): void {
  forgetSingleFlight(platformPopupResolveFlightKey(input));
}
