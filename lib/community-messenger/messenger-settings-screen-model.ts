import type { MessageKey } from "@/lib/i18n/messages";
import type { MessengerNotificationSettings } from "@/lib/community-messenger/home/community-messenger-home-types";
import type { MessengerSettingsPage } from "@/lib/community-messenger/messenger-sub-screen-route";

/**
 * 채팅 설정 첫 화면 묶음 (채팅 시안 4판 「7. 채팅 설정」) — 「알림」 켬/끔 다음 줄, 순서 = 화면 순서.
 * 「친구」 묶음은 시안에 없다: 예전 설정 시트의 친구 항목(전화번호로 친구 추가 · 연락처 자동 추가 · 즐겨찾기 관리)은
 * 다른 곳에 없어서 지우지 않고 「친구」 상세에 모았다(Owner 지시 「기능은 지우지 않는다」). 친구 관리 = 보관함.
 */
export const MESSENGER_SETTINGS_ROOT_GROUPS: readonly {
  page: Exclude<MessengerSettingsPage, "root">;
  labelKey: MessageKey;
  rowKey: MessageKey;
}[] = [
  { page: "call", labelKey: "cm_settings_page_call", rowKey: "cm_settings_row_call" },
  { page: "conversation", labelKey: "cm_settings_page_conversation", rowKey: "cm_settings_row_conversation" },
  { page: "meeting", labelKey: "cm_settings_page_meeting", rowKey: "cm_settings_row_meeting" },
  { page: "friends", labelKey: "cm_settings_page_friends", rowKey: "cm_settings_row_friends" },
];

/**
 * 「소리 · 진동」 한 줄 = 서버 설정 `sound_enabled`(채팅 알림 소리) + `vibration_enabled`(진동) 두 칸을 함께 켜고 끈다.
 * 둘 다 켜져 있을 때만 켜짐으로 보인다. 두 칸을 따로 바꾸는 줄은 내정보 › 설정 › 알림(같은 서버 값)에 그대로 있다.
 */
export function messengerSoundVibrationChecked(settings: Pick<MessengerNotificationSettings, "sound_enabled" | "vibration_enabled">): boolean {
  return settings.sound_enabled && settings.vibration_enabled;
}

export function messengerSoundVibrationPatch(next: boolean): Pick<MessengerNotificationSettings, "sound_enabled" | "vibration_enabled"> {
  return { sound_enabled: next, vibration_enabled: next };
}

/** 알림 설정 저장 중 표시 키 — 한 칸이면 그 칸 이름, 여러 칸이면 `+` 로 잇는다 (`notification-setting:<키>`) */
export function messengerNotificationSettingsBusyKey(patch: Partial<MessengerNotificationSettings>): string {
  return `notification-setting:${Object.keys(patch).sort().join("+")}`;
}
