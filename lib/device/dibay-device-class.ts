import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { readNativeDibayDeviceClass } from "@/lib/device/dibay-device-class-native";

export type DibayDeviceClass =
  | "PHONE_ANDROID"
  | "PHONE_IOS"
  | "TABLET_ANDROID"
  | "TABLET_IPAD"
  | "DESKTOP_WINDOWS"
  | "WEB_DESKTOP"
  | "UNKNOWN";

export type DibayDeviceClassSource =
  | "smallestScreenWidthDp"
  | "screenLayout"
  | "userInterfaceIdiom"
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
};

export const ANDROID_TABLET_SMALLEST_WIDTH_DP = 600;

export const DIBAY_DEVICE_CLASSES: readonly DibayDeviceClass[] = [
  "PHONE_ANDROID",
  "PHONE_IOS",
  "TABLET_ANDROID",
  "TABLET_IPAD",
  "DESKTOP_WINDOWS",
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

export async function resolveDibayDeviceClass(): Promise<DibayDeviceClassResult> {
  if (sessionResolved) return sessionResolved;
  sessionResolved = await resolveDibayDeviceClassUncached();
  return sessionResolved;
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
