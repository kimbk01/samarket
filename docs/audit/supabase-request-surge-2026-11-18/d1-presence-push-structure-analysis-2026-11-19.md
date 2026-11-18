# D1 — 접속 상태·푸시 억제 구조 영향 분석 (2026-11-19)

- Owner 지시: 「D1 분석서 작성」(구조 결함 D1 — `structural-defects-vs-legacy-2026-11-19.md`)
- 상태: **분석 · 설계 · Owner 승인 요청.** 코드 변경 0건.
- 증거: CODE(file:line, origin/main) · PROD(운영 DB 읽기 전용 · Vercel 지표) · NOT_PROVEN
- 형식: 통화 변경 규정 3번(바꾸는 파일·동작·영향 경로·구 바이너리 호환·회귀 위험·롤백·실기 항목)을 따른다. 통화 코드는 바꾸지 않지만 푸시 파이프라인을 공유하므로 같은 수준으로 분석한다.

---

## 0. 작업자 잘못 (먼저 보고)

- **F1(#483)을 부분 정지로 구현해 병합했다(16:57Z).** presence 는 아래 §1 의 네 부분이 한 묶음인데, 유휴 기기의 HTTP 하트비트와 Realtime track 만 멈췄다. 그 결과 채널 「정상」 판정(18초 신호)이 끊기면 상대 화면이 12초 GET 폴링으로 넘어가 절감이 사라지고, 유휴 상대가 오프라인으로 보일 수 있다.
- **#484 로 되돌림 PR 을 올렸다**(메신저 규칙상 병합은 Owner 지시 대기).
- #483 PR 과 F1 문서의 「상대 화면은 계속 온라인」은 틀린 서술이었다. F1 문서 §7 에 정정했다.

---

## 1. 지금 구조 — 네 부분이 한 묶음 (CODE)

| # | 부분 | 하는 일 | 위치 |
|---|---|---|---|
| P1 | **HTTP 하트비트 12초** | `presence_snapshots` upsert(`last_ping_at`·`app_visibility`·`active_room_id`) | `use-community-messenger-presence-runtime.ts:29,325` → `service.ts:13666-13723` |
| P2 | **Realtime 전역 채널 1개** `community-messenger:presence` | 12초마다 `track`. 상대 표시의 권위(채널이 정상일 때) | `:350` · 권한 `20270425120000…sql:88`(로그인 회원 누구나 join) |
| P3 | **채널 정상 판정** | presence `sync` 신호가 18초 없으면 비정상 → 상대 id 를 12초 GET 폴링(DB) + 30초 신선도 강등 | `community-messenger-realtime-health.ts:113-117` · `presence-snapshot-poll-scheduler.ts:122-170` · `use-community-messenger-peer-presence.ts:89-95` |
| P4 | **서버 푸시 판정** | 수신자 행을 읽어 15초 이내 + 같은 방 앞화면이면 푸시·소리·배지 억제 + **자동 읽음**. 앞화면이면 OS 푸시 게이트(`policy_profile_foreground_only`) | `notify-message-pipeline.ts:252,276,286-300,361,379,408-413` · `notification-event-dispatcher.ts:54-61` · `notification-presence-policy.ts` |

그 밖의 DB 행 독자: 상대 상태 GET·방 부트스트랩 `peerPresence`(`service.ts:2046-2082`, `:15996`), **그룹 온라인 수**(`group-room-online-authority.ts:96-125` — Realtime 을 쓰지 않는 서버 집계).

---

## 2. 결함 (구조)

| # | 결함 | 증거 | 회원 증가 시 |
|---|---|---|---|
| E1 | 앱이 열려 있는 동안 12초 DB 쓰기 | PROD presence 11,394건/일, 9시간 무활동 사례 | 기기 × 시간 |
| E2 | **전역 presence 채널 — 모든 접속자가 모든 접속자의 상태를 받음** | CODE `:350` 고정 이름, sync 마다 전체 `presenceState()` 재계산(`:335-339`) | 동시 접속 N 이면 메시지 약 **N²/12 건/초**(산술: N=1,000 → 약 8.3만/초, N=10,000 → 약 830만/초). Supabase Realtime 채널 한도를 넘을 가능성이 높다(정확한 한도 UNVERIFIED) |
| E3 | 채널 정상 판정이 presence 신호에 묶임 | P3 | 조용한 시간에 GET 폴링으로 전환 |
| E4 | 서버가 메시지마다 수신자 presence 를 DB 에서 읽고 추측으로 억제·자동 읽음 | P4 | 메시지 × 수신자 (그룹 크기에 비례) |
| E5 | **개인정보**: 로그인 회원 누구나 전역 채널에 들어가 전체 접속자 id 를 볼 수 있다(차단·친구 관계 필터 없음) | 권한 SQL `:88` | — (범위 밖 결함, 보고) |

---

## 3. 이미 앱에 있는 것 — 「앱이 판단」이 대부분 설치돼 있다 (CODE)

| 기기 | 앞화면일 때 채팅 푸시 | 위치 | 설치본 포함 |
|---|---|---|---|
| Android | **트레이 알림을 띄우지 않음**(채팅·그룹·거래·주문·댓글, 방 구분 없이 앱 전체) | `DibayFirebaseMessagingService.java:104-109` · `FcmPayloadResolver.java:234-240` · FCM 은 data 전용(`fcm-sender-impl.ts:241-247`) | 2026-06-15 커밋 `aaa7856eb` 부터 → 운영 Android 1.2.7 (54)·(79) 포함 |
| iOS | **배너·소리 없음**(`PushNotifications.presentationOptions` 미설정 → `[]`) | `capacitor.config.ts`(설정 없음) · Capacitor `PushNotificationsHandler.willPresent` | 설정을 넣은 이력이 없음 → 설치본 전부로 판단(UNVERIFIED) |
| 웹(브라우저·PWA) | **항상 OS 알림 표시**(창이 보이는지·어느 방인지 확인 안 함) | `public/sw.js:89-103` | — |
| 앱 안 배너 | Realtime 안 읽음 변화로 표시, **지금 보는 방은 제외** | `cm-participant-unread-full-effects.ts:53-75` | 웹 코드 |

→ 네이티브는 서버 억제가 없어도 앞화면 중복 알림이 나지 않는다. 서버 억제가 실제로 막는 것은 **웹 OS 알림**과 **자동 읽음** 두 가지다.

운영 설치 바이너리(최근 14일, PROD `user_devices`): Android 1.2.7 (54) 14대 · (79) 2대 · 1.2.6 (39) 1대 / iOS 1.2 (22) ~ 1.2.5 (56) 9개 버전 35대. **네이티브를 바꾸면 이 구 바이너리들은 반영되지 않는다** → 아래 설계는 **웹·서버만** 바꾼다.

---

## 4. 목표 구조 (레거시 원칙 L1·L2)

| 목표 | 지금 | 바뀐 뒤 |
|---|---|---|
| T1 푸시 판단 | 서버가 DB 신선도로 추측 | **서버는 항상 보냄**(음소거·차단·알림 설정만 적용). 표시는 기기가 판단: 네이티브는 이미 함, 웹은 서비스워커가 보이는 창의 방을 확인 |
| T2 자동 읽음 | 서버가 presence 로 추측 | **방을 보고 있는 클라이언트가 읽음 처리**(새 메시지를 화면에 그릴 때 mark_read) |
| T3 상대 접속 표시 | 전역 채널 + 12초 track | **방 단위**: 이미 열려 있는 방 채널의 presence 로 1:1 상대·그룹 온라인 수 표시. 전역 채널 폐지 → 메시지 수 O(방 인원) |
| T4 마지막 접속 | 12초 `last_ping_at` | **전환 때만 DB 1회 쓰기**: 앱 앞화면 진입 · 백그라운드 전환 · 세션 종료(이미 있는 `sessionEnd`·background POST). 비정상 종료는 앞화면 진입 시각 + 서버가 Realtime 연결 종료를 모르는 한계 → §6 결정 |
| T5 채널 정상 판정 | presence sync 신호 18초 | presence 채널은 **SUBSCRIBED 상태만**으로 판정(사건 기반 채널과 같은 규칙, health 파일 `:103-112` 의 기존 예외 규칙 재사용) |
| T6 HTTP 하트비트 | 12초 | **없음** |

---

## 5. 단계 · 바뀌는 파일 · 영향 경로

### 단계 1 — 서버 푸시 추측 제거 (T1·T2) · 웹·서버만 · 구 바이너리 그대로 동작

| 파일 | 변경 |
|---|---|
| `lib/notifications/pipeline/notify-message-pipeline.ts` | presence 읽기·판정 제거, `appState` 는 `background` 고정, 자동 읽음(`:408-413`)·`autoReadRecipientIds` 제거. `unread` 는 항상 true |
| `app/api/community-messenger/rooms/[roomId]/messages/route.ts:463-468` | 지연 자동 읽음 블록 제거 |
| `lib/notifications/engine/notification-engine-policy.ts:54-59` | 섀도 presence 읽기 제거(수신자당 DB 1회 절감, 동작 영향 없음) |
| `lib/notifications/policy/notification-presence-policy.ts` | 호출처 0 → 삭제 |
| `public/sw.js` 메시지 분기 | `clients.matchAll` 로 **보이는(visible) 창이 같은 방 URL** 이면 `showNotification` 생략(통화 분기 `:49-88,105-127` 는 손대지 않음) |
| 열린 방 클라이언트(메신저 방 phase2) | 새 메시지를 화면에 그릴 때 읽음 처리가 실제로 나가는지 확인 — 없으면 추가(현재 동작 **UNVERIFIED**, 구현 첫 작업으로 확인) |

영향 경로:
| 경로 | 영향 |
|---|---|
| 메신저 1:1·그룹·거래·주문 채팅 푸시 | 같은 방을 보고 있어도 서버가 보냄 → Android·iOS 앱은 앞화면이라 표시 안 함(지금과 같음). 웹은 sw 가 같은 방이면 생략 |
| 다른 방 메시지(앞화면) | 지금: `policy_profile_foreground_only` 로 OS 푸시 안 감 → 바뀐 뒤: 서버가 보냄 → **네이티브는 앞화면이라 그대로 표시 안 함**, 앱 안 배너는 지금처럼 Realtime 으로 표시. 결과적으로 사용자 화면 동일 |
| 배지 | 보고 있는 방 메시지가 잠깐 `unread=true` → 클라이언트 읽음 처리 후 0. iOS `aps.badge` 가 잠깐 +1 될 수 있음(UNVERIFIED, 실기 확인 항목) |
| 통화(수신·취소·종료·다른 기기 응답·부재중) | **영향 없음** — presence 참조 0건(`lib/push/**`·통화 발송 함수 전부 확인). 부재중은 원래 `background` 기본값 |
| cron 푸시 인계 | 원래 `background` 고정 — 영향 없음 |

### 단계 2 — 접속 표시 구조 교체 (T3~T6) · 웹·서버(+DB 함수 확인)

| 파일 | 변경 |
|---|---|
| `use-community-messenger-presence-runtime.ts` | 전역 채널·12초 하트비트·12초 track 제거. 전환 POST(앞화면 진입·백그라운드·종료)만 |
| 방 채널(메신저 방 Realtime 구독) | 방 채널에 presence track/sync 추가 → 1:1 머리글·그룹 온라인 수 |
| `use-community-messenger-peer-presence.ts` · `presence-snapshot-poll-scheduler.ts` | 방 밖(친구 목록·채팅 목록 점)의 표시 원천 결정(§6) · 12초 폴링 제거 |
| `presence-policy.ts` `derivePresenceFromDbRow` · `service.ts:2046` · `group-room-online-authority.ts` | DB 는 「마지막 접속」만. 온라인 판정은 Realtime(방) |
| `community-messenger-realtime-health.ts` | presence 채널 SUBSCRIBED 판정 |
| Realtime 권한 SQL | 전역 presence topic 권한 제거(E5 해소) — **운영 DB 적용 승인 필요** |

---

## 6. Owner 결정 필요

1. **방 밖 「온라인 점」(친구 목록·채팅 목록)을 유지할지.**
   - 레거시: 카카오톡은 접속 표시 자체가 없다. 텔레그램은 연락처의 마지막 접속을 보여 준다(공개 동작 기준).
   - 권장: 방 밖은 「마지막 접속」만(목록을 열 때 DB 1회 묶음 조회, 캐시). 방 안(1:1 머리글·그룹 인원)은 실시간 온라인.
   - 유지하려면 사용자별 토픽 구독(보이는 상대만)이 필요하다 — 구독 수가 화면 상대 수만큼 늘어 설계가 커진다.
2. **비정상 종료 시 「마지막 접속」 정확도.** 전환 쓰기만 하면 강제 종료·네트워크 끊김 때 마지막 접속이 앞화면 진입 시각으로 남는다. 권장: 허용(레거시도 연결 종료 시각 기준, 실제로는 수 분 오차 흔함). 또는 Realtime 연결 종료를 서버가 받는 방법 추가 설계.
3. 단계 1 의 경계: **같은 방을 보는 중 서버 자동 읽음 → 클라이언트 읽음**으로 바뀐다(네트워크가 끊긴 채 방을 보고 있으면 읽음이 늦게 반영).

---

## 7. 회귀 위험 · 롤백

| 위험 | 대응 |
|---|---|
| 웹 탭에서 같은 방 알림 중복 | sw.js 수정을 단계 1 에 함께. 실기 확인 |
| 열린 방 읽음 누락 → 배지 남음 | 구현 첫 작업으로 현재 동작 확인, 없으면 추가 + 계약 테스트 |
| iOS 앞화면 배지 일시 증가 | 실기 측정, 필요 시 `aps.badge` 계산에서 「방금 보낸 방」 제외는 하지 않음(추측 금지) — 측정 후 결정 |
| 단계 2 그룹 온라인 수·머리글 깜빡임 | 방 채널 sync 도착 전 「—」 표시(오표시 금지), 계약 테스트 |
| 롤백 | 단계별 단독 PR → `git revert` 1회. DB 권한 SQL 은 이전 정의 보관 후 적용 |

## 8. 실기 검증 항목 (단계별, 10회 상한 안 — 초과 시 사전 승인)

단계 1: Android 1.2.7 (54/79) · iPhone 1.2.4/1.2.5 · 웹 데스크톱
- ① 같은 방 보는 중 상대 메시지 → OS 알림 없음 · 읽음 즉시 · 배지 0 유지
- ② 다른 방 보는 중 메시지 → 앱 안 배너 표시(지금과 같음)
- ③ 앱 백그라운드 → OS 알림 · 소리 · 배지 정상
- ④ 웹 같은 방 탭 → OS 알림 없음 / 다른 탭·최소화 → 알림
- ⑤ 통화 회귀 확인(규정 행렬 일부): 수신·벨 중 취소·부재중 각 1회
- 운영: 메시지 1건당 presence 읽기 0 확인(edge 로그 `presence_snapshots` GET)

단계 2: 1:1 머리글 온라인/마지막 접속 전환 시각 · 그룹 온라인 수 · 앱 종료 후 마지막 접속 · presence 요청 수 전후(11-18 기준 11,394건/일 → 전환 쓰기만).

## 9. 예상 효과 (산술 · NOT_PROVEN)
- 단계 1: 메시지 1건 × 수신자 1명당 presence DB 읽기 1~2회 제거 + 엔진 섀도 읽기 제거.
- 단계 2: presence POST 12초 → 세션당 약 3회. Realtime 메시지 O(N²) → O(방 인원). 회원 1만 명에서 E1·E2 제거.
