import type { ChatRoom } from "@/lib/types/chat";

/** 통합 채팅 부트스트랩 JSON용 — buyer/seller 참가자( DM ) */
export function buildTradeChatBootstrapParticipants(room: ChatRoom): Array<{
  userId: string;
  role: "buyer" | "seller";
}> {
  const out: Array<{ userId: string; role: "buyer" | "seller" }> = [];
  const b = room.buyerId?.trim();
  const s = room.sellerId?.trim();
  if (b) out.push({ userId: b, role: "buyer" });
  if (s) out.push({ userId: s, role: "seller" });
  return out;
}
