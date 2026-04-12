/**
 * 채팅방 서버 로드 계약 (문서 전용 모듈 — 런타임 의존 최소화)
 *
 * ## 진입점
 * - **부트스트랩(첫 페인트)**: `loadTradeChatRoomBootstrap(createTradeChatReadAdapter(), …)` 또는 `loadChatRoomBootstrapForUser` → 방 메타 + 초기 메시지. RSC·`GET .../bootstrap` 공용.
 * - **RSC**는 `detailScope: "entry"` — 거래 방에서 `buyerReviewSubmitted`용 `transaction_reviews` 조회를 생략(짧은 재검증으로 보정).
 * - **GET .../bootstrap** 은 `detailScope: "full"` — 클라 직접 호출 시 정확한 후기 플래그(탭 복귀·bfcache `useRefetchOnPageShowRestore` 등).
 * - **방 메타만**: `loadChatRoomDetailForUser` → `GET /api/chat/room/[roomId]` (재검증·캐시 히트 헤더 등).
 *
 * ## 인증
 * - HTTP API는 `requireAuthenticatedUserId` 후 로더에 `userId` 전달.
 * - 로더는 `chat_rooms` / `product_chats` 행 기준 **참가자만** 페이로드 반환(403/404).
 *
 * ## ID 정규화
 * - 모든 진입은 `@/lib/validate-params` 의 `parseRoomId`로 동일 검증(길이·허용 문자).
 *
 * ## 확장 시
 * - “부트스트랩에 넣지 말고 지연 로드할 필드”를 추가할 때는 이 블록에 한 줄 요약해 두면
 *   trade / store / 커뮤니티 분리 시 경계가 명확해진다.
 */
export {};
