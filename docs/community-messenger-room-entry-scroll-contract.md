# CM Room — Entry Scroll Contract

> **정본 (전 채팅 SSOT):** [`docs/chat-thread-scroll-contract.md`](./chat-thread-scroll-contract.md)  
> **keyboard/layout LOCK:** `docs/community-messenger-mobile-room-viewport.md`  
> **검증:** `npm run verify:cm-room-entry-scroll-contract` · `npm run verify:chat-thread-scroll-contract`

CM Phase2 scroll 은 **`useChatThreadScroll`만** 사용한다 (`entryForceBottom: true`, chrome sync → layout commit).  
CM 전용 ScrollAnchorController / persist restore / unread entry jump 는 폐기 — `docs/cm-room-telegram-kakao-parity-redesign.md`.
