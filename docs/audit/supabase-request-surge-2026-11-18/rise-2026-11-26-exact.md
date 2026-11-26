# 11-26 Supabase 요청 상승 — 원인 정밀 분해 (2026-11-27 01:20 PHT 조사)

## 0. 내 잘못 먼저

1. 직전 상승 보고는 **손실 계수기**(`cm_monitoring_rollup_hourly`, Vercel 대비 42~85%만 셈)와 추정치로 원인을 나눴다. 기기·경로별 전수 근거가 없었다 → 이 문서로 대체한다.
2. 이 세션(134c8606)의 11-26 실기 시험 = Samsung·Xiaomi 앱 실행 **13회**(허용 10+3). 기기 요청 증가분의 일부는 내 시험이다(§3-2).

## 1. 측정 근거 (전수)

| 출처 | 범위 | 비고 |
|---|---|---|
| Supabase `edge_logs` (query_logs) | Supabase 가 받은 HTTP 전수 | 서버(Vercel) 호출은 UA `node%` |
| Vercel `vercel.external_api_request.count` (호스트 supabase) | Vercel 함수가 Supabase 로 보낸 호출 전수, `origin_route` 별 | 기기(UA)로는 못 나눔(API 미지원) |
| Vercel `vercel.request.count` | 들어온 요청 전수, `route`·`client_user_agent`·`client_ip`·`request_path` 별 | 기기 구분 근거 |
| 운영 DB(읽기 전용) | 방 참여자·iOS 기기 | |
| `.claude/state/app-launch/*.count` | 작업 세션별 앱 실행 수 | 훅 기록 |

하루 = PHT 00:00~24:00. Owner 화면의 **83,712**(대시보드 Total Requests)는 집계 창·포함 서비스가 확인되지 않아 **NOT_PROVEN**. 같은 시각 edge 24시간(11-26 01:30→11-27 01:30)은 80,539.

## 2. 전체 증가량 (전수)

| | 11-25 | 11-26 | 증가 |
|---|---:|---:|---:|
| Supabase edge 전체 | 55,830 | 73,191 | **+17,361** |
| ├ 서버(Vercel 등, `node`) | 52,352 | 68,038 | +15,686 |
| ├ 저장소 `/storage` | 2,434 | 3,506 | +1,072 |
| ├ 인증 `/auth` | 1,895 | 2,482 | +587 |
| └ 실시간 `/realtime` | 949 | 638 | −311 |
| Vercel → Supabase 호출 | 51,564 | 65,102 | **+13,538** |
| (참고) 11-24 Vercel → Supabase | 40,874 | | |

**증가의 90%는 서버 경로(Vercel API)** 이다.

## 3. 증가 원인 — 출처별

요청 수는 Vercel 전수. Supabase 호출 = 요청 수 × 그 경로의 그날 평균 호출 수(경로 전체 Supabase ÷ 경로 전체 요청, 전수 값)로 **배분한 값**이다(기기별 Supabase 직접 계측은 Vercel API 가 지원하지 않음).

### 3-1. 【결함 D1】 iPhone 1대 메시지 목록 반복 조회 — 가장 큼

- 계정 **BK(631a4438)**, IP 27.49.10.28, UA iOS 18.7 앱.
- 방 `0bbd2940`(BK↔김선희2, 1:1): 11-26 **09:00~13:59 PHT** 시간당 메시지 목록 GET **190~330회** + 방 열기(bootstrap) **123~214회**. 14:00 에 멈춤.
- 11-26 하루 이 iPhone: 메시지 GET `0bbd2940` **1,135회** + `e6807e2f` 210회, iPhone UA 전체 메시지 GET 1,425 / 방 열기 985 (11-25: 313 / 521).
- Supabase 증가 배분: 메시지 +1,112회 × 3.88 + 방 열기 +464회 × 2.74 ≈ **+5,600** (11-26 이 iPhone 두 경로 합계 ≈ 8,200).
- 판정: **FAIL(결함)** — 사람이 한 화면에서 5시간 동안 분당 3~5회 목록을 다시 받는 동작은 정상 사용이 아니다. 같은 방에서 방 열기도 같이 반복 → 방 재진입·재동기화 반복 루프.
- 원인 코드: **확인 — `d1-ios-room-poll-loop-audit-2026-11-27.md`** (11-26 실시간 가입 거절 → 실패마다 HTTP 재조회, 앱 1.2.7 (62), 13:47 에 64 로 바뀌며 멈춤. #604·#629 로 운영 반영, iPhone 실기 NOT_PROVEN). 이 줄의 처음 판정 「NOT_PROVEN」은 내 기존 감사(`realtime-ios-retry-loop-2026-11-26.md`)와 연결하지 않은 잘못이었다.

### 3-2. 작업자 실기 시험 — Samsung·Xiaomi 시험 기기

| | 11-25 | 11-26 |
|---|---:|---:|
| Samsung SM-M156S(RFCY40PY2CA) `/api` 요청 | 1,467 | **4,926** |
| Xiaomi 24076RP19G(8b37179f7d94) `/api` 요청 | 512 | **2,203** |
| 앱 첫 화면 시작(`/api/app/startup-config`) Samsung / Xiaomi | 7 / 2 | **68 / 26** |

- 11-26 세션별 앱 실행(훅 기록): fdb26da7 **51회**(OS 화면 지연 감사, Owner 허용 41), ea90ad80 **19회**(광고 포스터, 허용 10), **134c8606 13회(이 세션, 메신저 실시간 실기)**, 946c787a 5회(고객센터), 0cbeb8db 1회.
- 두 기기 메신저 경로만 배분해도 11-26 ≈ Samsung 7,000 + Xiaomi 3,300 = **약 10,300** (방 열기·통화 상태·메시지·접속 상태·친구요청·홈 목록·통화 기록).
- 판정: 결함 아님 — **작업자 시험 부하**. 다만 Samsung 1대 하루 시작 68회는 「같은 측정 묶음 10회」 상한을 세션 합계로 크게 넘었다(각 세션은 허용 받음).

### 3-3. 【결함 D2】 홈 telRING 최근 통화(#612, 11-26 19:08 병합) — 요청당 비용 초과

- 새 호출 `GET /api/community-messenger/calls`: 11-25 0 → 11-26 **87요청 · Supabase 1,379** = **요청당 15.9**.
- 같은 PR 이 예산 `request-budget.ts` 에 **12.0** 으로 등록 → **예산 초과 FAIL**.
- 홈이 열릴 때·화면 복귀(visibilitychange) 때 부른다(`HomeTelringRecent.tsx`). 최근 3건만 쓰지만 통화 기록 첫 페이지 전체를 만든다.

### 3-4. 【결함 D3】 어드민 대시보드 개요 — 요청당 82회

- `GET /api/admin/dashboard/overview`: 11-26 **12요청 · Supabase 981** = **요청당 81.8** (11-25: 1요청).
- 예산 등록 없음. 호출자 = Mac Chrome 1대(어드민).

### 3-5. 【결함 D4】 방 통화 기록 `rooms/[roomId]/calls` — 요청당 44.8회

- 11-26 31요청 · Supabase 1,389 (11-25 1,687). 증가 원인은 아니지만 요청당 비용이 가장 높다. 예산 등록 없음.

### 3-6. 자동화 브라우저(HeadlessChrome 153, AWS us-west-1 IP 54.183.149.156 · 13.57.148.235)

- 11-26 앱 전체 로드 **72회**(11-25 32회), `/api` 1,355요청(11-25 566), 전체 요청 12,280(정적 파일 포함).
- 이 Mac 에는 headless 프로세스 없음. 출처(어느 세션·서비스) **NOT_PROVEN**. AGENTS 상한(운영 사이트 자동화 열기 = 1회로 셈) 대상.

### 3-7. 광고 화면 시험 — `/api/me/points`

- 11-25 0 → 11-26 Supabase 909. 호출자 iPhone·Samsung·Xiaomi(시험 기기). 같은 날 광고 PR 다수 병합(17:18~23:11). 요청당 비용 **NOT_PROVEN**(요청 총수 미조회).

### 3-8. 줄어든 것

- 주문 크론 2개(수락 시한·수락 알림) 2,960 → 927, 통합 분당 크론 +1,031 → 순 **−1,002**.
- 통화 상태 `calls/sessions/[id]` 4,756 → 4,095, 방 영상 810 → 175 미만, 방 정보 807 → 371.

## 4. 경로별 증가 (Vercel → Supabase, 전수)

| 경로 | 11-25 | 11-26 | 증가 | 주 원인 |
|---|---:|---:|---:|---|
| rooms/[roomId]/messages | 3,300 | 6,408 | +3,108 | D1 iPhone |
| rooms/[roomId]/bootstrap | 1,642 | 4,626 | +2,984 | D1 iPhone · 시험 기기 |
| community-messenger/calls | 0 | 1,379 | +1,379 | D2 #612 |
| admin/dashboard/overview | <140 | 981 | ≥+841 | D3 |
| me/points | <140 | 909 | ≥+769 | 광고 시험 |
| community-messenger/bootstrap | 1,160 | 2,043 | +883 | 시험 기기 |
| me/profile | 457 | 963 | +506 | 앱 시작 증가 |
| post/[id] | 232 | 727 | +495 | NOT_PROVEN |
| platform-popup/resolve | 636 | 1,053 | +417 | 앱 시작 증가 |
| stores/home-feed | 890 | 1,297 | +407 | NOT_PROVEN |
| me/settings | 305 | 712 | +407 | 앱 시작 증가 |
| philife/neighborhood-feed | 1,348 | 1,748 | +400 | 자동화 브라우저 포함 |
| philife/posts | 591 | 964 | +373 | NOT_PROVEN |
| me/mypage-summary | 265 | 612 | +347 | NOT_PROVEN |
| 주문 크론 3종 | 2,960 | 1,958 | −1,002 | #597 |

## 5. 결론

11-26 증가 +17,361(edge) 의 출처:
1. **iPhone 1대 반복 조회 결함(D1)** ≈ +5,600 — 단일 최대.
2. **작업자 실기 시험**(Samsung·Xiaomi 4개 세션, 앱 시작 94회) — 두 기기 메신저 경로만 ≈ 10,300(11-26 총량, 11-25 대비 증가분 상당 부분).
3. **신규 홈 telRING(D2)** +1,379, **어드민 개요(D3)** ≈ +900, **광고 화면 시험** ≈ +800, **자동화 브라우저** 증가.
4. 일반 사용자 기기(SM-S928N·SM-F741N 등) `/api` 요청은 11-25 대비 **줄었다** → 실사용자 증가가 원인이 아니다.

## 6. NOT_PROVEN

- 대시보드 83,712 구성.
- D1 원인 코드·당시 빌드.
- HeadlessChrome 출처.
- 기기별 Supabase 호출 직접 계측(경로 평균 배분 값만 있음).
- `/api/me/points`·`post/[id]`·`stores/home-feed` 증가 호출자.
