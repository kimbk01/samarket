/**
 * 메신저 홈 액션 API `error` 코드 → 사용자 메시지 (i18n 키는 호출부 `t` 사용).
 * `t` 는 앱 i18n 리터럴 키 유니온 시그니처라 `key` 는 완화해 받는다.
 */
export function messengerHomeActionErrorMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: any) => string,
  error?: string
): string {
  switch (error) {
    case "bad_peer":
      return t("nav_messenger_direct_target_invalid");
    case "blocked_target":
      return t("nav_messenger_blocked_target");
    case "friend_required":
      return t("nav_messenger_friend_required");
    case "title_required":
      return t("nav_messenger_title_required");
    case "password_required":
      return t("nav_messenger_password_required");
    case "alias_name_required":
      return t("nav_messenger_alias_name_required");
    case "members_required":
      return t("nav_messenger_members_required");
    case "invalid_password":
      return t("nav_messenger_invalid_password");
    case "room_full":
      return t("nav_messenger_room_full");
    case "not_open_group_room":
      return t("nav_messenger_open_group_only");
    case "owner_cannot_leave":
      return t("nav_messenger_owner_cannot_leave");
    case "room_lookup_failed":
      return t("nav_messenger_room_lookup_failed");
    case "room_create_failed":
    case "room_participant_create_failed":
      return t("nav_messenger_direct_create_failed");
    case "group_create_failed":
    case "group_participant_create_failed":
      return t("nav_messenger_group_create_failed");
    case "messenger_storage_unavailable":
      return t("nav_messenger_storage_unavailable");
    case "messenger_migration_required":
      return t("nav_messenger_migration_required");
    default:
      return t("nav_messenger_action_failed");
  }
}
