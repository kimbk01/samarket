type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

type WindowWithCapacitor = Window & {
  Capacitor?: CapacitorGlobal;
  androidBridge?: unknown;
};

export type DibayAppPlatform = "android" | "ios";

export const DIBAY_APP_MARKER_PARAM = "dibay_app";
export const DIBAY_APP_MARKER_STORAGE_KEY = "dibay_app";
export const DIBAY_APP_MARKER_COOKIE_NAME = "dibay_app";

const DIBAY_APP_PLATFORM_VALUES = new Set<DibayAppPlatform>(["android", "ios"]);

function readWindowWithCapacitor(): WindowWithCapacitor | undefined {
  if (typeof window === "undefined") return undefined;
  return window as WindowWithCapacitor;
}

function normalizeDibayAppPlatform(value: string | null | undefined): DibayAppPlatform | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (DIBAY_APP_PLATFORM_VALUES.has(normalized as DibayAppPlatform)) {
    return normalized as DibayAppPlatform;
  }
  return null;
}

function persistDibayAppMarker(platform: DibayAppPlatform): void {
  try {
    window.sessionStorage?.setItem(DIBAY_APP_MARKER_STORAGE_KEY, platform);
  } catch {
    // Storage may be blocked; cookie still gives same-route persistence.
  }

  try {
    document.cookie = `${DIBAY_APP_MARKER_COOKIE_NAME}=${platform}; path=/; max-age=2592000; samesite=lax`;
  } catch {
    // Cookie writes can fail in restricted WebViews; marker detection remains best-effort.
  }
}

function readDibayAppMarkerFromCurrentUrl(): DibayAppPlatform | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URL(window.location.href).searchParams;
    const platform = normalizeDibayAppPlatform(params.get(DIBAY_APP_MARKER_PARAM));
    if (!platform) return null;
    persistDibayAppMarker(platform);
    return platform;
  } catch {
    return null;
  }
}

function readPersistedDibayAppMarker(): DibayAppPlatform | null {
  if (typeof window === "undefined") return null;

  try {
    const platform = normalizeDibayAppPlatform(
      window.sessionStorage?.getItem(DIBAY_APP_MARKER_STORAGE_KEY)
    );
    if (platform) {
      return platform;
    }
  } catch {
    // Ignore storage access failures and fall through to cookie.
  }

  try {
    const marker = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${DIBAY_APP_MARKER_COOKIE_NAME}=`));
    if (!marker) return null;
    return normalizeDibayAppPlatform(decodeURIComponent(marker.split("=").slice(1).join("=")));
  } catch {
    return null;
  }
}

export function readDibayAppPlatformMarker(): DibayAppPlatform | null {
  return readDibayAppMarkerFromCurrentUrl() || readPersistedDibayAppMarker();
}

function resolveCapacitorPlatformMarker(): DibayAppPlatform | null {
  const win = readWindowWithCapacitor();
  const cap = win?.Capacitor;
  const platform = cap?.getPlatform?.()?.trim().toLowerCase();
  if (platform === "android" || platform === "ios") {
    return platform;
  }
  if (cap?.isNativePlatform?.() === true) {
    // isNativePlatform only — UA/platform hint when getPlatform is delayed
    if (typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)) {
      return "android";
    }
    if (typeof navigator !== "undefined" && /iPad|iPhone|iPod/i.test(navigator.userAgent)) {
      return "ios";
    }
  }
  return null;
}

/**
 * 앱 부팅·OAuth 시작 직전에 dibay_app marker를 eager persist 한다.
 * Capacitor API 우선, URL query·sessionStorage·cookie 순으로 보강.
 */
export function ensureCapacitorNativeMarkerOnBoot(): DibayAppPlatform | null {
  const fromUrl = readDibayAppMarkerFromCurrentUrl();
  if (fromUrl) return fromUrl;

  const persisted = readPersistedDibayAppMarker();
  if (persisted) return persisted;

  const fromCapacitor = resolveCapacitorPlatformMarker();
  if (fromCapacitor) {
    persistDibayAppMarker(fromCapacitor);
    return fromCapacitor;
  }

  return null;
}

export type CapacitorNativeDiagnostics = {
  hasCapacitor: boolean;
  isNativePlatform: boolean | null;
  platform: string | null;
  hasAndroidBridge: boolean;
  dibayAppPlatformMarker: DibayAppPlatform | null;
  detectedNative: boolean;
};

/** Logcat / Chrome Inspect 용 Capacitor native 감지 스냅샷 */
export function getCapacitorNativeDiagnostics(): CapacitorNativeDiagnostics {
  const win = readWindowWithCapacitor();
  const cap = win?.Capacitor;
  const isNativePlatform =
    typeof cap?.isNativePlatform === "function" ? cap.isNativePlatform() : null;
  const platform = typeof cap?.getPlatform === "function" ? cap.getPlatform() : null;
  const hasAndroidBridge = Boolean(win?.androidBridge);
  const appPlatformMarker = readDibayAppPlatformMarker();
  return {
    hasCapacitor: Boolean(cap),
    isNativePlatform,
    platform,
    hasAndroidBridge,
    dibayAppPlatformMarker: appPlatformMarker,
    detectedNative: isCapacitorNativePlatform(),
  };
}

/**
 * Capacitor Android/iOS WebView 셸에서 실행 중인지.
 * 원격 server.url WebView 에서 isNativePlatform() 만으로 놓치는 경우를 보강한다.
 */
export function isCapacitorNativePlatform(): boolean {
  const win = readWindowWithCapacitor();
  if (!win) return false;

  if (readDibayAppPlatformMarker()) return true;

  const cap = win.Capacitor;

  if (win.androidBridge) return true;

  const platform = cap?.getPlatform?.();
  if (platform === "android" || platform === "ios") return true;

  if (cap?.isNativePlatform?.() === true) return true;

  return false;
}

/**
 * appUrlOpen 리스너 등록 후보 — 웹 브라우저에서는 false, Capacitor 셸(감지 지연 포함)은 true.
 */
export function shouldRegisterCapacitorOAuthReturnListener(): boolean {
  if (isCapacitorNativePlatform()) return true;

  const win = readWindowWithCapacitor();
  if (!win) return false;

  // Capacitor bridge 주입 직전/직후: androidBridge 또는 Capacitor 객체만 있는 경우 재시도 대상
  if (win.androidBridge) return true;
  if (win.Capacitor) {
    const platform = win.Capacitor.getPlatform?.();
    if (platform === "web") return false;
    if (platform === "android" || platform === "ios") return true;
    // platform 아직 미설정 — Capacitor 객체 존재 시 리스너 등록 시도
    return true;
  }

  return false;
}
