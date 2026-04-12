# `lib/chat-infra-supabase`

Supabase(Postgres + Realtime + Storage)에 대한 **어댑터**만 둔다. [`lib/chat-domain`](../chat-domain) 포트를 구현한다.

## 현재

- `community-messenger/supabase-read-adapter.ts` — `CommunityMessengerReadPort` → 기존 `getCommunityMessengerRoomSnapshot`

## 다음

- 메시지 전송·히스토리 포트 구현체를 같은 패턴으로 추가 후, `service.ts`에서 점진 제거.
