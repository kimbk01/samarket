/**
 * 일반 채팅(거래 제외) — DB room_type·context_type → UI/정책용 분류
 * item_trade / product_chats 는 여기서 다루지 않음.
 */

export type PurposefulGeneralKind = "community" | "group" | "business" | "store_order";

export type LegacyGeneralKind = "legacy_general";

export type GeneralChatKind = PurposefulGeneralKind | LegacyGeneralKind;

export function isPurposefulGeneralRoomType(rt: string | null | undefined): rt is PurposefulGeneralKind {
  return rt === "community" || rt === "group" || rt === "business" || rt === "store_order";
}

export function isGeneralChatRoomType(rt: string | null | undefined): boolean {
  return rt === "general_chat" || rt === "group_meeting" || isPurposefulGeneralRoomType(rt);
}

/**
 * chat_rooms 한 행에서 UI용 일반 채팅 종류
 */
export function generalChatKindFromRoomRow(roomType: string | null | undefined, contextType: string | null | undefined): GeneralChatKind {
  if (roomType === "store_order") return "store_order";
  if (roomType === "community") return "community";
  if (roomType === "group") return "group";
  if (roomType === "group_meeting") return "group";
  if (roomType === "business") return "business";
  if (roomType === "general_chat") {
    const c = contextType ?? "";
    if (c === "group" || c === "group_context") return "group";
    if (c === "biz_profile" || c === "delivery" || c === "business_context") return "business";
    return "legacy_general";
  }
  return "legacy_general";
}
