# 언어 SSOT B3 — 저장된 채팅 문장(미리보기·시스템 메시지) 설계 (2026-11-08 · Owner 「B3 설계 보고」) · **설계만, 구현은 승인 후**

> 발견 목록 L21 · 감사 §2 B3. 계약: `docs/i18n-ssot.md` §3-5 「DB 에 화면 문장을 저장하지 않는다 — 종류 코드 + 값을 저장하고 화면에서 키로 그린다」.
> 조사 기준: main `6193bed7d`, 운영 DB 읽기 전용(19:40 PHT 전후). 테스트 DB 조회 없음.

## 0. 조사 결과 — L21 범위 정정 (먼저 보고)

**L21 에 적은 「사진」「사진 n장」「(이미지)」는 실제 데이터가 0건이다.** 운영 `chat_rooms`·`product_chats`·`chat_messages` 에 이 값은 하나도 없다. 구 거래 채팅 `chat_messages` 의 이미지 메시지는 지금까지 0건이고, 그룹 `group_messages` 도 0행이다. 이미지 미리보기는 메신저(`community_messenger_*`)에서 이미 종류(`last_message_type=image`)로 「Photo」 키를 그린다(`lib/community-messenger/cm-home-list-copy.ts:101`).

실제 결함은 **저장된 시스템 문장**이다. 메신저 방 목록 미리보기가 방의 마지막 메시지 글자(`community_messenger_rooms.last_message`)를 그대로 보여 준다.

| 저장 문장 (운영 예) | 위치 | 영어 화면 | 근거 |
|---|---|---|---|
| 「📋 주문 요약 / 매장: … / 주문번호: …」 | 방 `last_message`(type system) 약 385개(상위 8매장 합) · 메시지 133건(90일) | **목록에 한국어** | `cm-home-list-copy.ts:90-95` 「서버가 저장한 실제 시스템 문구를 그대로」 |
| 「배달이 완료되었습니다.」「주문이 취소되었어요.」 등 주문 사건 | 방 117·70… · 메시지(키 있음) | **목록에 한국어** · 대화방은 영어(키로 다시 그림) | 대화방 `lib/store-order-chat/store-order-ops-i18n.ts:60` 는 `metadata.message_key` 사용 |
| 「제품의 상태가 예약중으로 변경되었습니다.」 | 방 100+ · 메시지(키 없음, `kind=listing_change`+`listingState`) | **목록에 한국어** · 대화방은 영어(상태 값으로 다시 그림) | `MessengerTradeListingChangeSystemRow.tsx:29` |
| 「Member removed」「Permissions updated」「… 그룹이 만들어졌습니다」 | 그룹 시스템 메시지(키 없음) | 저장 시점 언어로 고정 — **한국어 화면에 영어**가 나오거나 그 반대 | 작성 시 `cm_svc_mgmt_*`·`cm_svc_group_room_created` 를 한 언어로 번역해 저장 |
| 「음성 통화 · 취소」 등 통화 기록 | 통화 메시지·방 | 목록에 한국어(구 형식) | **통화 영역 — B5 로 분리**(이 설계에서 제외) |

- 메시지 쪽은 대부분 이미 **종류 코드**를 갖고 있다: 주문 사건 `message_key`·`message_vars`, 상품 상태 `kind`·`listingState`. 없는 것은 **주문 요약**(`kind=store_order_summary`, 키 없음)과 **그룹 관리 메시지**(메타데이터 없음)다.
- 방 목록은 `community_messenger_rooms` 의 `last_message`·`last_message_type` 만 본다. 이 표에는 마지막 메시지 id·메타데이터 열이 **없다**(운영 열 목록 확인). 그래서 목록은 저장 글자 말고는 그릴 재료가 없다.
- 실시간 방 갱신(room bump) 메시지 스냅샷에는 `metadata` 가 이미 실려 온다(`community-messenger-room-bump-message-snapshot.ts:47`).

## 1. 설계 (권장안)

**원칙: 저장 글자는 남기되(구 앱·관리자 화면 호환), 화면은 종류 코드로 다시 그린다. 코드가 없으면 저장 글자.**

| 단계 | 내용 | 바뀌는 곳 |
|---|---|---|
| **B3-a 메시지 계약** | 모든 시스템 메시지에 `metadata.message_key` + `message_vars` 를 남긴다. ① 주문 요약: 첫 줄 키(`store_oc_summary_received`)·매장·주문번호 값 ② 상품 상태: 대화방이 이미 쓰는 키(`trade_listing_change_system_title` + `sellerListingStateMessageKey(listingState)`)와 같은 키 + `listingState` ③ 그룹 관리: 이미 쓰는 `cm_svc_mgmt_*`·`cm_svc_group_room_created` 키와 이름 값. 대화방 시스템 줄은 `message_key` 가 있으면 키로 그린다(주문 사건 줄과 같은 규칙, 공통 함수 1개) | `lib/community-messenger/store-order-chat-service.ts`(요약), `lib/trade/insert-seller-listing-change-system-messages.ts`, 그룹 관리 메시지 작성 함수(`lib/community-messenger/service.ts` **비통화 함수만** · `group/*`), 대화방 시스템 줄 렌더러 |
| **B3-b 방 미리보기 코드** | `community_messenger_rooms.last_message_meta jsonb null` 추가. **DB 트리거**: 메시지 INSERT 중 `message_type='system'` 일 때만 방의 `last_message_meta = {message_key, message_vars, text}`(`text` = 저장 첫 줄, 일치 확인용). 목록 미리보기: `last_message_type='system'` 이고 `last_message_meta.text` 가 `last_message` 첫 줄과 같으면 `t(message_key, vars)`, 아니면 저장 글자. 실시간 갱신은 스냅샷 `metadata` 로 같은 함수 사용 | `supabase/migrations`(열·트리거), 방 목록 조회·스냅샷 조립(`full-bootstrap-snapshot-assemble.ts`·`home-sync-snapshot-assemble.ts`·`cm-bootstrap-snapshot-assemble.ts` 의 select), `cm-home-list-copy.ts` `getRoomPreviewText`, `room-list-semantic-preview.ts` |
| **B3-c 지난 데이터** | 이미 저장된 메시지·방은 코드가 없어 저장 글자로 남는다. 상품 상태(`listingState` 있음)·주문 사건(키 있음) 메시지는 기존 메타데이터로 방 `last_message_meta` 를 채운다(1회 데이터 이관). 주문 요약 옛 행은 값(매장·주문번호)이 글자 안에만 있어 **채우지 않음**(글자 해석 = 땜빵 금지) | 데이터 이관 1회 — **운영 적용 Owner 승인** |
| **B3-d 구 거래 채팅** | `product_chats`/`chat_messages`(마지막 쓰기 2026-11-04, 이미지 0건, 시스템 문장만) — 구 거래 목록(`lib/chats` `tradeChatListLastMessageDisplay`)이 아직 고객 화면에 나오는지 **먼저 확인**. 나오면 같은 원칙(시스템 미리보기 = 거래 상태 값으로 그림), 안 나오면 이관 대상 아님 | 확인 후 별도 보고 |

**왜 트리거인가 (B3-b)**: 방 `last_message` 를 쓰는 곳이 DB 함수 3개(`community_messenger_send_text_message`·`dibay_append_room_message_atomic`·`gift_certificate_offer`)와 서버 코드 여러 곳이다. `dibay_append_room_message_atomic` 은 통화 기록 저장에도 쓰여 바꾸면 **통화 규정** 대상이 된다. 트리거는 `system` 메시지에만 동작해 통화 기록(`call_stub`)·일반 텍스트 발송 경로를 건드리지 않는다. 대안(목록 조회 때 마지막 시스템 메시지를 따로 읽기)은 메신저 목록 핫패스에 쿼리를 더해 성능 계약(`docs/messenger-performance-targets.md`)과 충돌한다.

## 2. 영향 · 깨질 수 있는 것 → 같은 단계 처리

| 바뀌는 것 | 영향받는 화면·호출 | 처리 |
|---|---|---|
| 시스템 메시지 메타데이터 키 추가 | 대화방 타임라인, 관리자 메신저 화면(저장 글자 표시) | 저장 글자는 그대로 → 관리자·구 앱 화면 변화 0. 대화방은 키 우선 |
| 트리거 | 시스템 메시지 INSERT 마다 방 UPDATE 1회 추가(주문 사건·요약·상품 상태·그룹 관리만 — 30일 79건 수준) | 텍스트·통화·이미지 INSERT 는 조건으로 제외(성능 영향 0). 방 행은 같은 트랜잭션에서 이미 갱신되는 행 |
| 목록 select 에 열 1개 | 홈·도메인 목록 부트스트랩·스냅샷 | 페이로드 증가는 시스템 마지막 방만(작은 JSON). 목록 불변조건(`trade-home-list-invariants`) 영향 없음 확인 |
| 미리보기 함수 | 메신저 홈·거래·주문 목록, 실시간 갱신 | 일치 확인(`text`)이 다르면 저장 글자 → 잘못된 키 표시 없음 |
| 통화 | 없음 | 통화 메시지·통화 함수·`lib/push/**` diff 0 이 승인 조건. 통화 기록 미리보기는 B5 |

## 3. 검증

- 코드: 미리보기 함수 단위 테스트(키 있음/없음/불일치/통화 제외), 시스템 메시지 작성 3종의 메타데이터 계약 테스트, 트리거 SQL 테스트(시스템만 갱신), typecheck·eslint·관련 vitest, `verify:parity-gates` 중 메신저 목록 관련 검사(핫패스 변경이라 필수).
- 운영(적용 후): 새 주문·상품 상태·그룹 관리 메시지 각 1건의 방 `last_message_meta` 조회, 영어·한국어 계정 목록 캡처(**Owner 화면 기준 — 로그인 계정·휴대폰**). 확인 전에는 NOT_PROVEN.

## 4. 되돌리기

웹 커밋 되돌리기 → 목록은 저장 글자로 돌아감. 트리거는 `drop trigger` 1줄, 열은 남겨도 무해.

## 5. Owner 결정 필요

1. B3-a·B3-b 안 승인(메시지 계약 + 방 미리보기 코드 열·트리거).
2. B3-c 지난 데이터 채우기(상품 상태·주문 사건만, 주문 요약 옛 행은 저장 글자로 남김) 운영 적용 승인.
3. B3-d 구 거래 채팅 — 고객 화면 노출 여부 확인 후 보고로 진행.
4. L21 원문(「사진」 저장)은 데이터 0건·경로 미사용 → **처리 대상에서 제외**하고 발견 목록 L21 을 이 설계로 대체.
