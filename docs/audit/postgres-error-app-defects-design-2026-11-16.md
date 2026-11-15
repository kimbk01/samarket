# 운영 Postgres 앱 오류 3건 — 원인별 설계안 (2026-11-16)

- 근거: 운영 Supabase 로그 11-15 03:30 ~ 11-16 03:29 PHT (Postgres ERROR 21건 중 앱 14건) · Vercel 운영 런타임 로그 · 운영 DB 읽기 전용 컬럼 조회 · `origin/main` 코드
- 이전 감사: `docs/audit/postgres-error-log-audit-2026-11-14.md` (A·C·D·E·F 처리 완료, 이 3건은 그때 없던/작던 경로)
- 승인 전 구현 없음. 3건은 도메인이 달라 **PR 3개로 분리** (거래·메신저 / 거래 글 상세 / 알림).

---

## G1. 메신저 방 ID 해석 — uuid 가 아닌 방 ID 로 거래 채팅 표 조회 (8건, 11-16 01:55)

**증거**
- Postgres: `invalid input syntax for type uuid: "3e775b69"` 8건 — `product_chats … where id = $1`(PRODUCT_CHAT_ROW_SELECT) 4건 + `chat_rooms … where id = $1 and room_type = $2` 4건 (01:55:22·01:55:24 두 번).
- Vercel: 같은 시각 `/api/me/store-owner-hub-badge` 요청의 `route_transition_source = /community-messenger/rooms/3e775b69` → 앱이 **8자리 방 주소**에 있었음. 17초 뒤(01:55:39) 정상 전체 ID `3e775b69-928e-4271-ac2d-1477f15094cb` 로 bootstrap 성공.

**원인 (코드)**
- `lib/trade/resolve-product-chat.ts` `resolveProductChat(sb, roomId)` 가 형식 확인 없이 `product_chats.id`·`chat_rooms.id`(uuid) 로 조회.
- 메신저 방 해석 `lib/community-messenger/server/messenger-room-canonical-resolve-core.ts:227` 이 메신저 방으로 못 찾으면 이 함수로 넘김 → 짧은 ID 가 그대로 DB 로 감.

**확인 못 함 (NOT_PROVEN)**
- 8자리 주소를 누가 만들었는지. 앱 코드에서 방 ID 를 잘라 주소를 만드는 곳은 없음(`slice(0, 8)` + `rooms/` 전수 검색 0건). 같은 시간대 작업 세션이 통화 조사 중이었음 — 손으로 줄인 주소일 가능성. 확정하지 않음.

**설계**
- `resolveProductChat` 첫 줄에서 `isUuidLikeString(roomId)` 가 아니면 **조회 없이 `null`**. (호출처 7곳 전부 이 함수를 지나므로 한 곳에서 막힘)
  - 호출처: `messenger-room-canonical-resolve-core.ts:227`, `service.ts:11545·15037·15726`, `app/api/chat/rooms/[roomId]/leave`, `app/api/community-messenger/bridge/product-chat`, `app/api/trade/product-chat/[roomId]/buyer-issue`.
- 바뀌는 동작: uuid 아닌 ID → 지금도 결과는 `null`(조회 실패 = 없음)이었음. 화면 결과 동일, DB 조회·오류만 없어짐.
- 깨질 수 있는 것: 거래 채팅 ID 가 uuid 가 아닌 경우 — `product_chats.id`·`chat_rooms.id` 둘 다 uuid 열이라 없음.
- 시험: 비 uuid → `from` 미호출·null / uuid → 기존 조회.
- 분류: 웹. 통화 코드 아님.

---

## G2. 글 상세 판매자 카드 대체 조회 — 없는 컬럼 `temperature` (3건)

**증거**
- Postgres: `column profiles.temperature does not exist` 3건 (11-15 12:21 · 23:52 · 11-16 00:56), 출처 PostgREST(브라우저 클라이언트).
- 운영 DB 컬럼(읽기 전용): `profiles` 에 `id, nickname, username, avatar_url, trust_score, manner_temperature, manner_score` 있음 · **`temperature` 없음**.

**원인 (코드)**
- `lib/users/profile-public-select.ts` `PROFILE_PUBLIC_MIN_SELECT` 에 `temperature` 포함(05-03 부터).
- 사용처는 `lib/users/getUserProfile.ts` 하나 → `components/post/PostDetailView.tsx:734` 가 **공개 프로필 API(`/api/users/[id]/public-profile`)가 실패할 때만** 부르는 대체 조회.
- 대체 조회도 항상 실패 → 판매자 카드 `setAuthor(null)` (판매자 정보 빈칸 가능, 화면 NOT_PROVEN). 공개 프로필 API 가 왜 실패했는지는 Vercel 로그에 기록 없음 → NOT_PROVEN.

**설계**
- `PROFILE_PUBLIC_MIN_SELECT` 에서 `temperature` 만 제거. 점수 계산(`lib/trust/profile-trust-display.ts`)은 `trust_score → manner_temperature → manner_score ?? temperature` 순 — `temperature` 는 운영에 없는 열이라 지금도 항상 비어 있음 → 제거해도 계산 결과 동일.
- 바뀌는 동작: 대체 조회가 성공해 판매자 카드가 채워짐.
- 깨질 수 있는 것: 없음(존재하지 않는 열 제거).
- 시험: select 문자열이 운영 컬럼 7개만 포함 · `temperature` 없음.
- 분류: 웹.

---

## G3. 부재중 통화 알림 탭 — 알림 ID 자리에 `missed:<통화ID>` (3건)

**증거**
- Postgres: `invalid input syntax for type uuid: "missed:<id>"` 3건 (11-15 08:06 · 12:49 ×2), SQL = `notification_events where id = $1 and user_id = $2` — `app/api/me/notifications/read/route.ts` 의 `requireMemberA` 확인 조회와 같은 모양.

**원인 (코드)**
- Android 부재중 알림 `MissedCallNotificationHelper.java:37` 이 탭 인텐트에 `notificationId = "missed:" + callId`(알림 tag) 를 넣음.
- 웹 `components/push/PushRouteListener.tsx:109` `maybeMarkMemberAOnPushTap` 이 이 값을 알림 이벤트 ID 로 보고 `postNotificationEventOpenedRead(id, { requireMemberA: true })` → 읽음 API 가 uuid 열로 조회 → 실패 → `skipped: not_member_a` (읽음 처리 안 됨).
- 영향: 부재중 알림을 눌러도 그 경로로는 알림이 읽음 처리되지 않음(종 숫자 남는지 화면 NOT_PROVEN).

**설계** — 네이티브·통화 코드 무변경, 알림 읽음 계층만
- 웹 `lib/notifications/client/notification-event-read-client.ts` `postNotificationEventOpenedRead`: ID 가 uuid 형식이 아니면 **요청하지 않음**(읽음 대상 아님).
- 서버 `app/api/me/notifications/read/route.ts`: `eventId` 가 uuid 가 아니면 DB 조회 없이 `400 invalid_notification_event_id` (구 바이너리·다른 호출 방어).
- 부재중 알림을 탭했을 때 **실제 부재중 알림 이벤트(uuid)를 읽음 처리할지**는 이번 범위 밖 — 지금도 안 되고 있고, 하려면 `missed:<callId>` → 알림 이벤트 매핑(통화 세션 ID 기준)이 필요해 통화·알림 계약 변경이 됨 → **Owner 결정 필요**로 남김.
- 통화 변경 규정 확인: 바꾸는 파일은 알림 읽음 클라이언트·API 이며 통화 세션·VoIP/FCM 발송·수신 화면·CallKit 을 건드리지 않음. 그래도 부재중 알림 탭 경로에 닿으므로 Owner 확인 대상으로 표시.
- 시험: `missed:…` → fetch 미호출 / 서버 비 uuid → 400·DB 미조회 / uuid → 기존 동작.
- 분류: 웹. 설치된 구 Android 바이너리 호환: 바이너리가 보내는 값은 그대로, 웹이 걸러냄.

---

## 범위 밖 (보고만)
- 작업 세션 임의 SQL 7건(컬럼·표 추측) — AGENTS.md 「운영 DB 임의 조회 규칙」(#285) 위반. 코드 수정 대상 아님.

## 검증 계획 (구현 승인 후)
- 로컬: `typecheck:build`·`typecheck:test`·`test:ci` 1회, 변경 파일 eslint.
- 운영: 병합 후 24시간 Postgres 로그에서 `"3e775b69"`형(짧은 ID)·`profiles.temperature`·`"missed:…"` 0건. 화면 영향(G2 판매자 카드·G3 종 숫자)은 실기로 따로 확인 전까지 NOT_PROVEN.
