/**
 * GET /api/platform-popup/resolve — client coalesce.
 * Canonical identity ignores `generation` (stale-guard only on client).
 */
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

export type PlatformPopupResolveClientJson = {
  ok?: boolean;
  winner?: unknown;
  /** 진입 감사 PO-2 — 한 번 진입에 순서대로 보일 팝업(첫 칸 = winner). 예전 서버는 없음 */
  queue?: unknown[];
  /** 어드민 가로 화면 허용 */
  allowLandscape?: boolean;
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
  landscape?: boolean;
}): string {
  const pathname = String(input.pathname || "/").trim() || "/";
  const sessionKey = String(input.sessionKey || "").trim();
  const deviceKey = String(input.deviceKey || "").trim();
  const exclude = normalizePlatformPopupExcludeIds(input.excludeCampaignIds).join(",");
  return `platform-popup:resolve:${pathname}|${sessionKey}|${deviceKey}|${exclude}|${input.landscape ? "L" : "P"}`;
}

/**
 * 진입 감사 PO-6 (2026-11-17) — 인트로가 도는 동안 미리 받아 둔 조회 결과.
 * 인트로 시간을 팝업 준비에 쓴다(배민: 스플래시 동안 광고 준비). 같은 키로 첫 조회 1회만 쓰고 지운다.
 */
const PREFETCH_TTL_MS = 30_000;
const prefetched = new Map<string, { at: number; p: Promise<{ status: number; json: PlatformPopupResolveClientJson }> }>();

export async function fetchPlatformPopupResolveDeduped(input: {
  pathname: string;
  sessionKey: string;
  deviceKey: string;
  generation: string;
  signal?: AbortSignal;
  excludeCampaignIds?: readonly string[];
  landscape?: boolean;
}): Promise<{ status: number; json: PlatformPopupResolveClientJson }> {
  const pathname = String(input.pathname || "/").trim() || "/";
  const sessionKey = String(input.sessionKey || "").trim();
  const deviceKey = String(input.deviceKey || "").trim();
  const generation = String(input.generation || "").trim();
  const exclude = normalizePlatformPopupExcludeIds(input.excludeCampaignIds);
  const landscape = input.landscape === true;
  const key = platformPopupResolveFlightKey({ pathname, sessionKey, deviceKey, excludeCampaignIds: exclude, landscape });

  if (input.signal?.aborted) {
    const err = new Error("AbortError");
    err.name = "AbortError";
    throw err;
  }

  // 재감사: 쓰이지 않은 오래된 미리 받기는 지운다(조건이 바뀌어 다시 안 불리는 키)
  for (const [k, v] of prefetched) if (Date.now() - v.at >= PREFETCH_TTL_MS) prefetched.delete(k);
  const pre = prefetched.get(key);
  if (pre) prefetched.delete(key);
  const flight =
    pre && Date.now() - pre.at < PREFETCH_TTL_MS
      ? pre.p
      : runSingleFlight(key, async () => {
    const q = new URLSearchParams({
      pathname,
      sessionKey,
      deviceKey,
      generation,
    });
    if (exclude.length) q.set("exclude", exclude.join(","));
    if (landscape) q.set("landscape", "1");
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

/**
 * 인트로 동안 미리 조회 + 소재 이미지 내려받기 시작(디코드는 표시 직전 `waitPlatformPopupImageReady`).
 * 실패해도 조용히 버린다 — 본 조회가 다시 받는다.
 */
export function prefetchPlatformPopupResolve(input: {
  pathname: string;
  sessionKey: string;
  deviceKey: string;
  excludeCampaignIds?: readonly string[];
  landscape?: boolean;
  preloadImage?: (url: string) => void;
}): void {
  const exclude = normalizePlatformPopupExcludeIds(input.excludeCampaignIds);
  const key = platformPopupResolveFlightKey({ ...input, excludeCampaignIds: exclude });
  const existing = prefetched.get(key);
  if (existing && Date.now() - existing.at < PREFETCH_TTL_MS) return;
  const p = fetchPlatformPopupResolveDeduped({ ...input, excludeCampaignIds: exclude, generation: "prefetch" });
  prefetched.set(key, { at: Date.now(), p });
  void p.then(
    ({ json }) => {
      const list = Array.isArray(json.queue) ? json.queue : json.winner ? [json.winner] : [];
      for (const w of list) {
        const url = (w as { creative?: { imageUrl?: unknown } } | null)?.creative?.imageUrl;
        if (typeof url === "string" && url.trim()) input.preloadImage?.(url);
      }
    },
    () => {
      if (prefetched.get(key)?.p === p) prefetched.delete(key);
    }
  );
}

/** @internal vitest */
export function __clearPlatformPopupPrefetchForTests(): void {
  prefetched.clear();
}

/** @internal vitest */
export function __forgetPlatformPopupResolveFlightForTests(input: {
  pathname: string;
  sessionKey: string;
  deviceKey: string;
}): void {
  forgetSingleFlight(platformPopupResolveFlightKey(input));
}
