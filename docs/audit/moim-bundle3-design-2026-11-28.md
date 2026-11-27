# 모임 3번 묶음 설계안 — 알림·호출 병목 (2026-11-28)

- 근거:
  - 감사 `docs/audit/moim-full-audit-2026-11-27.md` §2 B2·B3, §5 E1·E2·E3·E4·E6·E8·E9
  - 이번 설계를 위한 확인 중 새로 찾은 결함 1건(N1)
- 계약: `docs/moim-ssot.md` → 설계 v1 §7 알림 매트릭스, `docs/request-budget-ssot.md`
- 상태: **설계안. 구현·DB 변경 없음.** 승인 뒤 구현한다.
- 반영 단위: **PR 1개 · 병합 1회 · 운영 빌드 1회**.
  - 마이그레이션 1개(인덱스 1개, 함수 변경 없음). 순서: 운영 DB 적용(승인) → Owner 「병합」.
  - 자동 병합은 등록하지 않는다.
- [배포 구분] 웹만.

## 0. 확인한 사실 (main `0a4fc775f` 이후 · 운영 DB 읽기 전용)

| 사실 | 근거 |
|---|---|
| 모임 알림은 모두 `appendUserNotification` 하나로 보내고, 언제나 `push_kind: "community"` 를 붙인다 | `lib/moim/server/moim-notify.server.ts:65-90` |
| 알림 저장 단계에는 푸시 끄기 칸(`pushSuppressedReason`)이 있지만, `appendUserNotification` 은 이 칸을 넘기지 않는다 | `notification-event-repository.ts:170`, `append-user-notification.ts:177-205` |
| 푸시 끄기 이유 목록은 TS 5개뿐이다(blocked·muted_room·same_room_foreground·sender_self·user_settings). DB CHECK 제약은 없다 | `notification-event-schema.ts:6-12`, 운영 `pg_constraint` 조회 0건 |
| 받는 사람마다 언어를 2번 조회한다(user_settings·user_devices). 한 번에 여러 명을 읽는 함수는 없다 | `notification-user-language.ts:18-64` |
| 동시 실행 상한 도구 `runWithConcurrencyLimit`, 응답 뒤 작업 `after()` 는 이미 다른 라우트에서 쓰고 있다 | `lib/shared/run-with-concurrency-limit.ts`, `app/api/posts/[postId]/owner-status/route.ts:218` |
| 예산은 「내리기만」, 하루 1,000건 이상 라우트는 등록 의무 | `docs/request-budget-ssot.md` §4 |

---

## 1. 항목별 설계

### B2 · 바로 가입 때 모임장 알림 없음 (계약 §7 `moim_member_joined`: 모임장, 벨(묶음), 푸시 X, 끌 수 있음)
- **바꿀 것**:
  - `moim-notify.server.ts` 알림 종류에 `moim_member_joined` 를 추가한다.
  - `app/api/moim/[moimId]/join/route.ts`: 결과가 `active`(바로 가입)이면 모임장에게 보낸다.
  - **가입 1건 = 벨 1개**(`dedupeRef = 가입한 사람 id`).
  - 계약 §7 의 「묶음」과 다르다. 알림 저장소는 같은 중복 방지 키가 오면 새 알림을 **버리고 갱신하지 않는다**(`notification-event-repository.ts:183` `23505 → duplicate`). 그래서 같은 키로 묶으면 두 번째 가입자부터 알림이 사라진다.
  - 묶어서 보여 주려면 알림 저장소에 「갱신」 기능이 필요하다. 알림 공용 구조 변경이라 이번 범위에서 빼고, 정확성(빠짐 없음)을 택한다.
  - 푸시를 보내지 않으므로(N1) 알림이 소리 없이 알림함에만 쌓인다.
- 문구 키 `notify_moim_member_joined_title|body` (ko·en), 알림 항목 표(`notification-item-registry.ts` 「모임 활동」)에 종류를 추가한다.
- 푸시: 아래 N1 의 「벨만」으로 보낸다.

### B3 · 멤버 초대 수락으로 생긴 가입 신청에 승인권자 알림 없음 (§7 `moim_join_requested`)
- **바꿀 것**: `app/api/moim/invites/[inviteId]/route.ts` — 수락 결과가 `pending` 이고 `request_id` 가 있으면, 가입 라우트와 같은 방식으로 승인권자(`decide_join` 권한)에게 `moim_join_requested` 를 보낸다.
- 같은 코드를 두 곳에 두지 않도록 `notifyMoimJoinRequested(sb, moimId, requestId, nickname)` 하나로 모은다.

### N1 (새로 찾음) · 계약 §7 「푸시 X」 알림이 푸시로 나감
- **대상**(계약 §7 푸시 X 표시): `moim_member_joined`(신규), `moim_role_changed`, `moim_host_changed`, `moim_post_new`
  - `moim_report_result` 는 신고 처리 결과로, 다른 도메인 공용 분류(`community_report_result`)를 써서 이번 범위에서 뺀다.
- **바꿀 것**:
  1. `notification-event-schema.ts` 푸시 끄기 이유에 `item_policy`(알림 항목 계약상 벨만)를 추가한다. DB 제약이 없어 마이그레이션은 필요 없다.
  2. `appendUserNotification` 에 선택 칸 `push_suppressed_reason` 을 추가하고 `createAndDispatchNotificationEvent` 로 넘긴다. 안 넘기면 지금과 같다(다른 호출처 영향 없음).
  3. `moim-notify` 의 `sendOne` 은 위 4종이면 `item_policy` 로 보낸다.
- **영향**: 위 4종은 벨(알림함)에만 쌓이고 푸시·소리는 나가지 않는다. 지금 운영 동작이 바뀌는 것이므로 승인 범위에 명시한다.
- **알림 hard-lock 확인**:
  - `docs/dibay-global-notification-ssot-hard-lock.md` 에 푸시 끄기 이유에 대한 규정은 없다(문서 검색).
  - 푸시 판정 함수 `dispatchNotificationPushIfAllowed` 는 `push_suppressed_reason` 이 있으면 보내지 않는다. 이 동작은 그대로 쓴다.

### E1 · 공지·글·일정·종료·위임 알림이 요청 안에서 받는 사람 수만큼 동시 무제한 실행
- **바꿀 것** — `notifyMoimMany`:
  1. **언어 한 번에 읽기**: `notification-user-language.ts` 에 `loadNotificationUserLanguages(sb, userIds)` 를 추가한다. user_settings 1회 + user_devices 1회로 N명을 읽고, 판정은 기존 `resolveNotificationLanguage` 그대로다. 받는 사람마다 2회 → 전체 2회.
  2. **동시 실행 상한 8**: `runWithConcurrencyLimit(ids, 8, sendOne)`.
  3. **응답 뒤에 보내기**: 공지·글·일정 생성·종료·위임·초대 라우트는 `after(() => notifyMoimMany(...))` 로 바꾼다. 글 작성 응답이 알림 발송을 기다리지 않는다.
- **효과(코드 계산)**: 공지 1건·멤버 M명이면 언어 조회가 2M → 2회로 줄고, 요청 응답 시간에서 알림이 빠진다. 알림 저장·푸시(받는 사람당 1회)는 그대로다.
- **깨질 수 있는 것**: `after()` 안의 실패는 응답에 나타나지 않는다. 지금도 `sendOne` 은 실패를 삼키므로(console.warn) 사용자에게 보이는 동작은 같다.

### E2 · 하위 화면마다 모임 상세(15~17회)를 다시 부름
- **바꿀 것**: `useMoimDetail` 을 모임 단위 저장소(`lib/moim/moim-detail-store.ts`)로 바꾼다.
  - 같은 모임 상세를 화면끼리 공유하고, 동시에 부르면 한 번만 부른다(single-flight).
  - 60초 안에는 저장된 값을 쓴다.
  - `reload()`·쓰기 동작 뒤에는 그 모임 값을 지우고 다시 부른다(지금 `reload` 를 부르는 곳 그대로).
  - 앱 재시작·로그아웃 때는 비운다(메모리만, 저장 안 함).
- **영향 화면**: 모임 홈, 글 상세, 글쓰기, 일정 상세, 일정 폼, 프로필, 알림 설정, 운영 화면 공용(7곳).
- **효과(코드 계산)**: 모임 홈 → 글 상세 → 뒤로 → 일정 상세 순서로 열면 상세 요청이 3회 → 1회.
- **깨질 수 있는 것**: 다른 사람이 바꾼 내용이 60초까지 늦게 보일 수 있다. 내가 바꾼 것은 즉시 다시 부른다. 당근·카톡도 화면 사이 이동에 캐시를 쓰고 당겨서 새로고침으로 갱신하는 구조다.

### E3 · 상세 API 안 중복·순차 조회
- **바꿀 것** — `getMoimDetail`(`moim-queries.server.ts`):
  - 이미 읽은 게시판 목록으로 글 종류를 정한다. `toPosts` 의 게시판 재조회 2회를 없앤다.
  - 고정 글·최근 글의 작성자를 한 번에 읽는다(2회 → 1회).
  - 다가오는 일정 조회를 앞의 병렬 묶음에 넣는다(순차 단계 4 → 2).
- **효과(코드 계산)**: 멤버 기준 15~17회 → 12~13회.
- **시험**: 가짜 Supabase 로 호출 표 이름·횟수를 세는 시험(수정 전 개수 재현 → 수정 후 개수).

### E4 · 받은 초대 목록 N+1
- **바꿀 것**: `listReceivedMoimInvites` 반복문 안 `authorMap` → 모임별 초대한 사람을 `moim_members (moim_id in …, user_id in …)` 1회로 읽는다.
- **효과**: 초대 N건이면 N회 → 1회.

### E6 · 모임 라우트 예산 미등록
- **바꿀 것** — `lib/perf/request-budget.ts`. 코드 계산값으로 등록하고, 7일 뒤 Vercel 실측으로 내리기만 한다(다른 신규 라우트와 같은 방식):
  - `/api/moim/[moimId]`(상세): 14.0 (E3 뒤 13 + 인증 1)
  - `/api/moim/categories`: 2.0 (카테고리 1 + 만들기 화면 주소 1)
- **E9 와 함께** `/api/cron/moim-schedules` 7.0 → 코드 계산값으로 내린다.
  - 할 일이 없을 때 1회, 알림이 있을 때는 받는 사람 수에 따라 늘어난다.
  - 계산 근거를 주석에 적고 **4.0** 으로 내린다. 7일 운영 실측 뒤 다시 내리기만 한다.

### E8 · 메신저 목록의 모임 방 조회 중복 요청
- **바꿀 것**: `lib/moim/use-moim-room-owner.ts` 에 「요청 중」 집합을 둔다. 응답 전에 같은 방을 다시 요청하지 않는다. 실패하면 집합에서 빼서 다음 화면 표시 때 다시 시도한다.

### E9 · `moim_invites(moim_id)` 인덱스 없음
- **바꿀 것**: 마이그레이션 `create index if not exists moim_invites_moim_idx on public.moim_invites (moim_id, created_at desc)`.
- 운영 `moim_invites` 는 지금 몇 행 안 되므로 잠금 영향이 없다. 적용 직전에 행 수를 다시 조회한다.

---

## 2. 함께 바뀌는 문구 (ko·en, 키로만)

- `notify_moim_member_joined_title` / `_body`: 「새 멤버가 들어왔어요」 / 「{name}님이 {moim}에 가입했어요」 · "New member" / "{name} joined {moim}"

## 3. 검증 계획

- **실패 재현 시험**:
  - B2·B3: 가입·초대 수락 라우트 → 알림 호출(종류·받는 사람)
  - N1: 4종이 `push_suppressed_reason='item_policy'` 로 저장되고 다른 종류는 그대로
  - E1: 언어 조회 2회 · 동시 실행 상한 · `after` 안에서 실행
  - E2: 같은 모임 두 화면 → 요청 1회
  - E3·E4: 호출 수
  - E8: 응답 전 같은 방 재요청 → fetch 1회
- vitest 전체, typecheck:build·test, eslint, check:i18n-quality 각 1회.
- 독립 재감사 통과 뒤 PR(자동 병합 없음) → 운영 DB 인덱스 적용 승인 → 「병합」.

## 4. 롤백

- 코드: Instant Rollback.
- DB: 인덱스 `drop index moim_invites_moim_idx`. 함수 변경이 없어 백업할 정의가 없다.

## 5. 이번 범위에서 빼는 것 (이유)

- `moim_report_result` 의 푸시: 커뮤니티 신고 결과 공용 분류라 모임만 바꿀 수 없다. 커뮤니티 신고 알림 계약과 함께 다뤄야 한다.
- 일정 방 역할이 위임 때 바뀌는 문제(`moim__host_swap`, 2번 묶음 재감사에서 범위 밖으로 기록): 알림·호출 묶음이 아니라 권한 묶음이다. 4번 묶음(메신저 모임 방)에서 같이 다룬다.
