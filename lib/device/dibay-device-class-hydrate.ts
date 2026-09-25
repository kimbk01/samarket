import {
  acceptNativeDibayDeviceClassResult,
  classifyWebDeviceClass,
  peekDibayDeviceClassSession,
  seedDibayDeviceClassSession,
  type DibayDeviceClassResult,
} from "@/lib/device/dibay-device-class";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

export const DIBAY_DEVICE_CLASS_INJECT_KEY = "__DIBAY_DEVICE_CLASS__";

export const DIBAY_PRE_RESOLUTION_UNKNOWN: DibayDeviceClassResult = {
  deviceClass: "UNKNOWN",
  source: "unclassified_web_environment",
  reason: "pre_resolution",
};

type WindowWithDeviceClassInject = Window & {
  [DIBAY_DEVICE_CLASS_INJECT_KEY]?: Partial<DibayDeviceClassResult>;
};

function readNavigatorEvidence(): {
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

export function readInjectedDibayDeviceClass(): DibayDeviceClassResult | null {
  if (typeof window === "undefined") return null;
  return acceptNativeDibayDeviceClassResult(
    (window as WindowWithDeviceClassInject)[DIBAY_DEVICE_CLASS_INJECT_KEY]
  );
}

/**
 * Synchronous DeviceClass for first client frame.
 * Native without inject stays UNKNOWN — not Phone, not Tablet, not Desktop.
 */
export function readDibayDeviceClassSync(): DibayDeviceClassResult {
  const session = peekDibayDeviceClassSession();
  if (session) return session;

  const injected = readInjectedDibayDeviceClass();
  if (injected && injected.deviceClass !== "UNKNOWN") {
    return seedDibayDeviceClassSession(injected);
  }

  const shell = resolveCapacitorShellPlatform();
  if (shell === "android" || shell === "ios") {
    return DIBAY_PRE_RESOLUTION_UNKNOWN;
  }

  if (typeof navigator === "undefined") {
    return DIBAY_PRE_RESOLUTION_UNKNOWN;
  }

  const web = classifyWebDeviceClass(readNavigatorEvidence());
  if (web.deviceClass !== "UNKNOWN") {
    return seedDibayDeviceClassSession(web);
  }
  return web;
}
