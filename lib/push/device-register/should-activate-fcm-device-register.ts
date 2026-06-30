const UUID_DEVICE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LEGACY_FRESH_UUID_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function isUuidDeviceId(deviceId: string): boolean {
  return UUID_DEVICE_ID_RE.test(deviceId.trim());
}

export function isLegacyDibayDeviceId(deviceId: string): boolean {
  return deviceId.trim().toLowerCase().startsWith("dibay-");
}

type FcmPeerRow = {
  device_id?: string | null;
  last_seen_at?: string | null;
};

/**
 * Legacy `dibay-*` client_instance_id rows must not override a fresher UUID device row.
 */
export function shouldActivateFcmDeviceRegister(
  deviceId: string,
  pushProvider: string,
  peers: FcmPeerRow[],
  nowMs = Date.now(),
): boolean {
  if (pushProvider !== "fcm") return true;
  if (!isLegacyDibayDeviceId(deviceId)) return true;

  const cutoff = nowMs - LEGACY_FRESH_UUID_WINDOW_MS;
  return !peers.some((row) => {
    const peerDeviceId = String(row.device_id ?? "").trim();
    if (!isUuidDeviceId(peerDeviceId)) return false;
    const seenAt = Date.parse(String(row.last_seen_at ?? ""));
    return Number.isFinite(seenAt) && seenAt >= cutoff;
  });
}
