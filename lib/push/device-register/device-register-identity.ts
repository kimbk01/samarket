export type DeviceRegisterIdentity = {
  userId: string;
  deviceId: string;
  pushToken: string;
  platform: string;
  pushProvider: string;
};

export type DeviceRegisterPath = "native_http" | "js_fetch";

export function suffixId(value: string, len = 6): string {
  const v = value.trim();
  if (!v) return "";
  return v.length <= len ? v : v.slice(-len);
}

export function deviceRegisterIdentityKey(identity: DeviceRegisterIdentity): string {
  const userId = identity.userId.trim();
  const deviceId = identity.deviceId.trim();
  const pushToken = identity.pushToken.trim();
  const platform = identity.platform.trim().toLowerCase();
  const pushProvider = identity.pushProvider.trim().toLowerCase();
  return `${userId}|${deviceId}|${platform}|${pushProvider}|${pushToken}`;
}

export function deviceRegisterLogPayload(
  identity: DeviceRegisterIdentity,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    userIdSuffix: suffixId(identity.userId),
    deviceIdSuffix: suffixId(identity.deviceId),
    tokenSuffix: suffixId(identity.pushToken, 8),
    platform: identity.platform.trim().toLowerCase(),
    pushProvider: identity.pushProvider.trim().toLowerCase(),
    ...extra,
  };
}
