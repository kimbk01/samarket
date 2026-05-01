/** Permissions API 스냅샷만 — device-permission-manager 와 media-preflight 간 순환 의존 방지 */

export type CommunityMessengerMediaPermissionSnapshot = {
  microphone: PermissionState | null;
  camera: PermissionState | null;
};

export async function queryCommunityMessengerMediaPermissions(): Promise<CommunityMessengerMediaPermissionSnapshot> {
  const out: CommunityMessengerMediaPermissionSnapshot = { microphone: null, camera: null };
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return out;
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
  return out;
}
