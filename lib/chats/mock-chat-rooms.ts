/**
 * 6단계: 채팅방 mock (Supabase 전환 시 교체)
 */

import type { ChatRoom, ChatProductSummary } from "@/lib/types/chat";
import { getProductById } from "@/lib/mock-products";
import { MOCK_DATA_AS_OF_MS } from "@/lib/mock-time-anchor";

const CURRENT_USER_ID = "me";

function productToSummary(
  product: { id: string; title: string; thumbnail: string; price: number; status: string },
  authorNickname?: string
): ChatProductSummary {
  return {
    id: product.id,
    title: product.title,
    thumbnail: product.thumbnail || "",
    price: product.price,
    status: product.status,
    ...(authorNickname ? { authorNickname } : {}),
  };
}

/** 채팅방 목록 (roomId 기준) */
export const MOCK_CHAT_ROOMS: ChatRoom[] = [
  {
    id: "room-1",
    productId: "1",
    buyerId: CURRENT_USER_ID,
    sellerId: "s1",
    partnerNickname: "판매자A",
    partnerAvatar: "",
    lastMessage: "네, 내일 오후에 가능해요.",
    lastMessageAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 30).toISOString(),
    unreadCount: 0,
    product: productToSummary(
      {
        id: "1",
        title: "아이폰 14 Pro 256GB",
        thumbnail: "",
        price: 1200000,
        status: "active",
      },
      "판매자A"
    ),
  },
  {
    id: "room-2",
    productId: "2",
    buyerId: CURRENT_USER_ID,
    sellerId: "s2",
    partnerNickname: "판매자B",
    partnerAvatar: "",
    lastMessage: "가격 조금만 깎아주실 수 있을까요?",
    lastMessageAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 60 * 2).toISOString(),
    unreadCount: 2,
    product: productToSummary(
      {
        id: "2",
        title: "맥북 에어 M2",
        thumbnail: "",
        price: 1500000,
        status: "reserved",
      },
      "판매자B"
    ),
  },
  {
    id: "room-3",
    productId: "my-1",
    buyerId: "b1",
    sellerId: CURRENT_USER_ID,
    partnerNickname: "구매자C",
    partnerAvatar: "",
    lastMessage: "에어팟 아직 판매 중이에요?",
    lastMessageAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 5).toISOString(),
    unreadCount: 1,
    product: productToSummary(
      {
        id: "my-1",
        title: "에어팟 프로 2세대",
        thumbnail: "",
        price: 180000,
        status: "active",
      },
      "나"
    ),
  },
];

export function getCurrentUserId(): string {
  return CURRENT_USER_ID;
}

export function getChatRooms(currentUserId: string): ChatRoom[] {
  return MOCK_CHAT_ROOMS.filter(
    (r) => r.buyerId === currentUserId || r.sellerId === currentUserId
  ).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

export function getRoomById(roomId: string): ChatRoom | undefined {
  const room = MOCK_CHAT_ROOMS.find((r) => r.id === roomId);
  if (!room) return undefined;
  const product = getProductById(room.productId);
  if (product) {
    room.product = productToSummary(product);
  }
  return room;
}

/** productId로 기존 방 찾기 또는 새 방 생성 후 id 반환 */
export function getOrCreateRoom(productId: string, currentUserId: string): string {
  const existing = MOCK_CHAT_ROOMS.find(
    (r) => r.productId === productId && (r.buyerId === currentUserId || r.sellerId === currentUserId)
  );
  if (existing) return existing.id;

  const product = getProductById(productId);
  const sellerId = product?.seller?.id ?? product?.sellerId ?? "seller";
  const isSeller = currentUserId === sellerId;
  const partnerNickname = isSeller ? "구매자" : (product?.seller?.nickname ?? "판매자");
  const newRoom: ChatRoom = {
    id: `room-${Date.now()}`,
    productId,
    buyerId: isSeller ? "buyer" : currentUserId,
    sellerId: isSeller ? currentUserId : sellerId,
    partnerNickname,
    partnerAvatar: "",
    lastMessage: "",
    lastMessageAt: new Date().toISOString(),
    unreadCount: 0,
    product: product
      ? productToSummary(product)
      : { id: productId, title: "", thumbnail: "", price: 0, status: "active" },
  };
  MOCK_CHAT_ROOMS.unshift(newRoom);
  return newRoom.id;
}

export function updateRoomLastMessage(
  roomId: string,
  lastMessage: string,
  lastMessageAt: string
): void {
  const room = MOCK_CHAT_ROOMS.find((r) => r.id === roomId);
  if (room) {
    room.lastMessage = lastMessage;
    room.lastMessageAt = lastMessageAt;
  }
}

export function clearRoomUnread(roomId: string): void {
  const room = MOCK_CHAT_ROOMS.find((r) => r.id === roomId);
  if (room) room.unreadCount = 0;
}
