# 실시간 결함 2건 수정 설계 — 방 묶음 세대 번호 · 감독 밖 채널 4개 (2026-11-27 PHT)

지시: Owner 「결함 2건 수정 설계」(2026-11-27). 근거: iPhone 실기(`d1-ios-room-poll-loop-audit-2026-11-27.md` 후속, 11-27 01:40~01:53 PHT, iPhonebk·BK THE·운영 웹 `7b5a26a`)와 재현 시험.
이 문서는 **설계만** 한다. 코드·운영 변경 없음. 구현은 Owner 승인 뒤.

## 0. 내 잘못 먼저

- **결함 1의 60초 따라잡기 반복은 내가 #629(11-26 23:04 병합)에서 넣은 「끊김 시계」가 만든 것이다.** #629 설계·감사 때 「같은 방 목록 재바인드(건너뜀)」 경로를 확인하지 않았다.
- **결함 2는 #604 설계 누락이다.** 「비통화 채널 12개를 감독에 넣었다」고 보고했지만 실제 실시간 채널 중 4개(`cm-home-list`·`community-messenger-typing`·`community-messenger-room-bump`·`cm-room-friendship:<viewer>:<peer>`)는 감독 밖에 남았다. 목록을 코드 전수(`sb.channel(` 호출처)로 만들지 않았다.

## 1. 증거

| 항목 | 결과 | 근거 |
|---|---|---|
| 실기 기준선(가입 차단 없음) | 12개 채널 모두 가입 정상(`phx_reply ok`)인데 방 메시지 `after=` 가 **정확히 60초마다** 나감(53.6s·113.6s·173.6s…) | iPhonebk 웹 검사 기록 |
| 재현 시험 A | 채널 1개 정상 가입 + 같은 목록으로 `notifyRoomListenersChanged` 1번 더 → 180초 동안 `fallback` **3번** | `__tests__/zz-repro-bundle-gen-skip.test.ts`(임시) |
| 재현 시험 B | 같은 조건에서 새 메시지 DB 이벤트 → 건너뜀 전 방에 **1번 닿음**, 건너뜀 뒤 **0번** | 같은 파일 |
| 실기 가입 차단(352초, 통화 채널 제외) | 감독 채널 8개는 약 45초 뒤 재가입 멈춤. **4개 채널은 10초마다 끝없이 재가입**(5분 동안 각 30회, 분당 합계 24회) | 웹 검사 기록 |
| 같은 실기의 HTTP | 메시지 `after=` 60초 1번 · 방 다시 읽기 0번 → D1 HTTP 반복은 묶임 | 웹 검사 기록 |

## 2. 결함 1 — 방 묶음 재바인드 「건너뜀」이 세대 번호를 올림

### 원인 (코드)
`lib/community-messenger/realtime/global-messenger-room-bundle-channel.ts` `bindFilteredPostgresSubscriptions`:
```
const gen = ++postgresBindGeneration;      // ① 먼저 올린다
const topicGen = ++bundleTopicGeneration;
if (roomIdsKey === lastBoundRoomIdsKey && channels.length > 0) return;  // ② 그다음 「같은 목록이면 건너뜀」
```
- ②로 건너뛰어도 ①로 세대가 올라가, **살아 있는 채널이 옛 세대**가 된다. 그 결과:
  1. `onStatus` 의 `gen !== postgresBindGeneration` → `SUBSCRIBED` 무시 → `unhealthySince` 가 안 풀림 → **60초마다 `fallback`(메시지 `after=` GET) 영원히** — #629 에서 생김.
  2. `staleBind()` → **새 메시지·참여자(읽음)·방·통화 세션·통화 참여자 DB 이벤트 5종을 모두 버림** — 05-26(건너뜀)·08~09월(세대 검사)부터 있던 옛 결함. 방은 room-bump 방송·60초 따라잡기로만 따라갔다.
  3. `isCancelled()` 가 참 → 래퍼가 실패 뒤 다시 가입하지 않음(옛 결함, 실기 미측정 → NOT_PROVEN).
- 건너뜀이 생기는 때: `use-community-messenger-realtime.ts` 가 방 listener 를 **추가·제거할 때마다** `notifyRoomListenersChanged()`(80ms 디바운스). 같은 방 listener 가 둘이거나, 효과가 다시 돌아 제거→추가가 80ms 안에 끝나면 방 목록이 같아 건너뜀. iPhone 실기 기준선에서 실제로 일어났다.

### 수정
- 「같은 목록이면 건너뜀」 판정을 **세대 번호 증가보다 먼저** 한다. 건너뛸 때는 세대·토픽 세대·끊김 시계를 건드리지 않는다.
- 다른 변경 없음(채널 수·토픽 이름·폴백 상수·재동기화 그대로).

### 바뀌는 동작
| 경로 | 지금 | 수정 뒤 |
|---|---|---|
| 정상 가입 중 60초 `after=` | 건너뜀이 한 번이라도 있으면 영원히 | 없음(가입이 끊겼을 때만, #629 계약대로) |
| 열린 방 새 메시지 DB 이벤트 | 건너뜀 뒤 버림(room-bump 방송으로만 도착) | 다시 받음 |
| 읽음(참여자) 이벤트 | 건너뜀 뒤 버림 → 읽음 표시 늦음 | 다시 받음 |
| **열린 방 통화 세션·통화 참여자 이벤트** | 건너뜀 뒤 버림 → 방 안 통화 배너·통화 stub 갱신은 room-bump·Home call_log 경로로만 | **다시 받음 → `roomCallBundle` 예약(방 `onRefresh` 1번)** |

### 통화 영향 분석 (통화 변경 규정 §3)
- 바뀌는 파일·함수: `global-messenger-room-bundle-channel.ts` `bindFilteredPostgresSubscriptions` 1곳(판정 순서).
- 통화 경로 영향: **열린 1:1·그룹 방 화면의 통화 세션 이벤트 수신만** 복구된다. 발신 시작·세션 생성·VoIP/FCM 발송·iOS CallKit·Android 수신 화면·수신 초대 채널(`cm-call-invite`, 이 채널과 별개)·통화 상태 폴링·종료 신호는 **이 함수를 지나지 않는다**(코드 확인: 통화 세션 이벤트는 `roomCallBundle.schedule()` → 방 `onRefresh` 만 부른다).
- 회귀 위험: 이벤트가 다시 오므로 통화 중·종료 직후 열린 방의 `onRefresh`(메시지 `after=` + 필요 시 방 silent 다시 읽기)가 **원래 설계대로** 늘 수 있다. `roomCallBundle` 은 trailing 묶음이라 통화 1건당 방 `onRefresh` 1~2번.
- 설치된 구 바이너리 호환: 웹만 바뀐다(네이티브 무변경). 1.2.7·1.2.8 모두 앱 재시작 뒤 같은 코드.
- 롤백: PR 되돌리기(웹만). 환경 변수 `NEXT_PUBLIC_MESSENGER_RT_SUPERVISOR=0` 과 무관.
- 분리 반영: **결함 1 단독 PR**(통화 규정 §4 — 통화 이벤트 수신이 바뀌므로 다른 변경과 묶지 않는다).

## 3. 결함 2 — 감독 밖 실시간 채널 4개

### 원인
아래 4곳이 `sb.channel(...).subscribe()` 를 직접 부른다. 가입이 실패하면 Supabase 실시간 라이브러리 자체 재가입(최대 10초 간격, 끝없음)이 돈다 — 감독 차단기·대기·멈춤이 적용되지 않는다. D1(11-26 서버 가입 거절 `SocketJoinRateLimitReached`) 때 이 4개도 같은 소켓에서 재가입을 계속했다(당시 앱 감시 집계는 래퍼 채널만 세서 이 4개는 기록에 없었다).

| 채널 | 파일 | 여는 곳 |
|---|---|---|
| `cm-home-list:<uid>` | `realtime/home-list-room-insert-broadcast-client.ts` `subscribeHomeListRoomInsertBroadcast` | 레이아웃(로그인 내내) |
| `community-messenger-typing:<roomId>` | `realtime/typing/messenger-typing-topic-registry.ts` `createSubscribedChannel` | 방 화면 · 대화 목록 행(참조 계수) |
| `community-messenger-room-bump:<roomId>` | `realtime/room-bump-broadcast.ts` `subscribeCommunityMessengerRoomBumpBroadcast` | 방 화면(`use-messenger-room-bump-broadcast-subscription.ts`) |
| `cm-room-friendship:<viewer>:<peer>` | `room/use-messenger-room-friendship-sync.ts` | 1:1 방 화면 |

### 수정
- 4곳 모두 이미 감독에 들어간 채널(`use-global-friend-request-feed.ts`)과 같은 모양으로 `superviseMessengerChannel({ sb, name, scope, channelOptions, isCancelled, onStatus, build })` 로 바꾼다. 수신 처리(`on("broadcast"|"postgres_changes")`)는 `build` 안으로 그대로 옮긴다.
- 같은 토픽 이전 채널 제거 대기(`whenMessengerTopicFree`·타이핑 레지스트리 `forceRemoveTopic`)는 유지한다(X4 — 떠나는 인스턴스 재사용 방지).
- 재연결(두 번째 이후 `SUBSCRIBED`)은 D2 R2 계약대로 `noteMessengerRealtimeResubscribed()` 만 부른다. room-bump 의 「이전 채널 제거를 기다린 뒤 첫 SUBSCRIBED 때 `after=` 1회」는 그대로.
- 해제: `releaseMessengerChannel` → 감독 핸들 `stop()`.
- 통화 채널(`cm-call-invite`·통화 신호)은 건드리지 않는다.

### 바뀌는 동작
| 상황 | 지금 | 수정 뒤 |
|---|---|---|
| 정상 | 같음 | 같음(가입 1번) |
| 가입 실패 지속 | 4개가 10초마다 끝없이(분당 24회) | 다른 감독 채널과 같이: 60초 6번·5분 20번이면 차단 → 30→60→120→300초 대기 → 시험 1개 → 6번 연속이면 멈춤 |
| 오프라인 | 라이브러리 재가입 계속 | 감독 오프라인 일시정지(가입 0) → 온라인 때 300ms 간격 재가입 |
| 재연결 직후 | room-bump: 경우에 따라 `after=` | 재동기화 묶음 1번(R2) |

### 영향받는 화면·호출처
- 방 화면(메시지 수신 bump·타이핑·친구 관계 변경 반영), 대화 목록(타이핑 점), 홈 목록(새 방 추가 방송). 통화 화면 없음.
- 깨질 수 있는 것: ① 감독 차단 중에는 4개 채널도 멈춤 → 그 동안 bump·타이핑·새 방 방송이 안 옴(지금도 가입 실패 중엔 안 옴 — 차이 없음, 방은 #629 60초 따라잡기로 정합) ② 타이핑 레지스트리 참조 계수와 감독 핸들 수명 맞추기 — 레지스트리가 핸들을 1개만 갖게 한다 ③ 감독 시험 채널 선택(`pickProbe`)은 홈 meta 우선이라 영향 없음.
- 메신저 방 메시지 기본 계약(`docs/messenger-realtime-policy.md` 「Community 메신저 방 메시지」 — 서버 bump 발행·클라이언트 검증 병합): 수신 채널 가입 방식만 바뀌고 페이로드·검증·병합 경로는 그대로. 정책 문서 「실시간 연결 감독」 절의 감독 대상 목록에 4개를 추가한다.

## 4. 요청 영향(계산 — 실측은 반영 뒤)

| 항목 | 지금 | 수정 뒤 |
|---|---|---|
| 결함 1: 정상 연결 중 열린 방 `after=` | 건너뜀 발생 세션마다 분당 1회(방 묶음당) | 0 |
| 결함 1: 열린 방 이벤트 수신 | 버려짐 | 복구 — 이벤트당 방 `onRefresh` 묶음(원래 설계 비용) |
| 결함 2: 가입 실패 시 소켓 가입 | 분당 24회 끝없이(서버 가입 거절 유발 형태) | 감독 상한(차단 후 최대 300초 대기) |
| Supabase HTTP | 결함 2는 HTTP 없음(가입은 실시간 소켓) | 같음 |

- 결함 1의 줄어드는 양은 「건너뜀이 생긴 세션 수 × 화면 켜진 분」이라 운영 값은 **NOT_PROVEN** — 반영 전 Vercel `rooms/[roomId]/messages` GET 중 `after=` 비율로 측정할 수 없어(쿼리 문자열 미수집) 반영 전후 같은 시간대 라우트 요청 수로 비교한다.

## 5. 검증

### 코드
- 결함 1: 재현 시험 A·B 를 회귀 시험으로 정식화(건너뜀 뒤 180초 `fallback` 0 · 이벤트 1번 도달) + 기존 `open-room-bundle-*.test.ts` 전부.
- 결함 2: 채널 4개 각각 「실패 6번/60초 → 차단·대기」「오프라인 일시정지」「재연결 = R2 note 1번」「해제 = stop」 시험. 타이핑 레지스트리 참조 계수 시험 유지.
- `typecheck:build` · 관련 vitest · eslint · `verify:call-surface-cta-ssot`(영향 없음 확인).

### 실기 (운영 반영 뒤, 같은 방식 — iPhone Debug 웹 검사 · Android CDP)
| # | 항목 | 판정 기준 |
|---|---|---|
| V1 | 정상 연결 10분, 방 열어 둠 | 메시지 `after=` 0회(재연결 없을 때) |
| V2 | 방 listener 재등록(방 나갔다 들어오기 3번) 뒤 상대가 메시지 1통 | 실시간 도착, 60초 따라잡기 없음 |
| V3 | 가입 차단(통화 채널 제외) 10분 | 16개 채널 모두 감독 상한 안(분당 가입 ≤ 차단 전 6회, 이후 대기), HTTP `after=` 60초 1번 이하 |
| V4 | 차단 해제 | 감독 대기 끝난 뒤 16개 모두 재가입·재동기화 1묶음 |
| V5 (결함 1 통화) | Android↔iPhone 음성 1회: 열린 방에서 발신·수신·종료 | 방 통화 배너·통화 stub 정상, 종료 뒤 방 `onRefresh` ≤ 2회 |
| V6 (결함 1 통화) | 통화 규정 최소 행렬(음성·영상 발신·수신·거절·벨 중 취소·busy·무응답·종료 후 재발신) | 각 PASS, 시각·세션 운영 DB 대조 |

- 실기는 운영 Supabase 를 쓴다 — 앱 실행 상한 안에서(측정 묶음당 10회) 하고, 넘으면 먼저 허락받는다.

## 6. 반영 순서 · PR

| PR | 내용 | 병합 조건 |
|---|---|---|
| A | 결함 1(판정 순서 1곳) + 회귀 시험 | 통화 영향 — Owner 설계 승인 → 구현 → 독립 검토 → **Owner 「병합」** → 실기 V1·V2·V5·V6 |
| B | 결함 2(채널 4개 감독) + 시험 + 정책 문서 감독 목록 | 메신저 실시간 — Owner 「병합」 → 실기 V3·V4 |

- 두 PR 은 독립(파일 겹침 없음). A 를 먼저 한다(정상 연결 중에도 매분 HTTP·이벤트 유실이 있으므로).

## 7. NOT_PROVEN
- 결함 1 건너뜀이 운영에서 얼마나 자주 생기는지(세션 비율).
- 결함 1 ③(옛 세대 래퍼가 실패 뒤 재가입 안 함)의 실기 영향.
- D1 당시 이 4개 채널이 서버 가입 거절에 기여한 몫(당시 집계에 없음).
