export type AppleIapServerConfig = {
  bundleId: string;
  /** App Review·TestFlight 결제는 Sandbox — 허용 여부는 Owner 결정 (`APPLE_IAP_ALLOW_SANDBOX=1`) */
  allowSandbox: boolean;
};

/** `APPLE_IAP_BUNDLE_ID` 가 없으면 Apple 결제를 열지 않는다 (null). */
export function readAppleIapServerConfig(): AppleIapServerConfig | null {
  const bundleId = String(process.env.APPLE_IAP_BUNDLE_ID ?? "").trim();
  if (!bundleId) return null;
  return {
    bundleId,
    allowSandbox: String(process.env.APPLE_IAP_ALLOW_SANDBOX ?? "").trim() === "1",
  };
}
