# CM Room — Telegram / Kakao parity redesign (SSOT)

**상태:** cutover 완료 (scroll = legacy `useChatThreadScroll`, shell = CM flex LOCK)  
**관련:** `docs/chat-thread-scroll-contract.md` · `docs/community-messenger-mobile-room-viewport.md` §0 LOCK

## U1–U6 (PASS / FAIL)

| ID | 조건 |
|----|------|
| U1 | 목록/푸시 진입 → 최신 말풍선이 composer 바로 위 (`distanceFromBottom ≤ 96`, 큰 하단 공백 없음) |
| U2 | 키보드 open 후에도 U1과 동일 (composer 키보드 위, 말풍선 가림 없음) |
| U3 | 키보드 close 후 U1 유지, 하단 빈 구멍 없음 |
| U4 | 내 전송 → 항상 composer 위 follow |
| U5 | 상대 메시지: 하단 근처면 follow, 읽는 중이면 유지 |
| U6 | 과거 로드(prepend) → 읽던 줄 유지 |

## IN / OUT

**IN:** CM 방 스크롤을 `useChatThreadScroll`로 치환 · `roomMessages` mutation kind 버스 · entry 항상 latest bottom · verify · quarantine 삭제  
**OUT:** Pass0–3 UI 재작성 · Realtime 프로토콜 · ChatDetailView sticky · 새 keyboard 레이어 · capacitor 자산 · Philife

## 구조

- Shell/keyboard: `useCmRoomVisibleViewportShell` + `app/chat-viewport-shell.css` (LOCK 유지)
- Scroll: `lib/chat-thread-scroll/use-chat-thread-scroll.ts` only (`entryForceBottom: true`, `layoutCommittedEventName: CM_ROOM_CHROME_HEIGHT_SYNC_EVENT`)
- Mutation: `applyRoomMessagesMutation({ kind: 'replace'|'append'|'prepend'|'clear' })` only

## Entry 정책

push / default(list-tap) 모두 **latest bottom**.  
persisted scroll restore · unread→lastRead 자동 점프 **금지** (배지/칩은 별도 UI, scroll entry 아님).

## Quarantine → delete (cutover 후)

**삭제 완료** (import 0):

- `messenger-room-scroll-anchor-controller.ts`
- `use-messenger-room-reader-scroll-bottom.ts`
- `messenger-room-scroll-position-store.ts`
- `messenger-room-messages-auto-scroll.ts` → `lib/chat-thread-scroll/resolve-messages-auto-scroll.ts`
- `cm-room-scroll-authority-instrumentation.ts`
- `use-messenger-room-trade-dock-scroll-anchor.ts`
- `use-messenger-room-store-order-dock-scroll-anchor.ts`

## 실기기 게이트

그룹 + 1:1 · Android (및 iOS) · U1–U2 필수.

## Verify

- `npm run verify:chat-thread-scroll-contract`
- `npm run verify:cm-room-entry-scroll-contract`
- `npm run verify:cm-room-keyboard-layout-contract`
- `npm run verify:cm-room-message-mutation-sites`
