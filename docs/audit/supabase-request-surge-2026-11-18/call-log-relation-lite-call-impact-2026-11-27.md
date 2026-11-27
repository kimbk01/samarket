# 결함 4 — 통화 기록 목록 관계 조회 줄이기 · 통화 영향 분석서 (2026-11-27 PHT)

- **지시**: Owner 「결함 4 설계대로 진행」(2026-11-27).
  - 설계: `resume-fixed-cost-design-2026-11-27.md` §5. 절차는 ① 영향 분석서 → ② Owner 승인 → ③ 통화 단독 PR → ④ 실기.
- **규정**: AGENTS 「통화 변경 규정」 §1에 따라 `service.ts`의 통화 함수(`listCommunityMessengerCallLogs`)를 바꾸는 일이라 이 규정의 대상이다.
  - 규정 §3: 영향 분석과 계획을 먼저 문서로 쓰고 **Owner 승인 후 구현**한다.
  - **이 문서 = ① 단계.** Owner 「구현 승인」(2026-11-27) 뒤 구현 — 시험 `lib/community-messenger/call-history/__tests__/call-log-relation-lite.test.ts`.
- **근거**(전부 11-27 조회)
  - Vercel 관측 `external_api_request` `origin_route=/api/community-messenger/calls` × `request_path`(11-26 UTC 하루 전수)
  - 코드 `origin/main` `f408371`

## 1. 왜 (증거)

**요청과 호출 수**
- 11-26 하루 요청 154번에 Supabase 호출이 2,494번이었다. **요청 1번당 16번**이다.
- 예산은 12(`lib/perf/request-budget.ts`)라 초과다.
- 이전에는 통화 탭에서만 불렀다. 11-26 19:08 PHT에 병합된 #612(홈 telRING 최근 통화)부터 홈에서도 부른다.

**요청 1번당 호출 분해 (운영 실측 = 코드 경로와 일치)**

| 구분 | 표 (1회당 횟수) | 1회당 | 코드 |
|---|---|---:|---|
| 통화 기록 본체 | `call_logs` 1 · `call_log_user_hides` 1 · `call_sessions` 1 · `call_session_participants` 2 · `participants` 1 · `rooms` 1 · `room_profiles` 1 · `profiles` 1 | **9** | `service.ts:4852` `listCommunityMessengerCallLogs` |
| 관계 — 차단·팔로우·숨김 친구 | `user_relationships` 1 · `user_social_relations`(차단) 1 | 2 | `service.ts:2251` `getViewerRelationSets` |
| 관계 — 즐겨찾기 | `community_friend_favorites` 1 | 1 | 같은 함수 |
| 관계 — 친구 여부 | `community_messenger_friendships` 1 · `user_social_relations`(저장 친구 2방향) 2 · `community_friend_requests` 1 | 4 | `fetchCommunityFriendAcceptedRowsForViewer`(`service.ts:2632`) |
| 합 | | **16** | |

- 관계 조회는 `hydrateProfiles` → `hydrateProfilesWithProfileMap` → `getViewerRelationSets`에서 항상 일어난다.

**응답이 쓰는 관계 값**
- 통화 기록 응답이 쓰는 관계 값은 **친구 여부(`isFriend`) 하나**뿐이다.
  - 쓰는 곳: `buildCallLogEntriesFromRows`의 `peerRelationLabel`(`service.ts:4832`).
  - 화면: 통화 탭 줄 「모르는 사람」 표시(`CommunityMessengerCallRow.tsx:71`).
- 아래 값은 통화 기록 경로 어디서도 읽지 않는다(코드 조회로 확인).
  - 차단·팔로우·즐겨찾기·숨김 친구(`blocked`·`following`·`isFavoriteFriend`·`isHiddenFriend`)
  - 확인한 함수: `summarizeRoomsBatchWithProfileMap`(`:3141`), `loadSessionMapsForCallLogs`(`:4602`), `buildCallLogEntriesFromRows`(`:4702`)
- 홈 telRING(`HomeTelringRecent.tsx`)은 `peerRelationLabel`도 쓰지 않는다.
  - 쓰는 값: 이름·사진·종류·시각·`startCallFromHistory`
  - 그런데도 첫 페이지 30건을 통째로 받아 **앞 3건만** 쓴다(`:42`).

## 2. 바꾸는 것

### 2-1. 파일·함수

| 파일 | 바꾸는 것 |
|---|---|
| `lib/community-messenger/service.ts` | `hydrateProfilesWithProfileMap`·`hydrateProfiles`에 선택 인자 `relations?: "all" \| "friend" \| "none"`을 둔다(기본 `"all"` = 지금과 같음). `"friend"`는 친구 여부만(4번), `"none"`은 관계 조회 0번 |
| 같은 파일 `listCommunityMessengerCallLogs` | 선택 인자 `view?: "full" \| "home"`, `limit?: number`. `full`(기본)은 `relations:"friend"`. `home`은 `relations:"none"`, `peerRelationLabel` 생략, 응답 상한 `limit`(1~10, 기본 3) |
| `app/api/community-messenger/calls/route.ts` | 주소 값 `view=home`·`limit` 읽기(없으면 지금과 같음) |
| `lib/community-messenger/call-history/use-community-call-history-realtime-sync.ts` | `fetchCommunityMessengerCallLogsClient({ view: "home", limit: 3 })` — 주소·단일 비행 키를 따로 둔다 |
| `components/home-hub/HomeTelringRecent.tsx` | 위 홈 전용 호출로 바꾼다 |
| `lib/perf/request-budget.ts` | 반영 하루 실측 뒤 같은 PR 규칙대로 예산 값 확인(내리기만) |

### 2-2. 바뀌는 동작

| 호출처 | 지금 1회당 | 바뀐 뒤 1회당 | 응답 차이 |
|---|---:|---:|---|
| 통화 탭(`MessengerCallLogsPanel`) | 16 | **13** | 없음 — 쓰지 않는 값만 빠짐 |
| 메신저 홈 bootstrap 통화 기록 합류(`bootstrap/route.ts:406`) | 16 | **13** | 없음 |
| 홈 telRING | 16 | **9** | `peerRelationLabel` 없음(홈은 안 씀) · 응답 3건 |

- 감소량은 운영 실측에서 빠지는 표의 1회당 횟수를 센 값이다. 반영 뒤 같은 `request_path` 조회로 확정한다.
- **구현 때 정한 점 (2026-11-27)**: 홈도 DB 에서는 지금처럼 한 페이지를 읽고 **응답만** 3건으로 자른다. 보는 사람 기준 제외(`shouldIncludeCallLogRowForViewer` — 상대가 건 「본인 통화 중」 기록 등)가 화면용 변환 단계에서 일어나므로, 3행만 읽으면 앞 행이 빠질 때 3건이 모자란다(시험 「제외 행이 맨 앞에 있어도 3건」). 조회 횟수는 행 수와 무관해 감소량은 같다.

## 3. 영향받는 경로 (규정 §3 항목별)

| 경로 | 영향 | 근거 |
|---|---|---|
| 발신 시작·세션 생성 | **없음** | 이 경로는 `listCommunityMessengerCallLogs`·`hydrateProfiles`의 통화 기록 호출을 쓰지 않는다. `hydrateProfiles`·`hydrateProfilesWithProfileMap`은 `service.ts` 밖으로 내보내지 않는 함수이고, 파일 안 호출 28곳(정의 2곳 제외, `grep -c` 30)은 기본값(`all`)으로 지금과 같다 |
| VoIP·FCM 발송 · iOS CallKit/PushKit · Android 수신 화면 | **없음** | 서버 발송(`lib/push/**`)·네이티브(`android/**`·`ios/**`) 무변경. 네이티브는 `/api/community-messenger/calls`를 부르지 않는다(`android/` 경로 판정 2곳만 문자열로 씀, `MainActivity.java:179·2105`) |
| 취소·거절·종료·부재중 · 상태 폴링 · CallKit 종료 신호 | **없음** | 세션 API(`calls/sessions/**`)·`call-v4/**` 무변경 |
| 통화 기록 저장(`ensureTerminalCallStub` 등) | **없음** | 쓰기 경로 무변경. 읽기 목록만 바뀐다 |
| 통화 기록 표시 — 통화 탭 | 같음 | 같은 행·같은 필드. 「모르는 사람」 판정(친구 여부)은 그대로 4번 조회로 계산 |
| 통화 기록 표시 — 홈 telRING | 3건만 받음 | 홈은 이미 3건만 쓰고 `peerRelationLabel`을 쓰지 않는다 |
| 기록에서 다시 걸기(`startCallFromHistory`) | **없음** | 함수·인자 무변경(`peerUserId`·`callKind`·방 id는 그대로 응답에 있다) |
| 팝업 | **없음** | 통화 팝업은 이 목록을 쓰지 않는다 |
| 설치된 구 바이너리 | **없음** | 웹 변경만(앱 안 WebView는 운영 웹을 받는다). 서버는 `view` 없는 요청에 지금과 같은 응답을 준다 |

## 4. 회귀 위험과 같은 단계 처리

1. **`hydrateProfiles` 기본값을 실수로 바꾸는 위험**
   - 대책: 기본값 `"all"`을 시험으로 고정한다. `"friend"`·`"none"`은 통화 기록 함수에서만 넘긴다(`git grep` 시험).
2. **홈 단일 비행 분리**
   - 지금은 홈과 통화 탭이 같은 비행 키라, 동시에 열리면 1번으로 합쳐진다.
   - 분리하면 둘이 동시에 열릴 때 2번이 된다. 두 화면은 같은 화면에 함께 뜨지 않는다(홈 탭 ↔ 메신저 통화 탭).
   - 통화 종료 뒤 다시 읽기: 홈(`HOME_CALLS_AFTER_END_MS`)과 통화 탭(실시간 동기)은 각자 경로라 지금도 따로 부른다.
3. **친구 판정 누락**
   - `"friend"`는 지금과 같은 함수(`fetchCommunityFriendAcceptedRowsForViewer`)를 그대로 부른다.
   - 시험: 친구 / 모르는 사람 / 저장 친구 / 요청만 수락된 경우의 `peerRelationLabel`이 바뀌기 전과 같은지 확인한다.
4. **차단 사용자 표시**
   - 지금도 통화 기록은 차단 여부로 거르거나 표시하지 않는다(코드 확인). 바뀌지 않는다.

## 5. 롤백

- PR 되돌리기 1번(웹만). 운영 즉시 복구가 필요하면 Vercel Instant Rollback(개발 프로세스 2번 절차).
- DB 변경은 없다.

## 6. 검증

**코드**
- 단위 시험
  - `relations` 3값별 조회 표
  - 통화 기록 `full` 응답이 바뀌기 전과 같은지(`peerRelationLabel` 포함)
  - `home` 응답은 3건이고 `peerRelationLabel`이 없는지
  - `hydrateProfiles` 기본값이 `all`인지
- `test:ci` 전체, 타입검사 2종, eslint

**운영(반영 다음 날)**
- 같은 Vercel `request_path` 조회로 1회당 값을 확정한다(통화 탭·홈 구분). 예산 값은 실측에 맞춰 확인한다.

**실기 (Android Samsung·Xiaomi, iPhone · 앱 실행 상한 10회 안)**
- C1 통화 탭 목록: 바뀌기 전과 같은 건수·순서·「모르는 사람」 표시
- C2 홈 telRING: 최근 3건 같음, 행 버튼으로 음성·영상 발신 연결
- C3 통화 종료 뒤 홈·통화 탭이 새 기록을 보이는지
- 통화 행렬(규정 §5): 이 변경은 신호·세션·발송·네이티브를 바꾸지 않는다(§3).
  - 행렬 전체를 다시 돌릴지, C2의 발신 연결 확인으로 갈음할지는 **Owner 결정**이다.

## 7. Owner 결정 필요

1. 이 분석대로 구현 승인 여부
2. 실기 통화 행렬: 전체 재실행 / C2 발신 연결로 갈음
