# 앱 실행·알림 탭 진입 OS 화면(시작 덮개) 지연 — 전 구간 감사 (2026-11-26 PHT · 보고만 · 코드·설정 변경 0)

- 지시: Owner 「앱실행후 os 화면이 … 또 많이 늦어지는 부분 … 결함인지 터진 부분인지 네트워크인지 … 특히 fcm 알림 선택 시 …」
  + 2차 「하나만 보지 말고 정확히 끝까지 확인해서 발생 결함 부분을 정확히 감사」.
- 조건:
  - 운영 웹 `4933b87`(`dpl_2AYo5tTtTAva4b5kEe6s4XVMXb1K`)
  - Samsung SM-M156S 1.2.7 (85) 디버그 · Xiaomi 24076RP19G 1.2.7 (80) 디버그
  - 둘 다 로그인 · Wi-Fi
- 실행 방식:
  - 알림 진입 = HOME → `am kill` → 알림 탭과 같은 의도(`VIEW` + `url=/community-messenger/rooms/1de13b3e…` + `type=chat_message`). 실제 FCM 알림 탭은 아니다.
  - 아이콘 = 런처 의도.
- **실행 횟수 7회**(12:50~13:11 PHT · Samsung 5 · Xiaomi 2) · 예상 운영 Supabase 요청 약 1,365건(7 × 195)
- 증거(저장소 밖): `/private/tmp/claude-501/-Users-bkkim--claude-spares-spare-NB5lUW/fdb26da7-61d7-4c0f-bcde-37fde8d9394c/scratchpad/osm/`
  - logcat
  - WebView 디버깅(resource timing·콘솔·네이티브 호출 기록)
  - 화면 녹화 2개(`osm_icon2.mp4`·`osm_push3.mp4`) + 5fps 프레임 표(`icon2_sheet.png`·`push3_sheet.png`)
  - Vercel 운영 로그·관측 지표(7~21일)
  - 운영 DB 읽기 전용(`pg_stat_statements`·`app_entry_failures`)

## 0. 답 (Owner 질문 3개)

| 질문 | 판정 |
|---|---|
| 결함인가 | **예 — 확인된 결함 4건(D1~D4) + 구조 병목 4건(S1~S4).** 표 §2 |
| 터진 것인가 | **아니다.** 7회 모두 정상 해제 · 오류 화면·청크 실패·8초 상한 0 · 운영 실패 표(`app_entry_failures`) 증가 없음 |
| 네트워크인가 | **기기 네트워크는 아니다**(문서 첫 바이트 36~65ms). **서버는 회귀 없음**(21일 추세 같음). 다만 ① 배포마다 JS 전부 다시 받기(D1) ② 시작 순간 몰린 요청이 서버 CPU 제한에 걸려 가끔 1초(S3) — 이 둘이 「네트워크처럼 보이는」 지연이다 |

## 1. 전 구간 실측 — 알림 탭 → 채팅방 (Samsung 2회차 · JS 캐시 적중 = 가장 좋은 경우 · 문서 시작 = 덮개 표시 기준 ms)

| # | 구간 | 시각 | 걸린 시간 | 판정 |
|---|---|---|---|---|
| ① | 알림 탭 → 앱 시작·WebView 엔진 적재 → 덮개 표시 | 탭 −1,180 → 0 | 1.18초(Xiaomi 1.30~1.75) | 정상(OS·WebView 비용 · 11-18 과 같음) |
| ② | 홈 문서 `/` 요청 → 본문 끝 | 339 → 1,607 | 1.27초(Xiaomi 0.41~0.46) | **S1 구조** — 알림인데 홈을 서버에서 그린다 |
| ③ | JS 실행·hydration → 알림 경로 받음 | 1,607 → 2,509 | 0.90초 | **S2** — 네이티브가 2,202에 경로를 줬지만 JS 주 스레드가 hydration 중이라 2,492에 받음(Xiaomi 840~940ms 대기) |
| ④ | 로그인 확인 대기(`auth_resolution_hold`) → 이동 | 2,509 → 2,575 | 0.07초(Xiaomi 0.09~0.33) | 정상 |
| ⑤ | 채팅방 RSC + 채팅방 JS 4단 물결 | 2,574 → 3,178 | 0.60초 | **D2 일부** |
| ⑥ | 로그인 경계 `/api/auth/session` | 3,087 → 3,416 | 0.33초 | **S4 구조**(직렬) |
| ⑦ | 경계 풀림 → 마지막 JS 물결 → 채팅방 데이터 요청 시작 | 3,416 → 3,639 | 0.22초(Xiaomi 0.64) | **D2** — 데이터 요청이 ⑤⑥⑦ 다 끝난 뒤에야 나간다 |
| ⑧ | 채팅방 데이터 `rooms/{id}/bootstrap?mode=instant` | 3,639 → 4,884 | **1.25초**(Xiaomi 0.21~0.27) | **S3** — 서버 함수 자체는 114ms, 인스턴스 안 대기 약 1.0초 |
| ⑨ | 그리기 → 화면 준비 → 덮개 걷힘 | 4,884 → 5,298 | 0.41초 | 정상(걷힘 자체는 신호 뒤 약 0.1초) |
| | **합계 (탭 → 덮개 걷힘)** | | **6.46초**(같은 기기 1회차 7.86 · Xiaomi 7.38~8.07) | |

- 녹화(Samsung 3회차 `push3_sheet.png`): 덮개 → 완성된 채팅방. 흰·자리 표시 프레임 0. 덮개 표시 4.54초 · 탭→걷힘 5.81초.
- 11-18 §24-12 실제 알림 탭 덮개 시간: Samsung 4.4~5.8초 · Xiaomi 5.0~5.9초. 오늘: Samsung 4.5~6.7초 · Xiaomi 6.1~6.3초.
  - 비슷하거나 약간 길다. 회차가 적어 「코드 회귀로 늘었다」고 판정하지 않는다(NOT_PROVEN).
  - 배포 직후 첫 실행은 D1 만큼 더 길다.

## 2. 결함·병목 전체 표

### 확인된 결함 (FAIL)

| # | 결함 | 증거 | 영향 |
|---|---|---|---|
| **D1** | **Vercel Skew Protection 재켜짐 → 배포마다 JS 주소 100% 바뀜 → 기기 캐시 전부 무효** | ① 자산 주소 전부 `?dpl=<배포ID>`(실행당 158~167개). ② 직전 배포 대비 홈 첫 JS 63개 중 55개는 파일 이름(내용)이 같은데 주소만 다르다. ③ 11-09 이 원인을 확정하고 **끔**(통제 실험 8.1초 vs 2.1초) → **11-18 10:09 PHT 다시 켬**(§24-13 「B」). ④ 하드락 `docs/dibay-app-entry-resume-hard-lock.md` H3-1 은 지금도 「꺼짐 유지·`?dpl` 금지」 — 설정과 충돌. ⑤ 최근 약 34시간 운영 배포 21건 | 배포 직후 첫 실행마다 JS 약 3MB 다시 받기·다시 해석. 아이콘·알림 두 경로 모두(첫 문서가 홈). 오늘 같은 기기 「배포 직후 vs 두 번째」 대조는 배포를 일으키지 않아 못 함 — 크기는 11-09 실측 근거만 |
| **D2** | **알림 진입은 채팅방 미리 받기를 하지 않는다(누락)** | ① 채팅 목록에서 방에 들어갈 때는 `prefetchCommunityMessengerRoomSnapshot`·`warmCommunityMessengerRoomRouteChunks` 로 미리 받는다. `components/push/PushRouteListener.tsx` 에는 둘 다 호출이 없다(코드). ② 그래서 채팅방 데이터 요청은 `CommunityMessengerRoomBootstrapGate` 의 effect(마운트 뒤)에서야 나간다. 그 앞에 RSC → JS 4단 물결 → 로그인 경계 → 마운트가 줄줄이 선다 | 알림 경로 결정 → 데이터 요청 시작: Samsung 1.13초(2,509→3,639) · Xiaomi 1.58초(3,803→5,384). 이 구간 동안 서버는 데이터를 만들 수 있었다 |
| **D3** | **아이콘 실행에서 직전 화면(채팅방)을 복원할 때 덮개가 먼저 걷혀 흰 화면 → 「채팅방 입장 중…」이 보인다** | ① 녹화 `icon2_sheet.png`(Samsung 13:10): 덮개 → **흰 화면 3프레임(약 0.6초)** → **「채팅방 입장 중…」 스피너 4프레임(약 0.8초)** → 채팅방. ② 같은 조건 디버깅(13:09): 해제 2,442ms · 로그인 경계 2,431~2,737 · 채팅방 데이터 3,023~3,225 · 채팅방 그림 3,472 → 덮개가 채팅방보다 **1.0초 먼저** 걷힘. ③ 코드 `lib/startup/startup-metrics.ts:511-524`: 「목적지가 자리 표시면 해제하지 않음」(23-9)은 `isLaunchPushHoldActive()`(알림 목적지)일 때만 적용된다. 생명주기 복원 이동(`mayReleaseForLifecycleNav`)은 경로만 맞으면 해제한다 | 덮개를 만든 목적(흰 화면 0)이 복원 실행에서 깨진다. 11-18 측정은 아이콘 실행이 홈으로 가는 경우만 쟀다. 그래서 이 경로는 그때 확인하지 않았다 — 작업자(감사) 누락 |
| **D4** | **화면 이동마다 앱 아이콘·파비콘 요청 18~28회 중복** | ① 덮개 아래 채팅방 이동 순간 `/favicon.ico?v=…`·`/favicon.ico?favicon.0b3bf435.ico`·`/images/brand/dibay-app-icon.png?v=…` 가 각 6~9회. ② 아이콘 선언이 두 군데다: 파일 규칙 `app/favicon.ico`·`app/icon.png`·`app/apple-icon.png` + `app/layout.tsx` `metadata.icons`(47행). 그래서 주소가 3개다. 한 이동에 몇 번씩 다시 요청하는 정확한 이유는 특정 못 함(NOT_PROVEN) | 개당 300B(304)라 크기는 작다. 그러나 채팅방 JS 물결과 같은 순간에 연결을 쓴다(Xiaomi 저장공간 부족 실행에서는 아이콘 55KB 를 다시 받음) |

### 구조 병목 (결함은 아님 · 설계·인프라 · 수정은 결정 필요)

| # | 병목 | 증거 | 비고 |
|---|---|---|---|
| **S1** | 알림 진입도 첫 문서가 홈 `/` → 홈 서버 렌더가 덮개 아래에서 돈다 | 기기 문서 본문 0.41~1.27초. 서버 홈 함수 CPU p95 1.45초/요청(7일)·실행 시간 p95 2.2~2.5초. 21일 추세 같음(회귀 아님) | 11-18 D1(첫 문서를 목적지로) — 생명주기 SSOT(정책 A)와 충돌해 Owner 가 하지 않기로 함 |
| **S2** | 네이티브 결과가 JS hydration 동안 막힘 | `getPendingPushRoute` 는 저장값 1개 읽기다(`NativeIncomingCallPlugin.java:67`). 그런데 같은 때 부른 네이티브 호출 8개 결과가 한꺼번에 돌아온다(Samsung 2,492~2,503 · Xiaomi 3,801~3,804). 네이티브가 아니라 JS 주 스레드가 바쁜 것이다 | 경로를 늦게 알아 D2 의 출발도 늦다. Android 는 문서 시작 때 동기 값(`pendingLaunchRoutePath`)이 이미 있어 이를 쓰면 피할 수 있다 |
| **S3** | 시작 순간 기기가 API 를 20개 넘게 한꺼번에 보낸다 → 서버 인스턴스 CPU 제한(throttle p95 45~59%)에 걸려 가끔 1초 | 채팅방 데이터 요청 `wzzxn`: 도착 04:51:29.558Z → 함수 첫 로그 30.686Z · 함수 자체 `route_total_ms 114` · 인스턴스 시작 형태 `hot`. 같은 때 메신저 bootstrap 2건도 0.6~0.9초 대기. 7일 지표: 이 경로 hot p50 78ms · cold p50 1,750ms(cold 1.5%) · ttfb p75 103~188ms 로 21일 같음 | 회귀 아님. 알림·아이콘 시작 때 몰리는 요청(프로필·설정·배지·알림음 29KB·매장 등)과 겹치면 생긴다 |
| **S4** | 로그인 경계 `/api/auth/session` 0.33초가 채팅방 마운트 앞에 직렬 | 클라이언트는 이미 `SIGNED_IN`(Samsung 2,569)인데 경계가 3,087~3,416에 서버 확인 | 인증 HARD LOCK 범위 — 판정 방식 변경은 별도 승인 |

### 기기·측정 조건 (앱 결함 아님)

| # | 내용 |
|---|---|
| E1 | Xiaomi `/data` 98% 사용(남은 1.2GB) → WebView HTTP 캐시 9.1MB(Samsung 129MB). 새 배포가 없어도 실행마다 JS 150~161개·2.9~3.0MB 를 다시 받는다. Owner 폰 저장공간은 확인 못 함 |
| E2 | 네이티브가 같은 알림 경로를 웹 확인 전까지 약 7회 넣는다 — 11-18 E2 에서 아는 동작. 웹이 2초 중복 무시로 막아 화면 영향 없음 |
| E3 | `am kill` 실행은 `restored=true`(과제 유지) — 실제 알림 탭도 과제가 남아 있으면 같은 경로 |

## 3. 수정안 (전체 · 순서 · 승인)

| 순서 | # | 수정 | 바뀌는 곳 | 기대(근거) | 규정·승인 |
|---|---|---|---|---|---|
| 1 | D1 | Skew Protection 다시 끔. 하드락 H3-1 상태로 복귀. 켜 둔 앱의 옛 파일 문제는 이미 있는 장치가 맡는다(C3 복귀 버전 확인 1회 새로고침 · 청크 실패 1회 새로고침 · C2) | Vercel 설정 1개 · 코드 0 | 11-09 실측: 새 배포 첫 실행 7.5~9.4초 → 4.2초. 이번 대조에서 내용 같은 파일 55/63 은 캐시를 그대로 쓴다 | **Owner 결정** — Vercel 설정 변경 + 11-18 「B」 결정과 하드락 충돌(규정 7) |
| 2 | D3 | 23-9 「목적지 자리 표시면 해제 보류」를 **생명주기 복원 이동에도** 적용한다(지금은 알림 목적지에만). 상한은 기존 8초 그대로 | `lib/startup/startup-metrics.ts` `releaseForInitialDestination` · `launch-destination-paint.ts` | 복원 실행에서 흰 0.6초 + 「입장 중」 0.8초가 덮개 안으로 들어간다(흰·자리 표시 프레임 0). 대신 덮개가 그만큼 길어진다(23-9 와 같은 교환) | 웹 · 승인 범위 확인 후 |
| 3 | D2+S2 | 알림 목적지가 채팅방이면 **경로를 아는 즉시** 채팅방 데이터·채팅방 JS 미리 받기를 시작한다. 목록에서 쓰는 같은 함수, 같은 단일 비행 키 → 게이트가 받아 쓴다. 경로는 Android 문서 시작 동기 값에서 읽어 hydration 대기(S2)를 피한다 | `PushRouteListener.tsx`(비통화 분기만) · `lib/startup/launch-push-hold.ts` 읽기 | 데이터 요청 시작이 Samsung 1.13초·Xiaomi 1.58초 앞당겨진다(⑤⑥⑦ 과 겹침) — 추정. 구현 뒤 같은 방식으로 실측 | 웹 · 통화 분기 무변경 구조 테스트 · 게이트가 미리 받은 값을 실제로 쓰는지 설계 단계에서 코드 확인 필요 |
| 4 | D4 | 아이콘 선언을 하나로 합친다(파일 규칙 또는 `metadata.icons` 중 하나) → 이동마다 요청 주소 3개 → 1개 | `app/layout.tsx` 또는 `app/favicon.ico`·`icon.png` | 이동당 중복 요청 감소 — 반복 원인은 구현 전 확인 | 웹 |
| 5 | S3 | 시작 순간 요청 묶기 — 덮개 아래 필요 없는 요청(알림음 설정 29KB · 매장 · 팝업 · 친구 요청 2회 · 프로필 lite+full 등)을 해제 뒤로 미룬다 | 각 시작 요청 호출처 | 덮개 아래 동시 요청 수가 줄어 CPU 제한 대기가 줄어든다 — 실측으로 판정 | 요청 예산 SSOT(`docs/request-budget-ssot.md`) 범위 · 설계 먼저 |
| 6 | S1 | 알림 진입 첫 문서를 목적지로(11-18 D1) | `MainActivity` | 홈 렌더 0.4~1.3초 제거 | 생명주기 SSOT 충돌 — Owner 재결정 필요 |
| — | S4 | 로그인 경계 서버 확인을 클라이언트 `SIGNED_IN` 과 병행/생략 | `AuthSessionBoundary` | 0.33초 | 인증 HARD LOCK — 별도 승인 |

## 4. 확인 못 한 것 (NOT_PROVEN)
- 실제 FCM 알림 탭 — 이번은 같은 모양의 의도.
- 오늘 같은 기기의 「새 배포 직후 첫 실행」 수치.
- iOS 전체.
- Owner 폰(기기·저장공간·설치 버전).
- 비회원.
- D4 반복 횟수의 원인.
- D2 수정 기대 시간(추정).
- Xiaomi 아이콘 복원 실행 녹화(Samsung 1회만).

## 5. 구현 (Owner 「Report order 1→4」 2026-11-26 · 브랜치 `fix/entry-cover-restore-push-prefetch` · 웹만)

| # | 변경 | 파일 |
|---|---|---|
| D1 | Vercel Skew Protection 끔 — 13:14:06 PHT · `skewProtectionMaxAge` 604800 → 0. 변경 전후 대조: `gitForkProtection` true · `ssoProtection` all_except_custom_domains · `skewProtectionBoundaryAt` null 모두 같음. 다음 배포부터 `?dpl` 없음(첫 배포는 주소 형식이 바뀌어 1회 전부 받음 — 11-09 B1 과 같음). 하드락 H3-1 변경 이력에 기록 | Vercel 설정 · `docs/dibay-app-entry-resume-hard-lock.md` |
| D3 | 생명주기 이동을 실제로 낸 문서(`noteLifecycleNavIssued` — `router.replace` 바로 앞)는 시작 주소를 떠난 뒤 목적지가 자리 표시(로그인 확인 막음·채팅방 입장 대기·채팅방 화면 없음)인 동안 해제하지 않는다. 판정은 23-9 `isLaunchDestinationPaintPending` 그대로. 판단은 주소 기준(셸 첫 프레임 신호가 먼저 와도 같은 답). 상한 8초(알림 목적지와 같은 값) — 이동 쪽 고정 대기 금지 계약 때문에 상한은 별도 모듈 | `lib/startup/lifecycle-nav-hold.ts` · `lib/startup/startup-metrics.ts` · `lib/lifecycle/lifecycle-route-effects.client.ts` · `lib/startup/lifecycle-destination-paint-cap.ts`(신규) |
| D2 | 알림 목적지가 채팅방이면 hydration 직후(첫 effect) 채팅방 JS 예열 + 게이트와 같은 함수·같은 단일 비행 키로 채팅방 데이터 요청. 목적지는 Android 문서 시작 동기 값(`readLaunchPushTarget`)에서 읽는다. 통화 경로·목적지 없음은 무동작. 알림 수신자(`PushRouteListener.tsx`, 통화 분기 포함)는 바꾸지 않았다 — 별도 컴포넌트 | `components/push/LaunchPushRoomPrefetch.tsx`(신규) · `components/layout/MainAppProviderTree.tsx` · `cm-room-route-chunk-warm.ts`(출처 `launch_push`) |
| D4 | `metadata.icons` 의 `/favicon.ico?v=` 삭제 — 파일 규칙 `app/favicon.ico` 와 같은 파일(세 주소 모두 md5 `c30c7d42…` 같음). 보이는 아이콘 변화 없음 | `app/layout.tsx` |

- 시험: `lib/startup/__tests__/lifecycle-destination-paint-hold.test.ts`(신규) · `components/push/__tests__/launch-push-room-prefetch.test.tsx`(신규) · `lib/brand/__tests__/root-icons-single-declaration.test.ts`(신규).
- 요청 수: D2 는 게이트가 보낼 1건을 앞당긴다(늘지 않음). 방 접근 실패 등 미리 받기가 null 이면 게이트가 1번 더 보낸다(실패 경우만).
