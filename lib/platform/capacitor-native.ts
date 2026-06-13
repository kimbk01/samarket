type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

type WindowWithCapacitor = Window & {
  Capacitor?: CapacitorGlobal;
  androidBridge?: unknown;
};

function readWindowWithCapacitor(): WindowWithCapacitor | undefined {
  if (typeof window === "undefined") return undefined;
  return window as WindowWithCapacitor;
}

function readCapacitorGlobal(): CapacitorGlobal | undefined {
  return readWindowWithCapacitor()?.Capacitor;
}

export type CapacitorNativeDiagnostics = {
  hasCapacitor: boolean;
  isNativePlatform: boolean | null;
  platform: string | null;
  hasAndroidBridge: boolean;
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
  return {
    hasCapacitor: Boolean(cap),
    isNativePlatform,
    platform,
    hasAndroidBridge,
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

  const cap = win.Capacitor;
  if (cap?.isNativePlatform?.() === true) return true;

  const platform = cap?.getPlatform?.();
  if (platform === "android" || platform === "ios") return true;

  if (win.androidBridge) return true;

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
