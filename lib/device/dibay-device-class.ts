import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { readNativeDibayDeviceClass } from "@/lib/device/dibay-device-class-native";

export type DibayDeviceClass =
  | "PHONE_ANDROID"
  | "PHONE_IOS"
  | "TABLET_ANDROID"
  | "TABLET_IPAD"
  | "DESKTOP_WINDOWS"
  /** Apple Silicon Mac 에서 도는 iOS 앱 (iOS 네이티브 `ProcessInfo.isiOSAppOnMac`) — S2 */
  | "DESKTOP_MAC"
  | "WEB_DESKTOP"
  | "UNKNOWN";

export type DibayDeviceClassSource =
  | "smallestScreenWidthDp"
  /** Android: sw >= 600 only because of display zoom (factory-density sw < 600) → phone (native only). */
  | "stableDensity"
  | "screenLayout"
  | "userInterfaceIdiom"
  /** iOS: Apple Silicon Mac 에서 실행 중 (idiom 은 pad 여도 Mac) */
  | "ios_app_on_mac"
  | "windows_environment"
  | "desktop_web_environment"
  | "native_plugin_unavailable"
  | "unsupported_idiom"
  | "android_configuration_unavailable"
  | "unclassified_web_environment";

export type AndroidScreenLayoutSize = "SMALL" | "NORMAL" | "LARGE" | "XLARGE" | "UNDEFINED" | "UNKNOWN";

export type IosUserInterfaceIdiom = "phone" | "pad" | "unspecified" | "mac" | "tv" | "carPlay" | "vision" | "other";

export type DibayDeviceClassResult = {
  deviceClass: DibayDeviceClass;
  source: DibayDeviceClassSource;
  reason?: string;
  smallestScreenWidthDp?: number | null;
  screenLayoutSize?: AndroidScreenLayoutSize | null;
  fallbackScreenLayout?: AndroidScreenLayoutSize | null;
  conflict?: boolean;
  stableSmallestScreenWidthDp?: number | null;
};

export const ANDROID_TABLET_SMALLEST_WIDTH_DP = 600;

export const DIBAY_DEVICE_CLASSES: readonly DibayDeviceClass[] = [
  "PHONE_ANDROID",
  "PHONE_IOS",
  "TABLET_ANDROID",
  "TABLET_IPAD",
  "DESKTOP_WINDOWS",
  "DESKTOP_MAC",
  "WEB_DESKTOP",
  "UNKNOWN",
];

const DIBAY_DEVICE_CLASS_SET = new Set<string>(DIBAY_DEVICE_CLASSES);

let sessionResolved: DibayDeviceClassResult | null = null;

export function isDibayDeviceClass(value: unknown): value is DibayDeviceClass {
  return typeof value === "string" && DIBAY_DEVICE_CLASS_SET.has(value);
}

export function classifyAndroidDeviceClass(input: {
  smallestScreenWidthDp?: number | null;
  screenLayoutSize?: AndroidScreenLayoutSize | null;
}): DibayDeviceClassResult {
  const sw = input.smallestScreenWidthDp;
  const layout = normalizeAndroidScreenLayoutSize(input.screenLayoutSize);
  const layoutTablet = androidScreenLayoutIsTablet(layout);

  if (isUsableSmallestScreenWidthDp(sw)) {
    const deviceClass: DibayDeviceClass = sw >= ANDROID_TABLET_SMALLEST_WIDTH_DP ? "TABLET_ANDROID" : "PHONE_ANDROID";
    const conflict = layoutTablet != null && layoutTablet !== (deviceClass === "TABLET_ANDROID");
    return {
      deviceClass,
      source: "smallestScreenWidthDp",
      smallestScreenWidthDp: sw,
      screenLayoutSize: layout,
      fallbackScreenLayout: layout,
      conflict,
    };
  }

  if (layoutTablet === true) {
    return {
      deviceClass: "TABLET_ANDROID",
      source: "screenLayout",
      smallestScreenWidthDp: null,
      screenLayoutSize: layout,
      fallbackScreenLayout: layout,
      conflict: false,
    };
  }

  if (layoutTablet === false) {
    return {
      deviceClass: "PHONE_ANDROID",
      source: "screenLayout",
      smallestScreenWidthDp: null,
      screenLayoutSize: layout,
      fallbackScreenLayout: layout,
      conflict: false,
    };
  }

  return {
    deviceClass: "UNKNOWN",
    source: "android_configuration_unavailable",
    reason: "android_configuration_unavailable",
    smallestScreenWidthDp: null,
    screenLayoutSize: layout,
    fallbackScreenLayout: layout,
    conflict: false,
  };
}

export function classifyIosDeviceClass(input: {
  userInterfaceIdiom?: string | null;
}): DibayDeviceClassResult {
  const idiom = normalizeIosUserInterfaceIdiom(input.userInterfaceIdiom);
  if (idiom === "phone") {
    return { deviceClass: "PHONE_IOS", source: "userInterfaceIdiom" };
  }
  if (idiom === "pad") {
    return { deviceClass: "TABLET_IPAD", source: "userInterfaceIdiom" };
  }
  return {
    deviceClass: "UNKNOWN",
    source: "unsupported_idiom",
    reason: "unsupported_idiom",
  };
}

export function classifyWebDeviceClass(input: {
  userAgent?: string | null;
  platform?: string | null;
  userAgentDataPlatform?: string | null;
  userAgentDataMobile?: boolean | null;
  maxTouchPoints?: number | null;
}): DibayDeviceClassResult {
  if (isProvenWindowsEnvironment(input)) {
    return { deviceClass: "DESKTOP_WINDOWS", source: "windows_environment" };
  }
  if (isIpadDesktopUserAgent(input) || isMobileWebUserAgent(input)) {
    return {
      deviceClass: "UNKNOWN",
      source: "unclassified_web_environment",
      reason: "unclassified_web_environment",
    };
  }
  if (isProvenDesktopWebEnvironment(input)) {
    return { deviceClass: "WEB_DESKTOP", source: "desktop_web_environment" };
  }
  return {
    deviceClass: "UNKNOWN",
    source: "unclassified_web_environment",
    reason: "unclassified_web_environment",
  };
}

/**
 * Native plugin already classified. JS must not recompute DeviceClass from width.
 */
export function acceptNativeDibayDeviceClassResult(
  native: Partial<DibayDeviceClassResult> | null | undefined,
): DibayDeviceClassResult | null {
  if (!native || !isDibayDeviceClass(native.deviceClass) || typeof native.source !== "string") {
    return null;
  }
  const accepted: DibayDeviceClassResult = {
    deviceClass: native.deviceClass,
    source: native.source as DibayDeviceClassSource,
  };
  if (typeof native.reason === "string") accepted.reason = native.reason;
  if (native.smallestScreenWidthDp !== undefined) accepted.smallestScreenWidthDp = native.smallestScreenWidthDp;
  if (native.screenLayoutSize !== undefined) accepted.screenLayoutSize = native.screenLayoutSize;
  if (native.fallbackScreenLayout !== undefined) accepted.fallbackScreenLayout = native.fallbackScreenLayout;
  if (typeof native.conflict === "boolean") accepted.conflict = native.conflict;
  if (typeof native.stableSmallestScreenWidthDp === "number") {
    accepted.stableSmallestScreenWidthDp = native.stableSmallestScreenWidthDp;
  }
  return accepted;
}

export function peekDibayDeviceClassSession(): DibayDeviceClassResult | null {
  return sessionResolved;
}

/** FD4 hydrate only. Does not reclassify. Refuses UNKNOWN so pre-resolution cannot pin the session. */
export function seedDibayDeviceClassSession(result: DibayDeviceClassResult): DibayDeviceClassResult {
  if (!isDibayDeviceClass(result.deviceClass) || result.deviceClass === "UNKNOWN") {
    return result;
  }
  if (!sessionResolved) sessionResolved = result;
  return sessionResolved;
}

export function resetDibayDeviceClassSessionForTests(): void {
  sessionResolved = null;
}

/**
 * 기기 종류 판정 — 성공 결과만 이번 실행 동안 고정한다.
 * 2026-11-19 (Owner 승인 D1, `docs/audit/mac-bottom-nav-device-class-2026-11-19.md`): 네이티브 판정 실패(`UNKNOWN`)를
 * 고정하면 그 실행 내내 맥·태블릿이 하단 메뉴로 굳었다 — 첫 그림 규칙(`seedDibayDeviceClassSession`)과 같게 `UNKNOWN` 은 저장하지 않는다.
 */
export async function resolveDibayDeviceClass(): Promise<DibayDeviceClassResult> {
  if (sessionResolved) return sessionResolved;
  const result = await resolveDibayDeviceClassUncached();
  if (result.deviceClass !== "UNKNOWN") sessionResolved = result;
  return result;
}

/** D2 — 판정 실패 뒤 다시 판정하는 대기 시간(정해진 3회). 그 밖에 앱이 앞으로 돌아올 때 1회. */
export const DIBAY_DEVICE_CLASS_RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000];

/**
 * 셸용 판정 시작 — 결과를 `onResult` 로 알리고, `UNKNOWN` 이면 정해진 횟수만 다시 판정한다
 * (D2: 1·2·4초 뒤 3회 + 앱 복귀 1회, 무한 반복 없음). 성공하면 멈춘다. 돌려받은 함수로 멈춘다.
 */
export function startDibayDeviceClassResolution(
  onResult: (result: DibayDeviceClassResult) => void,
  delaysMs: readonly number[] = DIBAY_DEVICE_CLASS_RETRY_DELAYS_MS
): () => void {
  let stopped = false;
  let done = false;
  let inFlight = false;
  let attempt = 0;
  let resumeUsed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastClass: DibayDeviceClass | null = null;
  const hasDocument = typeof document !== "undefined";

  const detach = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    if (hasDocument) document.removeEventListener("visibilitychange", onVisible);
  };

  const run = () => {
    if (stopped || done || inFlight) return;
    inFlight = true;
    void resolveDibayDeviceClass()
      .catch(
        (): DibayDeviceClassResult => ({
          deviceClass: "UNKNOWN",
          source: "native_plugin_unavailable",
          reason: "native_plugin_unavailable",
        })
      )
      .then((result) => {
        inFlight = false;
        if (stopped) return;
        if (result.deviceClass !== lastClass) {
          lastClass = result.deviceClass;
          onResult(result);
        }
        if (result.deviceClass !== "UNKNOWN") {
          done = true;
          detach();
          return;
        }
        const delay = delaysMs[attempt];
        attempt += 1;
        if (delay != null) timer = setTimeout(run, delay);
      });
  };

  function onVisible() {
    if (stopped || done || resumeUsed || inFlight) return;
    if (document.visibilityState !== "visible") return;
    resumeUsed = true;
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    run();
  }

  if (hasDocument) document.addEventListener("visibilitychange", onVisible);
  run();
  return () => {
    stopped = true;
    detach();
  };
}

async function resolveDibayDeviceClassUncached(): Promise<DibayDeviceClassResult> {
  const shell = resolveCapacitorShellPlatform();
  if (shell === "android" || shell === "ios") {
    const native = acceptNativeDibayDeviceClassResult(await readNativeDibayDeviceClass());
    if (native) return native;
    return {
      deviceClass: "UNKNOWN",
      source: "native_plugin_unavailable",
      reason: "native_plugin_unavailable",
    };
  }
  return classifyWebDeviceClass(readWebDeviceClassEvidence());
}

function isUsableSmallestScreenWidthDp(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeAndroidScreenLayoutSize(
  value: string | null | undefined,
): AndroidScreenLayoutSize | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "SMALL" ||
    normalized === "NORMAL" ||
    normalized === "LARGE" ||
    normalized === "XLARGE" ||
    normalized === "UNDEFINED" ||
    normalized === "UNKNOWN"
  ) {
    return normalized;
  }
  return "UNKNOWN";
}

function androidScreenLayoutIsTablet(size: AndroidScreenLayoutSize | null): boolean | null {
  if (size === "LARGE" || size === "XLARGE") return true;
  if (size === "NORMAL" || size === "SMALL") return false;
  return null;
}

function normalizeIosUserInterfaceIdiom(value: string | null | undefined): IosUserInterfaceIdiom {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "phone" || normalized === ".phone") return "phone";
  if (normalized === "pad" || normalized === ".pad") return "pad";
  if (
    normalized === "unspecified" ||
    normalized === "mac" ||
    normalized === "tv" ||
    normalized === "carplay" ||
    normalized === "vision"
  ) {
    return normalized === "carplay" ? "carPlay" : (normalized as IosUserInterfaceIdiom);
  }
  return "other";
}

function isProvenWindowsEnvironment(input: {
  userAgent?: string | null;
  platform?: string | null;
  userAgentDataPlatform?: string | null;
}): boolean {
  const ua = input.userAgent ?? "";
  const platform = input.platform ?? "";
  const uaDataPlatform = input.userAgentDataPlatform ?? "";
  if (/windows/i.test(uaDataPlatform)) return true;
  if (/^(Win32|Win64|Windows)$/i.test(platform) && !/Android/i.test(ua)) return true;
  return /\bWindows(?: NT| Phone)?\b|\bWin64\b|\bWOW64\b/i.test(ua) && !/Android/i.test(ua);
}

function isIpadDesktopUserAgent(input: {
  userAgent?: string | null;
  platform?: string | null;
  maxTouchPoints?: number | null;
}): boolean {
  const ua = input.userAgent ?? "";
  const platform = input.platform ?? "";
  const touch = input.maxTouchPoints ?? 0;
  return touch > 1 && (/Macintosh/i.test(ua) || /MacIntel/i.test(platform));
}

function isMobileWebUserAgent(input: { userAgent?: string | null; userAgentDataMobile?: boolean | null }): boolean {
  if (input.userAgentDataMobile === true) return true;
  return /iPhone|iPod|iPad|Android/i.test(input.userAgent ?? "");
}

function isProvenDesktopWebEnvironment(input: {
  userAgent?: string | null;
  platform?: string | null;
  userAgentDataPlatform?: string | null;
  userAgentDataMobile?: boolean | null;
}): boolean {
  const blob = `${input.userAgent ?? ""} ${input.platform ?? ""} ${input.userAgentDataPlatform ?? ""}`;
  if (/Macintosh|Mac OS X|MacIntel|Linux|X11|CrOS|Chrome OS/i.test(blob)) return true;
  return input.userAgentDataMobile === false && /macOS|Linux|Chrome OS/i.test(input.userAgentDataPlatform ?? "");
}

function readWebDeviceClassEvidence(): {
  userAgent: string | null;
  platform: string | null;
  userAgentDataPlatform: string | null;
  userAgentDataMobile: boolean | null;
  maxTouchPoints: number | null;
} {
  if (typeof navigator === "undefined") {
    return {
      userAgent: null,
      platform: null,
      userAgentDataPlatform: null,
      userAgentDataMobile: null,
      maxTouchPoints: null,
    };
  }
  const uaData = (navigator as Navigator & {
    userAgentData?: { platform?: string; mobile?: boolean };
  }).userAgentData;
  return {
    userAgent: navigator.userAgent ?? null,
    platform: navigator.platform ?? null,
    userAgentDataPlatform: uaData?.platform ?? null,
    userAgentDataMobile: typeof uaData?.mobile === "boolean" ? uaData.mobile : null,
    maxTouchPoints: typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : null,
  };
}
