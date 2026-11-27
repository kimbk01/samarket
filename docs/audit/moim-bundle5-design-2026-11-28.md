# 모임 감사 5번 묶음 설계안 — 오픈채팅 입장 비밀번호 (2026-11-28)

- **근거:** 감사 `docs/audit/moim-full-audit-2026-11-27.md` C1(P1 보안) 및 §3 권장안 「비밀번호」 줄
  - 권장안 원문: 「오픈채팅 참여코드는 4자리 이상(숫자 6자리 권장)으로 하고, 느린 해시(scrypt, salt 포함)와 고정 시간 비교를 쓴다. 방·계정 단위로 연속 실패 5회면 잠근다」
- **계약:**
  - 오픈채팅 비밀번호를 정한 계약 문서는 없다(`docs/` 검색 결과 감사 문서뿐).
  - 아래 값(4~32자, 5회·15분)은 위 감사 권장안에서 가져왔다. 이 설계 승인이 곧 값 승인이다.
- **상태:** 설계안이며 아직 구현·DB 변경은 없다. 승인 뒤 구현한다.
- **반영 단위:** PR 1개, 병합 1회, 운영 빌드 1회.
  - 마이그레이션은 1개다(실패 기록 표 1개 + 함수 1개).
  - 순서는 운영 DB 적용(승인) → Owner 「병합」이다. 자동 병합은 등록하지 않는다.
- **[배포 구분]** 웹만.
- **영역:** 메신저 오픈채팅 입장이다.
  - 통화 코드는 건드리지 않는다.
  - 모임 방과 채팅 3종 경계도 바뀌지 않는다.

## 0. 확인한 사실 (main `63057603f` · 운영 DB 읽기 전용 2026-11-28)

| 사실 | 근거 |
|---|---|
| 해시는 `sha256(trim(비밀번호))` 한 번이고 salt 가 없다. 비교는 문자열 `===` 이다 | `lib/community-messenger/open-group-password.ts:9-17` |
| 만들기(`service.ts:11957-11969`)와 설정 수정(`:12633-12650`)은 비었는지만 본다. 길이 제한이 없어 1자리도 저장된다 | 같은 파일 |
| 입장 라우트 제한은 계정·IP 키로 분당 20회뿐이다. 방 단위 실패 횟수와 잠금은 없다 | `app/api/community-messenger/open-groups/[roomId]/join/route.ts:16-22` |
| 그 분당 제한도 운영에서는 **서버 인스턴스마다 따로 센다** | `enforceRateLimit` 은 `UPSTASH_REDIS_REST_*` 가 없으면 프로세스 메모리를 쓴다(`lib/http/api-route.ts:232`). 운영 Vercel 환경변수에 `UPSTASH` 이름이 0개다(이름만 조회, 값은 보지 않음) |
| 입력칸 3곳 모두 `maxLength` 가 없다 | 만들기 `CommunityMessengerHome.tsx:4049`, 입장 `OpenGroupJoinPreviewFullScreen.tsx:133`, 방 설정 `CommunityMessengerRoomPhase2RoomSheets.tsx:1462` |
| 운영 오픈채팅 8개는 모두 `join_policy='free'` 이고 비밀번호 해시는 0개다. 옮기거나 다시 만들 해시가 없다 | 운영 `community_messenger_rooms` 조회 |
| 화면 데이터(요약)에는 `requiresPassword` 만 있고 해시는 없다 | `lib/community-messenger/types.ts:212,315` |

---

## 1. 바꿀 것

### P1 · 해시: scrypt + salt + 고정 시간 비교
- 파일은 `lib/community-messenger/open-group-password.ts` 하나다.
- 저장 형식은 `scrypt$16384$8$1$<salt base64>$<hash base64>` 이다.
  - salt 16바이트(무작위), 결과 32바이트.
  - Node 내장 `crypto.scrypt` 를 쓰고 새 패키지는 없다. 비동기로 돌려 서버를 멈추지 않는다.
- 비교는 `timingSafeEqual` 로 한다.
- 예전 형식(64자 16진수 sha256)도 고정 시간 비교로 계속 읽는다.
  - 운영에는 0개지만 개발 메모리 저장본과 혹시 생길 수 있는 예전 값을 위해서다.
  - 새로 저장하는 값은 항상 scrypt 다.
- 함수가 비동기가 되므로 호출처 4곳(만들기·입장·입장 개발 경로·설정 수정)에 `await` 를 붙인다(`service.ts`).

### P2 · 길이: 4~32자
- 서버의 만들기·설정 수정에서, 공백을 자른 뒤 4자 미만이면 `password_too_short`, 32자를 넘으면 `password_too_long` 으로 거부한다.
- 입장할 때는 길이로 거부하지 않는다. 틀린 비밀번호로 처리해 실패 횟수에 넣는다.
- 화면
  - 입력칸 3곳에 `maxLength={32}` 를 넣는다.
  - 만들기·방 설정 입력칸 아래에 안내 「4자 이상 (숫자 6자리 권장)」을 넣는다.
  - 오류 문구 연결은 `messenger-home-action-error-message.ts`·`messenger-room-action-error-messages.ts` 두 곳이다.

### P3 · 잠금: 방·계정마다 연속 5회 틀리면 15분 잠금
- 운영에 Redis 가 없어 메모리 제한은 서버마다 따로 센다. 그래서 **운영 DB 에 센다.**
- 마이그레이션 1개
  - 표 `community_messenger_open_group_join_failures (room_id uuid, user_id uuid, fail_count int, first_failed_at timestamptz, locked_until timestamptz, primary key(room_id, user_id))`
    - `room_id` 는 방 삭제 시 함께 지운다(on delete cascade).
    - RLS 를 켜고 정책은 두지 않는다(서버 service_role 만 쓴다).
  - 함수 2개. 둘 다 security definer 이고 service_role 만 실행할 수 있다.
    - `cm_open_group_join_begin(p_room uuid, p_user uuid) returns jsonb` — **비밀번호를 검사하기 전에** 시도를 1 더한다.
      - 15분 창이 지났거나 잠금이 끝났으면 1부터 다시 센다.
      - 5번째 시도에서 `locked_until = now() + 15분` 이다. 잠금 중에는 잠금 끝 시각을 늘리지 않는다.
      - 세고 난 횟수가 5 이하면 `{allowed:true}`(5번째면 `locked_until` 도 준다), 6 이상이면 `{allowed:false, locked_until}` 이다.
      - 한 문장(`insert … on conflict do update`)이라 동시 요청도 행 잠금으로 차례대로 센다.
    - `cm_open_group_join_clear(p_room uuid, p_user uuid)` — 비밀번호가 맞았을 때 기록을 지운다(잠금도 풀린다).
  - 재감사 M1 반영 (2026-11-28)
    - 처음 설계(잠금 읽기 → 검사 → 틀리면 기록)는 동시에 여러 요청을 보내면 모두 「안 잠김」을 읽고 검사돼 5번 제한을 넘었다.
    - 그래서 검사 전에 세는 방식으로 바꿨다.
    - 로컬 Postgres 17 에서 기록이 없을 때 동시 8건을 보내면 허용 5건·거부 3건이다.
- 입장 흐름(`joinOpenGroupRoomWithPassword`, 비밀번호 방일 때만)
  1. 방 조회 뒤 `cm_open_group_join_begin` 을 1회 부른다.
     - 거부되면 비밀번호를 검사하지 않고 `password_locked` 다.
     - 함수 오류나 이상한 값이면 `join_lock_check_failed` 로 막는다.
  2. 틀리면 `invalid_password` 다. 5번째 시도였으면 `password_locked` 다.
  3. 맞으면 `cm_open_group_join_clear` 를 1회 부른다.
- 라우트는 `password_locked` 를 **429** 와 `retryAfterSec`(`Retry-After`)로 돌려준다. 다른 오류는 지금처럼 400 이다.
- 화면에는 서버가 준 남은 시간(분)으로 「… {minutes}분 뒤 다시 시도해 주세요」를 띄운다(재감사 L3).
  - 남은 시간이 없는 경로는 「잠시 뒤」 문구를 쓴다.
- 요청 수
  - 자유 입장 방은 그대로다.
  - 비밀번호 방은 시도마다 DB 함수 +1, 맞을 때 +1 이다.
  - 운영 비밀번호 방은 0개라 요청 예산 변화는 없다.

### 함께 바뀌는 문구 (ko·en, 키로만)
| 키 | 한국어 | 영어 |
|---|---|---|
| `nav_messenger_password_too_short` | 비밀번호는 4자 이상이어야 해요 | Use at least 4 characters |
| `nav_messenger_password_too_long` | 비밀번호는 32자까지 쓸 수 있어요 | Use 32 characters or fewer |
| `nav_messenger_password_locked` | 비밀번호를 여러 번 틀려 잠시 입장할 수 없어요. 잠시 뒤 다시 시도해 주세요 | Too many wrong tries. Try again later. |
| `nav_messenger_password_locked_minutes` | 비밀번호를 여러 번 틀려 잠시 입장할 수 없어요. {minutes}분 뒤 다시 시도해 주세요 | Too many wrong tries. Try again in {minutes} min. |
| `nav_messenger_password_rule_hint` | 4자 이상 (숫자 6자리 권장) | At least 4 characters (6 digits recommended) |

---

## 2. 영향 (같은 단계에서 함께 처리)

| 바뀌는 곳 | 영향 | 처리 |
|---|---|---|
| `hashOpenGroupPassword`·`verifyOpenGroupPassword` 가 비동기로 바뀐다 | `service.ts` 호출처 4곳 | 모두 `await` 를 붙이고 타입 검사로 빠진 곳이 없는지 확인한다 |
| 길이 검사 | 기존 1~3자 비밀번호 방 | 운영 0개. 입장 검사는 길이를 보지 않으므로 예전 방도 입장된다 |
| 잠금 | 비밀번호를 맞게 아는 사람이 5회 틀린 경우 | 15분 뒤 자동으로 풀린다. 방장이 비밀번호를 바꿔도 잠금은 그대로다(계정 단위) |
| 관리자 화면 | `requiresPassword` 표시만 쓴다 | 변경 없음 |

- 재감사 반영 (2026-11-28)
  - L1: 자유 입장으로 바꿀 때는 남은 비밀번호의 길이를 보지 않는다(예전처럼 해시를 지운다).
  - L2: 저장값의 scrypt 비용이 메모리 상한을 넘거나 계산이 실패하면 틀린 비밀번호로 본다.

## 3. 이 묶음 밖 (보고만, 고치지 않음)
- 시도 기록은 맞히지 않으면 지워지지 않고 남는다(정확성 문제는 아님, 재감사 L5).
- 이미 방에 있는 멤버도 입장 API 를 다시 부르면 비밀번호부터 검사한다(`service.ts:12502` 가 멤버 확인보다 앞에 있다). 화면은 멤버에게 입장 화면을 띄우지 않아 실제 영향은 확인하지 못했다.
- `community_messenger_rooms.password_hash` 는 방 멤버 권한(RLS `cm_can_access_messenger_room`)이면 클라이언트에서 읽을 수 있다.
  - 멤버는 이미 비밀번호를 아는 사람이라 영향이 작다.
  - 열 권한을 막으려면 메신저 클라이언트 조회 전체를 확인해야 해서 별도 작업이다.

## 4. 검증 계획
- 시험(수정 전 실패 재현)
  - 새 해시가 salt 때문에 매번 다르고, 같은 비밀번호로 검증되는지
  - 예전 sha256 값을 읽는지
  - 1자리·33자리를 거부하는지
  - 5번째로 틀리면 429 `password_locked` 인지, 잠금 중에는 맞는 비밀번호도 막히는지, 성공하면 기록이 지워지는지
  - 자유 입장 방은 DB 조회가 늘지 않는지
- 로컬 Postgres 17: 함수의 횟수·15분 창·잠금·성공 삭제 시나리오와 동시 실패 2건.
- 검사
  - vitest 전체, `typecheck:build`·`typecheck:test`, eslint, `check:i18n-quality` 각 1회
  - 메신저 관련 `verify:*` 1회
- 독립 재감사를 통과하면 PR(자동 병합 없음) → DB 적용 승인 → 「병합」 순서로 간다.

## 5. 롤백
- DB: 새 표와 함수만 추가한다(기존 정의 변경 없음). 되돌릴 때는 `drop function`(2개)·`drop table` 한다.
- 코드: Instant Rollback.
  - 그 사이 scrypt 로 저장된 비밀번호는 예전 코드가 읽지 못한다.
  - 운영 비밀번호 방은 0개라, 롤백 시점에 만들어진 비밀번호 방만 비밀번호를 다시 정하면 된다.
