/**
 * 메신저 정책 축 — DB `room_type` 과 별개로 trade | direct | group 만 분기한다.
 */

export type MessengerPolicyRoomType = "trade" | "direct" | "group";

export type MessengerPolicyRoomSource = {
  roomType: "direct" | "private_group" | "open_group";
  contextMeta?: { kind?: string | null } | null;
};

export function toMessengerPolicyRoomType(source: MessengerPolicyRoomSource): MessengerPolicyRoomType {
  const kind = source.contextMeta?.kind;
  if (kind === "trade") return "trade";
  if (source.roomType === "direct") return "direct";
  return "group";
}
