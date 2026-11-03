/**
 * PTR 띠 광고 — 클라이언트 프리페치·디코드 캐시 (화면 표면별 1건).
 *
 * 불변조건
 * - PTR 엔진(store.run)은 이 모듈을 기다리지 않는다 — 광고 실패·지연이 새로고침을 막지 않음.
 * - 유휴 시간에 조회·디코드를 끝낸 광고만 노출(당김 중 네트워크 대기 없음).
 * - 노출 1회 = 새로고침 1사이클(exposureId). 노출 종료 후 빈도 억제 기록 → 캐시 무효화 → 다음 유휴에 재조회.
 */

import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";
import { getOrCreatePlatformPopupAppSessionId } from "@/lib/platform-popup/popup-app-session";
import type { PtrRevealAd } from "@/lib/platform-popup/ptr-reveal-payload";
import { frequencyModeToDismissSuppressMode, isFrequencySuppressMode } from "@/lib/platform-popup/dismiss-ssot";
import {
  isPlatformPopupAdvertisingSurface,
  resolveDibaySurface,
} from "@/lib/platform-popup/resolve-dibay-surface";

export type { PtrRevealAd, PtrRevealBand } from "@/lib/platform-popup/ptr-reveal-payload";

/** 조회 결과 유효 시간 — 기간 시작·종료·승인 변경이 늦어도 이 시간 안에 반영 */
export const PTR_REVEAL_CACHE_TTL_MS = 5 * 60 * 1000;
/** 조회 타임아웃 — 넘으면 이번 사이클은 광고 없음 */
export const PTR_REVEAL_FETCH_TIMEOUT_MS = 4000;

export type PtrRevealDeviceVariant = "default" | "tablet";

/**
 * `variant` = 조회·디코드한 기기 변형(휴대폰/태블릿 띠). 화면 폭이 바뀌어 변형이 달라지면
 * 디코드 안 된 띠를 그리지 않도록 다시 조회한다 (광고 감사 R-6 · 계약 §3.6).
 */
type Entry =
  | { status: "loading"; at: number; variant: PtrRevealDeviceVariant }
  | { status: "ready"; at: number; ad: PtrRevealAd; variant: PtrRevealDeviceVariant }
  | { status: "none"; at: number; variant: PtrRevealDeviceVariant };

const entries = new Map<string, Entry>();
/**
 * `close_only`(매 노출 허용) — 팝업 호스트의 "닫은 뒤 화면을 바꾸기 전 재노출 금지" 와 같은 의미로,
 * 같은 화면(표면)에 머무는 동안 새로고침마다 반복 노출하지 않는다. 다른 표면으로 이동하면 해제.
 * DB 억제 행은 쓰지 않는다(팝업 CLOSE 와 동일하게 미래 노출을 막지 않음).
 */
const closeOnlyHeld = new Map<string, string>(); // surfaceKey → campaignId
/**
 * 빈도 억제 기록(POST)이 서버에 닿기 전 — 그 캠페인을 다시 보여 주지 않고, 기록이 끝난 뒤에만
 * 캐시를 비워 재조회한다 (광고 감사 R-5: 재조회가 억제 행보다 먼저 도착해 같은 광고가 다시 나오던 경합).
 */
const pendingSuppress = new Map<string, string>(); // surfaceKey → campaignId
let lastSurfaceKey: string | null = null;
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version += 1;
  for (const l of listeners) l();
}

export function subscribePtrRevealAds(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPtrRevealAdsVersion(): number {
  return version;
}

/** 광고 대상 표면이 아니면 null (메신저·통화·결제·주문 핵심·관리자 외 미분류) */
export function ptrRevealSurfaceKey(pathname: string | null | undefined): string | null {
  const surface = resolveDibaySurface(pathname);
  return isPlatformPopupAdvertisingSurface(surface) ? surface : null;
}

/** 표면 이동 감지 — 다른 표면으로 가면 close_only 보류 해제 */
function noteSurface(key: string | null): void {
  if (key === lastSurfaceKey) return;
  lastSurfaceKey = key;
  for (const k of [...closeOnlyHeld.keys()]) if (k !== key) closeOnlyHeld.delete(k);
}

export function readPtrRevealAd(
  pathname: string | null | undefined,
  deviceVariant: PtrRevealDeviceVariant
): PtrRevealAd | null {
  const key = ptrRevealSurfaceKey(pathname);
  noteSurface(key);
  if (!key) return null;
  const e = entries.get(key);
  if (e?.status !== "ready") return null;
  if (e.variant !== deviceVariant) return null;
  if (closeOnlyHeld.get(key) === e.ad.campaignId) return null;
  if (pendingSuppress.get(key) === e.ad.campaignId) return null;
  return e.ad;
}

function decodeImage(url: string): Promise<boolean> {
  if (typeof Image === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (typeof img.decode === "function") {
        img.decode().then(
          () => resolve(true),
          () => resolve(true)
        );
      } else resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function scheduleIdle(fn: () => void): void {
  const w = typeof window !== "undefined" ? (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }) : null;
  if (w?.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 2000 });
  else setTimeout(fn, 300);
}

/**
 * 유휴 시간에 조회 + 기기 변형(휴대폰/태블릿 띠)·로고 디코드. 이미 유효한 항목이 있으면 무동작.
 * `deviceVariant` 이미지가 없으면(태블릿인데 태블릿 띠 없음) 광고 없음으로 둔다.
 */
export function ensurePtrRevealAd(
  pathname: string | null | undefined,
  deviceVariant: PtrRevealDeviceVariant
): void {
  if (typeof window === "undefined") return;
  const key = ptrRevealSurfaceKey(pathname);
  noteSurface(key);
  if (!key) return;
  if (pendingSuppress.has(key)) return;
  const now = Date.now();
  const cur = entries.get(key);
  if (
    cur &&
    cur.variant === deviceVariant &&
    (cur.status === "loading" || now - cur.at < PTR_REVEAL_CACHE_TTL_MS)
  ) {
    return;
  }
  entries.set(key, { status: "loading", at: now, variant: deviceVariant });

  scheduleIdle(() => {
    void (async () => {
      let next: Entry = { status: "none", at: Date.now(), variant: deviceVariant };
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), PTR_REVEAL_FETCH_TIMEOUT_MS);
        const q = new URLSearchParams({
          pathname: String(pathname || "/"),
          sessionKey: getOrCreatePlatformPopupAppSessionId(),
          deviceKey: ensureClientInstanceId(),
        });
        const res = await fetch(`/api/platform-popup/ptr-reveal?${q.toString()}`, {
          credentials: "same-origin",
          signal: ctrl.signal,
        }).finally(() => clearTimeout(timer));
        const json = (await res.json().catch(() => null)) as { ad?: PtrRevealAd | null } | null;
        const ad = res.ok ? (json?.ad ?? null) : null;
        const band = ad ? (deviceVariant === "tablet" ? ad.bands.tablet : ad.bands.default) : null;
        if (ad && band && (await decodeImage(band.imageUrl))) {
          if (ad.bands.logo) await decodeImage(ad.bands.logo.imageUrl);
          next = { status: "ready", at: Date.now(), ad, variant: deviceVariant };
        }
      } catch {
        /* 광고 실패는 조용히 무광고 — 새로고침과 무관 */
      }
      // 그 사이 다른 변형으로 다시 조회를 시작했으면 이 결과는 버린다
      const latest = entries.get(key);
      if (latest && latest.status === "loading" && latest.variant !== deviceVariant) return;
      entries.set(key, next);
      emit();
    })();
  });
}

/**
 * 노출 종료(띠가 접힘) 또는 CTA 클릭 후 — 캠페인 빈도 정책으로 억제 기록, 캐시 무효화.
 * close_only 는 억제 행을 쓰지 않고, 같은 표면에 머무는 동안만 재노출을 보류한다(표면 이동 시 해제).
 */
export function finishPtrRevealExposure(pathname: string | null | undefined, ad: PtrRevealAd): void {
  const key = ptrRevealSurfaceKey(pathname);
  const mode = frequencyModeToDismissSuppressMode(ad.frequencyMode);
  if (!isFrequencySuppressMode(mode)) {
    if (key) {
      entries.delete(key);
      closeOnlyHeld.set(key, ad.campaignId);
      emit();
    }
    return;
  }
  // R-5: 억제 기록이 끝날 때까지 이 캠페인은 보류, 끝난 뒤 캐시를 비워 재조회
  if (key) {
    pendingSuppress.set(key, ad.campaignId);
    emit();
  }
  const release = () => {
    if (!key || pendingSuppress.get(key) !== ad.campaignId) return;
    pendingSuppress.delete(key);
    entries.delete(key);
    emit();
  };
  try {
    void fetch("/api/platform-popup/suppress", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: ad.campaignId,
        mode,
        sessionKey: getOrCreatePlatformPopupAppSessionId(),
        deviceKey: ensureClientInstanceId(),
        durationSeconds: mode === "DURATION" ? ad.suppressionDurationSeconds : undefined,
        timezone: ad.timezone,
      }),
    })
      .catch(() => {})
      .finally(release);
  } catch {
    release();
  }
}

/** @internal vitest */
export function __resetPtrRevealAdsForTests(): void {
  entries.clear();
  closeOnlyHeld.clear();
  pendingSuppress.clear();
  lastSurfaceKey = null;
  listeners.clear();
  version = 0;
}

/** @internal vitest·미리보기 */
export function __setPtrRevealAdForTests(
  surfaceKey: string,
  ad: PtrRevealAd | null,
  variant: PtrRevealDeviceVariant = "default"
): void {
  entries.set(
    surfaceKey,
    ad ? { status: "ready", at: Date.now(), ad, variant } : { status: "none", at: Date.now(), variant }
  );
  emit();
}
