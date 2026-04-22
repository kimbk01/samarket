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
    case "room_blocked":
      return t("nav_messenger_room_blocked_error");
    case "room_archived":
      return t("nav_messenger_room_archived_error");
    case "room_readonly":
      return t("nav_messenger_room_readonly_error");
    case "friend_required":
      return "그룹 초대는 친구 관계에서만 가능합니다.";
    case "target_not_found":
      return "대상 멤버를 찾지 못했습니다.";
    case "invalid_role":
      return "변경할 권한 값이 올바르지 않습니다.";
    case "owner_immutable":
      return "방장 권한은 이 화면에서 변경할 수 없습니다.";
    case "same_owner":
      return "이미 현재 방장인 멤버입니다.";
    case "cannot_kick_admin":
      return "관리자는 내보낼 수 없습니다.";
    case "self_kick_forbidden":
      return "자기 자신은 내보낼 수 없습니다.";
    case "not_group_room":
      return t("nav_messenger_group_only");
    case "not_open_group_room":
      return "공개 그룹방에서만 사용할 수 있는 기능입니다.";
    case "password_required":
      return "비밀번호를 입력해 주세요.";
    case "alias_name_required":
      return "별칭 닉네임을 입력해 주세요.";
    case "invalid_password":
      return "비밀번호가 맞지 않습니다.";
    case "room_full":
      return "정원이 가득 찬 방입니다.";
    case "owner_cannot_leave":
      return "방장은 이 방을 바로 나갈 수 없습니다.";
    case "room_unavailable":
      return t("nav_messenger_room_unavailable");
    case "trade_product_chat_unlinked":
      return "거래 정보를 확인할 수 없습니다.";
    case "trade_not_counterpart":
      return "참여자만 메시지를 보낼 수 있습니다.";
    case "trade_viewer_left_as_seller":
      return "이미 나간 채팅방입니다.";
    case "trade_viewer_left_as_buyer":
      return "이미 나간 채팅방입니다.";
    case "trade_seller_closed_buyer_blocked":
      return "판매자가 대화를 종료했습니다. 새 메시지를 보낼 수 없습니다.";
    case "peer_not_found":
      return t("nav_messenger_peer_not_found");
    case "forbidden":
      return t("nav_messenger_forbidden");
    case "call_provider_not_configured":
      return t("nav_messenger_call_provider_not_ready");
    case "call_session_start_failed":
    case "call_session_participants_insert_failed":
      return t("nav_messenger_call_start_failed");
    case "messenger_storage_unavailable":
      return "메신저 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    case "messenger_migration_required":
      return "메신저 저장소 마이그레이션이 아직 반영되지 않았습니다. DB 스키마를 먼저 업데이트해 주세요.";
    case "file_too_large":
      return "파일 용량이 너무 큽니다.";
    case "file_too_small":
      return "음성 파일이 너무 짧거나 비어 있습니다. 조금 더 길게 녹음해 주세요.";
    case "unsupported_audio":
      return t("nav_messenger_voice_unsupported");
    case "unsupported_image":
      return "JPG, PNG, WEBP, GIF 이미지만 보낼 수 있습니다.";
    case "too_many_images":
      return "한 번에 보낼 수 있는 사진은 최대 10장입니다.";
    case "unsupported_file":
      return "지원하지 않는 파일 형식입니다.";
    case "file_required":
    case "multipart_required":
      return "파일을 먼저 선택해 주세요.";
    case "upload_failed":
    case "server_config":
      return t("nav_messenger_voice_upload_failed");
    case "not_found":
      return t("nav_messenger_message_not_found");
    case "reply_target_not_found":
      return "답장 대상 메시지를 찾을 수 없습니다.";
    case "reply_target_invalid":
      return "답장할 수 없는 메시지입니다.";
    case "bad_request":
      return "요청이 올바르지 않습니다.";
    case "reaction_failed":
      return "반응을 저장하지 못했습니다.";
    case "migration_required":
      return "메신저 저장소 마이그레이션이 아직 반영되지 않았습니다. DB 스키마를 먼저 업데이트해 주세요.";
    case "unsupported_type":
      return t("nav_messenger_message_type_delete_unsupported");
    case "delete_failed":
      return t("nav_messenger_message_delete_failed");
    default:
      return t("nav_messenger_action_failed");
  }
}
