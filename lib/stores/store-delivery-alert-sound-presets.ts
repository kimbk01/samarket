/** 관리자 화면에서 선택 가능한 매장(배달) 알림음 — URL 직접 입력 없음 */

export const STORE_DELIVERY_NOTIFICATION_MP3_PATH = "/sounds/notification.mp3";

export type StoreDeliveryAlertSoundSelectId = "builtin" | "notif";

export const STORE_DELIVERY_ALERT_SOUND_OPTIONS: {
  id: StoreDeliveryAlertSoundSelectId;
  label: string;
  url: string | null;
}[] = [
  { id: "builtin", label: "기본 비프음 (브라우저)", url: null },
  { id: "notif", label: "알림음 — 벨·팝 (MP3)", url: STORE_DELIVERY_NOTIFICATION_MP3_PATH },
];

export function storeDeliverySoundSelectIdFromUrl(
  url: string | null | undefined,
  fromDb: boolean
): StoreDeliveryAlertSoundSelectId | "" {
  const u = typeof url === "string" ? url.trim() : "";
  if (!fromDb || !u) return "builtin";
  if (u === STORE_DELIVERY_NOTIFICATION_MP3_PATH) return "notif";
  return "";
}
