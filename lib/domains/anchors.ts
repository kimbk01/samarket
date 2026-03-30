/**
 * 도메인 축 고정 (파일 이동 없음).
 *
 * 신규·점진적 수정 시 아래 별칭을 쓰면, trade / 매장·커머스 / 주문 / 채팅 / 필리핀 로컬 정보를
 * import 경로만으로 구분해 관리할 수 있습니다. 기존 `@/lib/...` 는 그대로 유지해도 됩니다.
 *
 * | 축 | 별칭 패턴 | 실제 경로 |
 * |---|-----------|-----------|
 * | C2C 거래(정책·거래 흐름) | `@domain/trade/*` | `lib/trade/*` |
 * | 중고 글·목록 등 | `@domain/trade-posts/*` | `lib/posts/*` |
 * | 매장 도메인 모델 | `@domain/stores/*` | `lib/stores/*` |
 * | 매장 카트·체크아웃 등 | `@domain/store-commerce/*` | `lib/store-commerce/*` |
 * | 공유 주문 상태·스토어 주문 코어 | `@domain/orders/*` | `lib/shared-orders/*` |
 * | 멤버 주문 UI·목 데이터 등 | `@domain/member-orders/*` | `lib/member-orders/*` |
 * | 채팅 UI·실시간·클라이언트 쪽 | `@domain/chat/*` | `lib/chats/*` |
 * | 채팅 서버·룸 생성 등 | `@domain/chat-server/*` | `lib/chat/*` |
 * | 스토어 주문 채팅 연동 | `@domain/order-chat/*` | `lib/shared-order-chat/*` |
 * | 지역·유저 리전 | `@domain/ph-regions/*` | `lib/regions/*` |
 * | 필리핀 ZIP → 지역 | `@domain/ph-locations` | `lib/products/zip-to-location.ts` |
 * | 거래 지역 옵션 등 | `@domain/ph-form-options` | `lib/products/form-options.ts` |
 * | 연락처 placeholder 등 | `@domain/ph-contact-constants` | `lib/constants/philippines-contact.ts` |
 */

export {};
