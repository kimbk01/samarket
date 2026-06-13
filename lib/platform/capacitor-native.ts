type CapacitorPluginHeader = {
  name: string;
  methods?: Array<{ name: string; rtype?: string }>;
};

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  nativePromise?: (pluginName: string, methodName: string, options?: unknown) => Promise<unknown>;
  PluginHeaders?: CapacitorPluginHeader[];
};

type WindowWithCapacitor = Window & {
  Capacitor?: CapacitorGlobal;
  androidBridge?: unknown;
  webkit?: {
    messageHandlers?: {
      bridge?: unknown;
    };
  };
};

export type DibayAppPlatform = "android" | "ios";

export const DIBAY_APP_MARKER_PARAM = "dibay_app";
export const DIBAY_APP_MARKER_STORAGE_KEY = "dibay_app";
export const DIBAY_APP_MARKER_COOKIE_NAME = "dibay_app";

export const NATIVE_OAUTH_LAUNCHER_PLUGIN_ID = "NativeOAuthLauncher";
export const NATIVE_APPLE_AUTH_PLUGIN_ID = "NativeAppleAuth";
export const NATIVE_KAKAO_AUTH_PLUGIN_ID = "NativeKakaoAuth";

const DIBAY_APP_PLATFORM_VALUES = new Set<DibayAppPlatform>(["android", "ios"]);

const DEFAULT_BRIDGE_READY_TIMEOUT_MS = 3_000;
const DEFAULT_BRIDGE_READY_INTERVAL_MS = 50;

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
  return resolveCapacitorShellPlatform();
}

/**
 * Remote server.url WebView — getPlatform() 이 "web" 이더라도 androidBridge·marker 로 shell 판별.
 * Native Kakao/Apple SDK 가용성은 isCapacitorNativePlatform() 과 동일 기준을 쓴다.
 */
export function resolveCapacitorShellPlatform(): DibayAppPlatform | null {
  const win = readWindowWithCapacitor();
  const cap = win?.Capacitor;
  const platform = cap?.getPlatform?.()?.trim().toLowerCase();
  if (platform === "android" || platform === "ios") {
    return platform;
  }
  if (win?.androidBridge) return "android";
  if (win?.webkit?.messageHandlers?.bridge) return "ios";
  if (cap?.isNativePlatform?.() === true) {
    if (typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)) {
      return "android";
    }
    if (typeof navigator !== "undefined" && /iPad|iPhone|iPod/i.test(navigator.userAgent)) {
      return "ios";
    }
  }
  return readDibayAppPlatformMarker();
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

export function hasAndroidBridge(): boolean {
  return Boolean(readWindowWithCapacitor()?.androidBridge);
}

export function hasIosCapacitorBridge(): boolean {
  return Boolean(readWindowWithCapacitor()?.webkit?.messageHandlers?.bridge);
}

export function hasNativeOAuthLauncherPluginHeader(): boolean {
  const headers = readWindowWithCapacitor()?.Capacitor?.PluginHeaders;
  if (!Array.isArray(headers)) return false;
  return headers.some((header) => header.name === NATIVE_OAUTH_LAUNCHER_PLUGIN_ID);
}

export function hasNativeAppleAuthPluginHeader(): boolean {
  const headers = readWindowWithCapacitor()?.Capacitor?.PluginHeaders;
  if (!Array.isArray(headers)) return false;
  return headers.some((header) => header.name === NATIVE_APPLE_AUTH_PLUGIN_ID);
}

export function hasNativeKakaoAuthPluginHeader(): boolean {
  const headers = readWindowWithCapacitor()?.Capacitor?.PluginHeaders;
  if (!Array.isArray(headers)) return false;
  return headers.some((header) => header.name === NATIVE_KAKAO_AUTH_PLUGIN_ID);
}

/**
 * Android/iOS Capacitor — NativeKakaoAuth plugin (Kakao SDK).
 * Web → false (Web OAuth 유지).
 */
export function isNativeKakaoLoginAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const platform = resolveCapacitorShellPlatform();
  if (platform !== "android" && platform !== "ios") return false;
  if (hasNativeKakaoAuthPluginHeader()) return true;
  return isCapacitorBridgeReady();
}

/**
 * iOS Capacitor — NativeAppleAuth plugin (AuthenticationServices).
 * Android / web → false (Apple Web OAuth 유지).
 */
export function isNativeAppleLoginAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (resolveCapacitorShellPlatform() !== "ios") return false;
  if (hasNativeAppleAuthPluginHeader()) return true;
  return isCapacitorBridgeReady();
}

export function hasCapacitorNativePromise(): boolean {
  const cap = readWindowWithCapacitor()?.Capacitor;
  return typeof cap?.nativePromise === "function";
}

/**
 * Capacitor JS → native 메시지 경로(androidBridge / iOS bridge)가 실제로 붙었는지.
 * implementation unavailable 은 postToNative 미설정 시 발생하므로 open 직전에 이 조건을 본다.
 */
export function isCapacitorBridgeReady(): boolean {
  return hasAndroidBridge() || hasIosCapacitorBridge();
}

/**
 * OAuth launch 실행 가능 여부 — dibay_app marker 단독으로는 true 가 되지 않는다.
 */
export function isOAuthNativeLaunchAvailable(): boolean {
  if (isCapacitorBridgeReady()) return true;

  const win = readWindowWithCapacitor();
  const platform = win?.Capacitor?.getPlatform?.()?.trim().toLowerCase();
  if (platform === "android" && hasCapacitorNativePromise() && hasNativeOAuthLauncherPluginHeader()) {
    return true;
  }

  return hasNativeOAuthLauncherPluginHeader();
}

/**
 * 앱 WebView 셸 안에서 OAuth launch 페이지로 진입할 수 있는지 (라우팅용).
 * marker 만 있어도 launch 페이지 진입은 허용하고, open 은 bridge ready 후에만 실행한다.
 */
export function isOAuthNativeLaunchShell(): boolean {
  if (readDibayAppPlatformMarker()) return true;
  return isCapacitorNativePlatform();
}

export type WaitForCapacitorBridgeReadyOptions = {
  timeoutMs?: number;
  intervalMs?: number;
};

export async function waitForCapacitorBridgeReady(
  options: WaitForCapacitorBridgeReadyOptions = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_BRIDGE_READY_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_BRIDGE_READY_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  if (isCapacitorBridgeReady()) return true;

  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, intervalMs);
    });
    if (isCapacitorBridgeReady()) return true;
  }

  return false;
}

export type CapacitorNativeDiagnostics = {
  hasCapacitor: boolean;
  isNativePlatform: boolean | null;
  platform: string | null;
  hasAndroidBridge: boolean;
  hasNativeOAuthLauncherPluginHeader: boolean;
  hasNativeAppleAuthPluginHeader: boolean;
  hasNativeKakaoAuthPluginHeader: boolean;
  nativeAppleLoginAvailable: boolean;
  nativeKakaoLoginAvailable: boolean;
  hasCapacitorNativePromise: boolean;
  bridgeReady: boolean;
  oauthNativeLaunchAvailable: boolean;
  dibayAppPlatformMarker: DibayAppPlatform | null;
  locationHref: string | null;
  detectedNative: boolean;
  oauthLaunchShell: boolean;
};

/** Logcat / Chrome Inspect 용 Capacitor native 감지 스냅샷 */
export function getCapacitorNativeDiagnostics(): CapacitorNativeDiagnostics {
  const win = readWindowWithCapacitor();
  const cap = win?.Capacitor;
  const isNativePlatform =
    typeof cap?.isNativePlatform === "function" ? cap.isNativePlatform() : null;
  const platform = typeof cap?.getPlatform === "function" ? cap.getPlatform() : null;
  const hasAndroidBridgeValue = hasAndroidBridge();
  const appPlatformMarker = readDibayAppPlatformMarker();
  return {
    hasCapacitor: Boolean(cap),
    isNativePlatform,
    platform,
    hasAndroidBridge: hasAndroidBridgeValue,
    hasNativeOAuthLauncherPluginHeader: hasNativeOAuthLauncherPluginHeader(),
    hasNativeAppleAuthPluginHeader: hasNativeAppleAuthPluginHeader(),
    hasNativeKakaoAuthPluginHeader: hasNativeKakaoAuthPluginHeader(),
    nativeAppleLoginAvailable: isNativeAppleLoginAvailable(),
    nativeKakaoLoginAvailable: isNativeKakaoLoginAvailable(),
    hasCapacitorNativePromise: hasCapacitorNativePromise(),
    bridgeReady: isCapacitorBridgeReady(),
    oauthNativeLaunchAvailable: isOAuthNativeLaunchAvailable(),
    dibayAppPlatformMarker: appPlatformMarker,
    locationHref: typeof window !== "undefined" ? window.location.href : null,
    detectedNative: isCapacitorNativePlatform(),
    oauthLaunchShell: isOAuthNativeLaunchShell(),
  };
}

/**
 * Capacitor Android/iOS WebView 셸에서 실행 중인지.
 * dibay_app marker 단독으로는 true 가 되지 않는다 (OAuth false-positive 방지).
 */
export function isCapacitorNativePlatform(): boolean {
  const win = readWindowWithCapacitor();
  if (!win) return false;

  if (win.androidBridge) return true;

  const cap = win.Capacitor;

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

  if (win.androidBridge) return true;
  if (win.Capacitor) {
    const platform = win.Capacitor.getPlatform?.();
    if (platform === "web") return false;
    if (platform === "android" || platform === "ios") return true;
    return true;
  }

  if (readDibayAppPlatformMarker()) return true;

  return false;
}
