# 앱 다시 열기 고정 비용·통화 기록 비용 — 결함 4건 수정 설계 (2026-11-27 PHT)

- 지시: Owner 「끝까지 확인해서 결함 보고」 → 「설계 진행」(11-27). 배경: 「실제 회원이 1천·1만으로 늘어도 문제가 없어야 한다」
- **설계만 한다. 구현·운영 변경 없음.**
- 근거(전부 11-27 조회)
  - Vercel 관측: 들어온 요청 `route`·`client_ip`·`client_user_agent`, 나간 호출 `origin_route`·`request_path` — 11-26 하루 전수
  - Supabase `edge_logs`
  - 운영 DB 읽기 전용
  - 코드 `origin/main` `2203d00`
  - 로그인 라이브러리 `@supabase/auth-js` 2.99.2(`package-lock.json` 고정)
- 먼저 읽은 계약
  - `docs/DIBAY_APP_LIFECYCLE_SSOT.md` §Discovery(259행)·§IN-P10(273행)
  - `docs/auth-hard-lock.md`(Client Sync LOCK)
  - `docs/messenger-realtime-policy.md` + 개정안 `messenger-realtime-contract-revision-d1-d2-2026-11-26.md` R2(재연결 1번 = 재동기화 1번)
  - `docs/request-budget-ssot.md`
  - AGENTS 통화 변경 규정 §1(`service.ts` 통화 함수 포함)

## 1. 결함 요약

| # | 결함 | 하루 실측(11-26) | 다시 열기 1번당 Supabase |
|---|---|---|---|
| 1 | 다시 열 때마다 「손님 → 회원 정리」 요청 + **같은 행 반복 복사(운영 데이터 중복 3,146행)** | 482요청 · 1,025호출 | 2.1 |
| 2 | 다시 열 때마다 시작 화면 정보 조회(간격 제한 없음) | 322요청 · 979호출 | 3.0 |
| 3 | 실시간이 이미 따라잡는 값을 다시 열 때마다 또 조회 — 친구요청·알림 배지·사장님 배지·주소 확인 | 1,265 / 628 / 373 / 484 요청 | 1.1 + 1.5 + 1.1 + 1.5 |
| 4 | 홈 telRING 최근 통화 — 요청 1번당 Supabase 16번, 쓰지 않는 관계 조회 포함, 예산 12 초과 | 159요청 · 2,494호출 | (홈을 열 때) |

- 다시 열기 1번 고정 비용: 결함 1~3 합 약 **10.3**에 접속 상태 1.3, 가입 상태 등을 더하면 약 12~14번이다.
- 일반 회원 기기(SM-S928N)는 하루 16번 다시 열었다(손님→회원 정리 요청 수 = 다시 열기 수).
- 계산: 1만 명 × 16번 × 10.3 ≈ **하루 165만 호출**이 화면과 무관하게 나간다.

## 2. 결함 1 — 손님 → 회원 정리

### 2-1. 사실

- **호출**: `components/auth/SupabaseAuthSync.tsx:138-145`
  - `SIGNED_IN` 이벤트마다 `reconcileGuestPromotionLifecycleClient()`를 부른다(같은 사용자인지 확인 없음).
- **`SIGNED_IN`이 다시 오는 이유**: auth-js 2.99.2 `GoTrueClient.js`
  - 2453행 `_onVisibilityChanged`가 화면이 숨김 → 보임으로 바뀔 때마다 `_recoverAndRefresh()`를 부른다.
  - 2124행에서 세션이 살아 있으면 `SIGNED_IN`을 다시 알린다. **즉 앱을 다시 열 때마다 온다.**
- **서버**: `lib/platform-promotion-lifecycle/reconcile-guest-lifecycle.ts`
  - 이 기기의 손님 행(`user_id is null`)을 읽어 회원 행으로 **새로 insert** 한다.
  - 원본 손님 행은 지우지 않는다.
  - 두 표 모두 고유 제약이 기본 키(`id`)뿐이다(운영 `pg_index` 조회). 그래서 다시 열 때마다 같은 행이 또 복사된다.
- **운영 데이터(읽기 전용 조회)**

  | 표 | 회원 행 | 그중 중복 | 최대 중복 |
  |---|---:|---:|---|
  | `platform_promotion_content_visits` | 787 | **780** | 한 묶음 770행(q테스트1, 09-20~09-24) |
  | `platform_popup_user_suppressions` | 2,467 | **2,366** | 400행 × 4묶음(한 회원, 11-04~11-18) |

  - 남아 있는 손님 행은 방문 5행, 숨김 146행이다. 이 기기들이 로그인해 다시 열 때마다 계속 늘어난다.
- **지금 화면 영향**
  - 방문 조회(`load-content-visits.ts`)는 `session_key`로 거르고 `limit(100)`이다. 위 중복은 지난 세션 키라 지금 세션 판정에는 영향이 없다(조회 조건으로 확인).
  - 다만 같은 세션 안에서 중복이 100을 넘으면 다른 방문이 잘린다.
  - 팝업 숨김 조회(`load-popup-candidates.ts:381`)는 `limit`이 없어 중복만큼 행을 더 읽는다.

### 2-2. 수정

- **인증 코드(`SupabaseAuthSync`)는 바꾸지 않는다.** Auth HARD LOCK 대상이다.
- 정리 함수 쪽에서 막는다.
  1. **클라이언트 1회 표지** — `lib/platform-promotion-lifecycle/client-record-content-visit.ts`
     - `reconcileGuestPromotionLifecycleClient`가 기기 저장소에 `<사용자 id>:<기기 키>` 완료 표지를 둔다.
     - 표지가 있으면 요청을 보내지 않는다.
     - 서버가 `ok:true`로 답했을 때만 표지를 쓴다. 실패하면 다음 로그인 때 다시 시도한다.
  2. **서버 중복 복사 방지** — `reconcile-guest-lifecycle.ts`
     - 회원에게 **똑같은 행**이 이미 있으면 넣지 않는다. 비교는 복사되는 열 전부(숨김 = 캠페인·방식·세션·기한·캠페인 판·시간대, 방문 = 이벤트·세션·경로·배포 id·방문 시각)이고, 시각은 같은 순간이면 같은 값으로 본다. 기한이 다른 숨김(지난주 「오늘 숨김」 vs 오늘)은 다른 행이라 빠뜨리지 않는다. 손님 행 안의 같은 항목도 1번만.
     - 회원 기존 행은 1,000행씩 끝까지 읽는다(PostgREST 최대 행 1,000에서 잘리면 중복이 생김). 5,000행을 넘으면 넣지 않고 실패로 끝낸다(운영 최대 1명 1,600행).
     - 회원 행 조회가 표마다 1번 이상 늘어난다(손님 행이 있을 때만).
  1-1. **클라이언트 표지 보완 (검토에서 추가, 2026-11-27)**
     - 표지 값 = 기기 기록 순번. 팝업 숨김(`GlobalPopupHost`·`ptr-reveal-client`)·방문 기록을 보낼 때마다 순번을 올린다. 세션 만료처럼 로그아웃 정리 없이 손님이 된 뒤 남긴 기록도, 다음 로그인 이벤트에 순번이 달라 1번 다시 보낸다(누락 방지).
     - 같은 계정·기기 요청이 가는 중이면 겹쳐 보내지 않는다(동시 SIGNED_IN → 서버 동시 복사 → 중복 방지).
     - **구현 때 바꾼 점 (2026-11-27)**: 처음 설계는 「복사한 손님 원본을 지운다(옮기기)」였다. 구현 중 확인하니 원본을 지우면 로그아웃 뒤 같은 기기의 손님 상태(팝업 「다시 보지 않기」·세션 방문)가 사라져 손님일 때 숨긴 팝업이 다시 뜬다. 이 영향은 설계에 없던 것이라, 원본은 두고 중복만 막는 방식으로 바꿨다.
  3. **운영 중복 정리**
     - 중복 3,146행 삭제와 고유 인덱스 추가(방문 `(user_id,event_id,session_key)`, 숨김 `(user_id,campaign_id,mode,session_key)`).
     - **운영 DB 변경이라 Owner 별도 승인 대상이다.** 먼저 백업하고, 삭제 전후 행 수를 보고한다.

### 2-3. 영향·같은 단계 처리

- **바뀌는 동작**: 손님일 때 팝업 「다시 보지 않기」·방문 기록이 로그인 뒤 회원으로 옮겨지는 것은 그대로다(첫 로그인 1번).
- **영향받는 곳**
  - `/api/platform-popup/resolve`·`ptr-reveal`(읽는 쪽): 행이 줄 뿐 판정은 같다.
  - 관리자 화면 중 이 두 표를 읽는 곳은 없다(`git grep` 사용처 = 위 3파일 + 기록 2곳).
- **깨질 수 있는 것**: 기기 저장소를 지우거나 로그아웃하면(로그아웃 정리가 표지를 지움) 1번 더 보낸다. 서버는 이미 있는 행을 건너뛰어 0건 복사로 끝난다.
- **검증**
  - 단위 시험 `lib/platform-promotion-lifecycle/__tests__/reconcile-guest-once.test.ts`: 성공 뒤 미호출, 실패 시 표지 없음, 계정별 표지, 두 번째 호출 0건 복사, 손님 행 안 중복 1번, 손님 원본 유지.
  - 운영: 반영 다음 날 `reconcile-guest` 요청 수가 로그인 수 수준(11-26: 482 → 한 자릿수~수십)인지.

## 3. 결함 2 — 시작 화면 정보(인트로)

### 3-1. 사실

- `lib/launch-intro/discovery.ts:152`
  - `visibilitychange` → 보임마다 `runLaunchIntroDiscovery("resume")`를 부른다. 막는 것은 「진행 중」 표지뿐이다.
- 서버 `app/api/launch-intro/live/route.ts`
  - no-store다. Live 행 + 게시본(+ 삭제 이력) + 소재 묶음(`admin_settings`·`launch_intro_creatives`)을 읽어 요청 1번당 Supabase 3.0번이다.
- 계약
  - `DIBAY_APP_LIFECYCLE_SSOT.md` 259행: 「discovery는 startup 이후(OS release / foreground)만 실행」.
  - 라우트 주석: 「일시정지·게시중단 revision이 늦게 반영되지 않도록 no-store」.
  - 같은 SSOT 274행: 인트로는 **완전히 종료 후 다시 켤 때(USER_COLD)만** 보인다. 다시 열 때 받은 결과는 「다음 새로 켬」에만 쓰인다.

### 3-2. 계약과의 충돌 (Owner 결정 필요 — 규정 「Owner 지시와 기존 설계 충돌 보고」)

- 다시 열 때마다 조회하는 것은 **계약대로**다. 줄이려면 계약을 바꿔야 한다.
- 안
  - 다시 열 때 조회를 「마지막 조회 뒤 N분 지났을 때만」으로 바꾼다. 새로 켤 때 조회(OS release 뒤)는 지금처럼 매번 한다.
  - 바뀌는 것: 관리자가 인트로를 일시정지·게시중단한 뒤 그 기기가 **N분 안에** 완전히 껐다 켜면, 1번 더 예전 인트로가 보일 수 있다.
  - 지금도 새로 켤 때 화면은 그 전에 받은 색인을 쓴다(SSOT 259행 「현재 실행 snapshot 변경 금지」). 그래서 「다음 새로 켬부터 반영」이라는 구조 자체는 같다.
- 결정할 것: N 값(예 30분), 또는 지금 계약 유지.
- **계약을 유지하면 결함 2는 수정하지 않는다.**

## 4. 결함 3 — 실시간이 따라잡는 값을 다시 열 때 또 조회

### 4-1. 사실

| 대상 | 다시 열 때 조회 위치 | 재연결 따라잡기(D2 R2)도 있나 |
|---|---|---|
| 친구요청 | `use-global-friend-request-feed.ts:234` `syncPending("resume")` (visibility·focus·appStateChange, 2초 합침) | **있음** — `:190-193` SUBSCRIBED 2번째부터 `noteMessengerRealtimeResubscribed()` → 재동기화 묶음, `:167` `syncPending("reconnect")` |
| 알림 배지 | `NotificationsBadgeRealtimeBridge.tsx:63` `requestNotificationBadgeCountResync("app_resume")` | **있음** — `useSupabaseNotificationsRealtime.ts:98-99·109` 재연결 때 `RESYNC` → 배지 1회 재조회(`:39`) |
| 사장님 배지 | `owner-hub-badge-store.ts:1856` `onVisibility` (45초 안이면 건너뜀) | **없음** — 재동기화 구독이 없다(`onMessengerRealtimeResynced` 사용 0) |
| 주소 확인 | `MandatoryAddressGate.tsx:159-172` visibility·pageshow → 15초 캐시 뒤 재조회 | 해당 없음(실시간 아님). 주석 사유: 「다른 탭에서 주소 변경」 |

- 다시 열 때 실시간 소켓의 경우는 둘뿐이다.
  - (가) 끊기지 않았다: 놓친 변경이 없다.
  - (나) 끊겼다 다시 붙었다: 재연결 따라잡기가 1번 다시 받는다.
- 어느 경우든 친구요청·알림 배지의 「다시 열기 조회」는 중복이다.
- 실시간이 **막힌 상태**(감독 차단 `open`·채널 쉼)일 때만 다시 열기 조회가 유일한 따라잡기다.

### 4-2. 수정 (메신저 실시간 계약 개정 대상 — 개정 문구를 PR에 포함)

1. **친구요청·알림 배지**: 다시 열 때 실시간 감독 상태를 본다.
   - 상태 = `messengerRealtimeSupervisor.state()` + 그 채널의 마지막 상태.
   - 닫힘(`closed`)이고 그 채널이 SUBSCRIBED 상태면 다시 열기 조회를 하지 않는다. 재연결 따라잡기에 맡긴다.
   - 그 밖(차단·쉼·가입 전)이면 지금처럼 1번 조회한다.
2. **사장님 배지**
   - 재동기화 구독(`onMessengerRealtimeResynced`)을 추가한다.
   - 다시 열기 조회에도 1번과 같은 조건을 적용한다.
   - 화면 이동 때 강제 조회(메신저 경로 `serverHubBadgeBypass`)는 이번 범위 밖이다. 사장님 화면 계약이 따로 있다.
3. **주소 확인**
   - 마지막 결과가 「막힘(`needsBlock`)」일 때만 다시 열 때 재조회한다. 다른 탭·기기에서 주소를 넣고 돌아온 경우를 풀어 준다.
   - 이미 통과한 사용자는 주소 변경 이벤트·로그인 계정 변경·새로 켬 때만 다시 확인한다.
   - 이 화면의 「복귀 재확인」 주석과 `docs`의 해당 줄을 같은 PR에서 고친다.

### 4-3. 영향·깨질 수 있는 것·같은 단계 처리

- **영향받는 화면**
  - 하단 탭 배지, 상단 종 배지, 친구요청 팝업·메신저 홈 친구 탭, 사장님 배지, 주소 필수 막기 화면
  - 모두 위 4개 저장소를 구독하므로 화면 코드는 바뀌지 않는다.
- **깨질 수 있는 것**
  - 실시간이 「SUBSCRIBED로 보이지만 실제로 이벤트가 안 오는」 상태(11-09 소켓 전체 `channel_error` 같은 경우)면 배지가 다음 이벤트까지 늦는다.
  - 대응: 감독이 실패를 세면 상태가 `open`이 되어 1번 조건으로 다시 조회한다.
  - 그 밖에 SUBSCRIBED인데 이벤트가 끊긴 경우를 잡을 장치는 지금 없다. 실기 항목 T3에서 확인한다.
- **통화 영향**: 4개 모두 통화 경로가 아니다. 사장님 배지의 메신저 안 읽음은 통화와 무관하다(`messenger-notification-contract.ts:160`).
- **검증**
  - 단위 시험: 감독 `closed`+SUBSCRIBED → 미조회, `open` → 조회, 주소 통과 → 미조회, 막힘 → 조회.
  - 실기(Android·iPhone)
    - T1 앱을 백그라운드 → 다시 열기 10번: 친구요청·배지 요청 0.
    - T2 백그라운드 동안 다른 기기에서 알림 읽기 → 다시 열면 배지가 맞는지(재연결 따라잡기).
    - T3 비행기 모드 → 해제 → 배지가 맞는지.
    - T4 다른 기기에서 주소 등록 → 막힘 해제.
  - 실행 상한은 AGENTS 10회.

## 5. 결함 4 — 홈 telRING 최근 통화

### 5-1. 사실

- 호출: `components/home-hub/HomeTelringRecent.tsx`
  - `GET /api/community-messenger/calls` 첫 페이지를 받아 **앞 3건만** 쓴다(`:42`).
  - 다시 받는 때: 홈 진입(캐시), 다시 열기(10초 안이면 건너뜀, 1.5초 뒤), 통화 종료 1.5초 뒤.
- 서버: `listCommunityMessengerCallLogs`(`lib/community-messenger/service.ts:4852`)

**요청 1번당 Supabase 호출(11-26 Vercel `request_path` 전수 ÷ 요청 154)**

| 표 | 1회당 |
|---|---:|
| `user_social_relations` | 3 |
| `call_session_participants` | 2 |
| `call_logs` · `call_log_user_hides` · `call_sessions` · `participants` · `rooms` · `room_profiles` · `profiles` | 각 1 |
| `user_relationships` · `community_friend_favorites` · `community_friend_requests` · `community_messenger_friendships` | 각 1 |
| 합 | **약 16** |

- 관계 조회는 `hydrateProfiles` → `getViewerRelationSets`(`service.ts:2251`)에서 온다. 팔로우·차단·친구·즐겨찾기·숨김 친구를 모두 읽는다.
- **통화 기록 응답이 쓰는 관계 값은 `isFriend` 하나뿐이다.** `buildCallLogEntriesFromRows`(`:4702`)의 `peerRelationLabel`(`:4833`)만 쓴다.
  - `summarizeRoomsBatchWithProfileMap`·`loadSessionMapsForCallLogs`는 관계 값을 쓰지 않는다(코드 조회로 확인).

### 5-2. 수정 (**통화 변경 규정 대상** — `service.ts` 통화 함수)

- 통화 기록 목록의 프로필 채우기를 「프로필 + 친구 여부만」으로 바꾼다.
  - 친구 여부 = `fetchCommunityFriendAcceptedRowsForViewer` 1경로.
  - 차단·팔로우·즐겨찾기·숨김 조회(`user_relationships`·`user_social_relations`·`community_friend_favorites` 등)는 빼서 쓰지 않는 조회를 없앤다.
- 홈은 `?limit=3`을 보낸다. 서버는 3건만 읽고 그 3건의 방·세션·참여자만 채운다(행 수 감소, 호출 수는 같은 단계 수).
- **규정 절차**
  1. 통화 영향 분석서(같은 함수를 쓰는 통화 탭·홈 telRING, 통화 발신·수신·종료 경로와 무관함을 코드로 표시)
  2. Owner 승인
  3. 통화만 단독 PR
  4. 실기: 통화 탭·홈 목록 표시. 통화 행렬은 통화 경로 무변경 확인으로 갈음할지 Owner 결정.
- **감소량**: 구현 뒤 같은 `request_path` 실측으로 확정한다. 빠지는 관계 조회 표만 세면 1회당 최대 −6이다(위 표의 관계 표 합). 친구 여부 경로가 쓰는 표가 겹치는 만큼 줄어든다.

## 6. 순서·PR (도메인별 분리)

| 순서 | PR | 조건 |
|---|---|---|
| 1 | 결함 1 ①② (클라이언트 1회 표지 + 서버 옮기기) | 일반 — 구현 승인 후 |
| 1-DB | 결함 1 ③ 중복 3,146행 정리·고유 인덱스 | **운영 DB 변경 Owner 승인** · 백업 · 전후 대조 보고 |
| 2 | 결함 3 (메신저 실시간 계약 개정 포함) | 개정 승인 → 단독 PR → 실기 T1~T4 |
| 3 | 결함 4 | 통화 영향 분석서 → Owner 승인 → 통화 단독 PR |
| — | 결함 2 | §3-2 Owner 결정 뒤에만 |

## 7. 효과 (계산 — 근거는 위 실측 1회당 값)

- 다시 열기 1번당 감소: 결함 1(2.1) + 결함 3(1.1 + 1.5 + 1.1 + 1.5 = 5.2) = **약 7.3번**.
  - 결함 2를 승인하면 최대 3.0이 더 줄어든다.
- 1만 명 × 하루 16번 다시 열기 기준 **하루 약 117만 호출 감소**(결함 2 포함 시 약 165만).
- 결함 4: 홈을 열 때 1회당 16 → 10 이하(실측으로 확정).
- 화면 사용 중 호출(방·피드·메신저 홈)은 이 설계 범위 밖이다. 다시 열기 고정분만 줄인다.

## 8. Owner 결정 필요

1. 결함 2: 인트로를 다시 열 때 조회 간격 N분 도입(계약 변경) 또는 유지.
2. 결함 1 ③: 운영 중복 3,146행 삭제·고유 인덱스 추가 승인.
3. 결함 4: 통화 변경 규정 절차 진행 승인. 실기 통화 행렬을 「통화 경로 무변경」 확인으로 갈음할지.
