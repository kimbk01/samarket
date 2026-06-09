/** Permissions API 스냅샷만 — device-permission-manager 와 media-preflight 간 순환 의존 방지 */

export type CommunityMessengerMediaPermissionSnapshot = {
  microphone: PermissionState | null;
  camera: PermissionState | null;
};

let cachedPermissionSnapshot: CommunityMessengerMediaPermissionSnapshot | null = null;

/** `queryCommunityMessengerMediaPermissions` 마지막 결과 — sync ready·게이트 판정용 */
export function readCachedCommunityMessengerMediaPermissionsSync(): CommunityMessengerMediaPermissionSnapshot | null {
  return cachedPermissionSnapshot;
}

export function isCommunityMessengerMediaBrowserGrantedSync(kind: "voice" | "video"): boolean {
  const cached = readCachedCommunityMessengerMediaPermissionsSync();
  if (!cached || cached.microphone !== "granted") return false;
  if (kind === "video" && cached.camera !== "granted") return false;
  return true;
}

/**
 * Safari iOS 등 Permissions API 미지원·null — enumerateDevices 라벨로 허용 여부 추론.
 * (한 번 GUM 허용 후에는 deviceId/label 이 채워진다)
 */
export async function inferCommunityMessengerMediaGrantedFromDeviceLabels(
  kind: "voice" | "video"
): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const micGranted = devices.some(
      (d) => d.kind === "audioinput" && typeof d.label === "string" && d.label.trim().length > 0
    );
    if (!micGranted) return false;
    if (kind === "voice") return true;
    return devices.some(
      (d) => d.kind === "videoinput" && typeof d.label === "string" && d.label.trim().length > 0
    );
  } catch {
    return false;
  }
}

export async function queryCommunityMessengerMediaPermissions(): Promise<CommunityMessengerMediaPermissionSnapshot> {
  const out: CommunityMessengerMediaPermissionSnapshot = { microphone: null, camera: null };
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    cachedPermissionSnapshot = out;
    return out;
  }
  try {
    const mic = await navigator.permissions.query({ name: "microphone" as PermissionName });
    out.microphone = mic.state;
  } catch {
    /* Safari 등 미지원 */
  }
  try {
    const cam = await navigator.permissions.query({ name: "camera" as PermissionName });
    out.camera = cam.state;
  } catch {
    /* Safari 등 미지원 */
  }
  cachedPermissionSnapshot = out;
  return out;
}
