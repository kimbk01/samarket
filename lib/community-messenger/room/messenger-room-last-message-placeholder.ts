/**
 * CM room summary `lastMessage` — DB 빈 값일 때 목록·bootstrap UI placeholder.
 * bootstrap mount SSOT(`isAuthoritativeMessengerRoomEntrySnapshot`)에서는
 * **실제 메시지 힌트와 구분**해야 한다. placeholder 를 lastMessage-only incomplete 로 보면
 * 신규 1:1(친구 추가 직후) 방 진입이 `incomplete_timeline_seed` 로 막힌다.
 *
 * catalog: `cm_svc_last_msg_direct` · `cm_svc_last_msg_group` (ko/en)
 */
import { translate } from "@/lib/i18n/messages";

const MESSENGER_ROOM_LAST_MESSAGE_DISPLAY_PLACEHOLDERS = new Set([
  "메시지를 보내 보세요.",
  "그룹 대화를 시작해 보세요.",
  "Send a message to start chatting.",
  "Start a group conversation.",
]);

export function isMessengerRoomLastMessageDisplayPlaceholder(
  lastMessage: string | null | undefined
): boolean {
  const text = typeof lastMessage === "string" ? lastMessage.trim() : "";
  if (!text) return false;
  return MESSENGER_ROOM_LAST_MESSAGE_DISPLAY_PLACEHOLDERS.has(text);
}

/** paint·bootstrap seed 판정용 — placeholder 는 힌트 아님 */
export function hasMessengerRoomRealLastMessageHint(lastMessage: string | null | undefined): boolean {
  const text = typeof lastMessage === "string" ? lastMessage.trim() : "";
  if (!text) return false;
  return !isMessengerRoomLastMessageDisplayPlaceholder(text);
}

const DIRECT_PLACEHOLDERS = new Set(["메시지를 보내 보세요.", "Send a message to start chatting."]);

/**
 * 언어 SSOT — 서버가 채운 빈 방 안내(저장 언어 고정)를 화면에 그릴 때 보는 사람 언어 키로 바꾼다.
 * 안내 문구가 아니면 null.
 */
export function messengerRoomLastMessagePlaceholderKey(
  lastMessage: string | null | undefined
): "cm_svc_last_msg_direct" | "cm_svc_last_msg_group" | null {
  if (!isMessengerRoomLastMessageDisplayPlaceholder(lastMessage)) return null;
  return DIRECT_PLACEHOLDERS.has(String(lastMessage).trim()) ? "cm_svc_last_msg_direct" : "cm_svc_last_msg_group";
}

/**
 * 서버가 상대 이름을 못 찾을 때 채운 기본 방 제목(`cm_ui_new_conversation` — 저장 언어 고정) → 보는 사람 언어 키.
 * 정확히 기본 제목일 때만 키를 돌려주고, 사람이 쓴 제목은 null(그대로).
 */
let defaultRoomTitles: Set<string> | null = null;

function getDefaultRoomTitles(): Set<string> {
  if (!defaultRoomTitles) {
    defaultRoomTitles = new Set(
      [
        translate("ko", "cm_ui_new_conversation"),
        translate("en", "cm_ui_new_conversation"),
        "cm_ui_new_conversation",
      ].map((v) => v.trim().toLowerCase())
    );
  }
  return defaultRoomTitles;
}

export function messengerRoomDefaultTitleKey(title: string | null | undefined): "cm_ui_new_conversation" | null {
  const text = typeof title === "string" ? title.trim() : "";
  if (!text) return null;
  return getDefaultRoomTitles().has(text.toLowerCase()) ? "cm_ui_new_conversation" : null;
}
