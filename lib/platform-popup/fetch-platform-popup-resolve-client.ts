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

/** 재감사 E-7: 이 앱 실행 동안 닫은·이동한 캠페인 — 서버가 후보에서 빼고 다음 순위를 고른다 */
export function normalizePlatformPopupExcludeIds(ids: readonly string[] | null | undefined): string[] {
  return [...new Set((ids ?? []).map((id) => String(id).trim()).filter(Boolean))].sort().slice(0, 50);
}

export function platformPopupResolveFlightKey(input: {
  pathname: string;
  sessionKey: string;
  deviceKey: string;
  excludeCampaignIds?: readonly string[];
}): string {
  const pathname = String(input.pathname || "/").trim() || "/";
  const sessionKey = String(input.sessionKey || "").trim();
  const deviceKey = String(input.deviceKey || "").trim();
  const exclude = normalizePlatformPopupExcludeIds(input.excludeCampaignIds).join(",");
  return `platform-popup:resolve:${pathname}|${sessionKey}|${deviceKey}|${exclude}`;
}

export async function fetchPlatformPopupResolveDeduped(input: {
  pathname: string;
  sessionKey: string;
  deviceKey: string;
  generation: string;
  signal?: AbortSignal;
  excludeCampaignIds?: readonly string[];
}): Promise<{ status: number; json: PlatformPopupResolveClientJson }> {
  const pathname = String(input.pathname || "/").trim() || "/";
  const sessionKey = String(input.sessionKey || "").trim();
  const deviceKey = String(input.deviceKey || "").trim();
  const generation = String(input.generation || "").trim();
  const exclude = normalizePlatformPopupExcludeIds(input.excludeCampaignIds);
  const key = platformPopupResolveFlightKey({ pathname, sessionKey, deviceKey, excludeCampaignIds: exclude });

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
    if (exclude.length) q.set("exclude", exclude.join(","));
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
