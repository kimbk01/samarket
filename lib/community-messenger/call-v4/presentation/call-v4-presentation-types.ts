/** V4 connected-layer presentation — platform capability tokens (SSOT). */
export type CallV4PresentationCapability =
  | "android_os_pip"
  | "ios_native_pip"
  | "ios_dock_fallback"
  | "web_floating_dock";

export type CallV4PresentationPlatform = "android" | "ios" | "web";

export type CallV4PresentationCapabilitySnapshot = {
  platform: CallV4PresentationPlatform;
  capabilities: CallV4PresentationCapability[];
  iosNativePipAvailable: boolean;
  floatingDock: boolean;
  osPipBridge: boolean;
};
