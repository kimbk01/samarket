import type { MessageKey } from "@/lib/i18n/messages";

export type MessengerRoomActionTranslate = (
  key: MessageKey,
  vars?: Record<string, string | number>
) => string;

/**
 * `jsonError("한글…", status, { code: "not_found" })` 처럼 내려올 때 클라이언트가 기계용 `code` 를 우선 쓰도록 한다.
 * (`json.error` 만 넘기면 `getMessengerRoomActionErrorMessage` 가 전부 기본 문구로 떨어짐)
 */
export function pickMessengerApiErrorField(json: { error?: unknown; code?: unknown }): string | undefined {
  const code = typeof json.code === "string" ? json.code.trim() : "";
  if (code) return code;
  const err = typeof json.error === "string" ? json.error.trim() : "";
  return err || undefined;
}

export function getMessengerRoomActionErrorMessage(
  error: string | undefined,
  t: MessengerRoomActionTranslate
): string {
  switch (error) {
    case "room_not_found":
      return t("nav_messenger_room_not_found");
    case "content_required":
      return t("nav_messenger_message_required");
    case "sticker_asset_invalid":
      return t("cm_ui_sticker_assets_missing");
    case "composer_busy":
      return t("nav_messenger_action_failed");
    case "room_blocked":
      return t("nav_messenger_room_blocked_error");
    case "room_archived":
      return t("nav_messenger_room_archived_error");
    case "room_readonly":
      return t("nav_messenger_room_readonly_error");
    case "friend_required":
      return t("nav_messenger_friend_required");
    case "blocked_target":
      return t("cm_social_blocked_message_denied");
    case "PHONE_VERIFICATION_REQUIRED":
      return t("auth_phone_gate_unverified_title");
    case "invalid_target":
      return t("nav_messenger_invalid_target");
    case "members_required":
      return t("nav_messenger_members_required");
    case "target_not_found":
      return t("nav_messenger_target_not_found");
    case "invalid_role":
      return t("nav_messenger_invalid_role");
    case "owner_immutable":
      return t("nav_messenger_owner_immutable");
    case "same_owner":
      return t("nav_messenger_same_owner");
    case "cannot_kick_admin":
      return t("nav_messenger_cannot_kick_admin");
    case "self_kick_forbidden":
      return t("nav_messenger_self_kick_forbidden");
    case "not_group_room":
      return t("nav_messenger_group_only");
    case "not_open_group_room":
      return t("nav_messenger_open_group_feature_only");
    case "password_required":
      return t("nav_messenger_password_required");
    case "alias_name_required":
      return t("nav_messenger_alias_name_required");
    case "invalid_password":
      return t("nav_messenger_invalid_password");
    case "room_full":
      return t("nav_messenger_room_full");
    case "owner_cannot_leave":
      return t("nav_messenger_owner_cannot_leave");
    case "room_unavailable":
      return t("nav_messenger_room_unavailable");
    case "trade_product_chat_unlinked":
      return t("nav_messenger_product_trade_bridge_not_found");
    case "trade_not_counterpart":
      return t("nav_messenger_trade_not_counterpart");
    case "trade_viewer_left_as_seller":
    case "trade_viewer_left_as_buyer":
      return t("nav_messenger_trade_viewer_left");
    case "trade_seller_closed_buyer_blocked":
      return t("nav_messenger_trade_seller_closed");
    case "trade_chat_mode_locked":
      return t("nav_messenger_trade_chat_locked");
    case "trade_flow_not_chatting":
      return t("nav_messenger_trade_flow_not_chatting");
    case "peer_not_found":
      return t("nav_messenger_peer_not_found");
    case "forbidden":
      return t("nav_messenger_forbidden");
    case "user_banned":
      return t("cm_ui_group_user_banned");
    case "room_deleted":
    case "group_deleted":
      return t("cm_ui_group_deleted_unavailable");
    case "delete_failed":
      return t("cm_ui_group_delete_failed");
    case "not_owner":
      return t("cm_ui_group_delete_owner_only");
    case "call_provider_not_configured":
      return t("nav_messenger_call_provider_not_ready");
    case "trade_chat_calls_disabled":
      return t("cm_ui_trade_post_calls_disabled");
    case "trade_chat_video_not_allowed":
      return t("cm_ui_trade_post_voice_only");
    case "trade_chat_call_friend_required_after_complete":
      return t("nav_messenger_friend_required");
    case "store_order_voice_messages_disabled":
      return t("cm_ui_store_order_voice_messages_disabled");
    case "store_order_voice_calls_disabled":
      return t("cm_ui_store_order_voice_calls_disabled");
    case "store_order_video_calls_disabled":
      return t("cm_ui_store_order_video_calls_disabled");
    case "call_session_start_failed":
    case "call_session_participants_insert_failed":
      return t("nav_messenger_call_start_failed");
    case "messenger_storage_unavailable":
      return t("nav_messenger_storage_unavailable");
    case "messenger_migration_required":
    case "migration_required":
      return t("nav_messenger_migration_required");
    case "file_too_large":
      return t("nav_messenger_file_too_large");
    case "file_too_small":
      return t("nav_messenger_file_too_small");
    case "unsupported_audio":
      return t("nav_messenger_voice_unsupported");
    case "unsupported_image":
      return t("nav_messenger_unsupported_image");
    case "too_many_images":
      return t("nav_messenger_too_many_images");
    case "unsupported_file":
      return t("nav_messenger_unsupported_file");
    case "file_required":
    case "multipart_required":
      return t("nav_messenger_file_required");
    case "upload_failed":
    case "server_config":
      return t("nav_messenger_voice_upload_failed");
    case "message_send_failed":
    case "unread_update_failed":
    case "community_messenger_sticker_rate_limited":
      return t("nav_messenger_action_failed");
    case "not_found":
      return t("nav_messenger_message_not_found");
    case "reply_target_not_found":
      return t("nav_messenger_reply_target_not_found");
    case "reply_target_invalid":
      return t("nav_messenger_reply_target_invalid");
    case "bad_request":
      return t("nav_messenger_bad_request");
    case "reaction_failed":
      return t("nav_messenger_reaction_failed");
    case "unsupported_type":
      return t("nav_messenger_message_type_delete_unsupported");
    case "delete_failed":
      return t("nav_messenger_message_delete_failed");
    case "edit_failed":
      return t("nav_messenger_message_edit_failed");
    default:
      return t("nav_messenger_action_failed");
  }
}
