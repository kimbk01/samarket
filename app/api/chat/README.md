# 채팅 API (사마켓)

## 진입

| 용도 | 메서드 | 경로 | 비고 |
|------|--------|------|------|
| 거래 채팅 시작 | POST | `/api/chat/item/start` | body: `itemId`, `userId` |
| 거래 채팅 폴백 | POST | `/api/chat/create-room` | body: `productId`, `userId` |

## 목록·미읽음

| 용도 | 메서드 | 경로 |
|------|--------|------|
| 채팅 목록 | GET | `/api/chat/rooms?userId=xxx` |
| 미읽음 합계 (편지 배지) | GET | `/api/chat/unread-total?userId=xxx` |

## 방·메시지

- **product_chat**: `GET/POST /api/chat/room/[roomId]`, `room/[roomId]/messages`, `room/[roomId]/send`, `room/[roomId]/read`
- **chat_room**: `GET/POST /api/chat/rooms/[roomId]/messages`, `rooms/[roomId]/read`, `rooms/[roomId]/leave`, `rooms/[roomId]/hide`, `rooms/[roomId]/reopen`

클라이언트는 응답의 `source`(`product_chat` | `chat_room`)로 분기.

## 폴링

- 목록: 8초
- 상세 메시지: 8초
- unread-total: 15초 + 이벤트 `chat-unread-updated`
