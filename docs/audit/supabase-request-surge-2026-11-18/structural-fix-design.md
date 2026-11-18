# Supabase 요청 급증 — 구조 수정 설계안 (2026-11-18)

- Owner 지시: 「정확히 문제에 대한, 처음부터 정확한 설계안을 만들고 수정 작업을 해야지」 · 「근본적인 수정 — 매번 터지게 하지 말고 구조적으로」 · 「땜빵 금지. 디바이의 기능 속도에 영향을 주면 안 된다」
- 상태: **설계안. 이 문서 승인 전 코드 반영 0건.** 이 문서보다 먼저 쓴 코드(브랜치 `perf/launch-cost-structural`·`chore/app-launch-guard`, 커밋 전)는 보류했고, 이 설계와 맞는 부분만 다시 쓴다.
- 근거 문서: `root-cause-design.md`(원인 분해), `fundamental-countermeasure-design.md`(감시 설계), 11-08 `supabase-request-surge-*-2026-11-08.md`
- 측정 조건: 운영 Vercel `vercel.external_api_request.count`(origin_route·request_path) · `vercel.request.count`(route·client_user_agent·client_ip) · Supabase edge 로그 · 운영 DB 읽기 전용. 이번 구간 = 11-17 12:00 ~ 11-18 12:00 PHT, 전날 = 그 전 24시간.

---

## 0. 작업자 잘못·정정 (먼저)

| # | 잘못 | 정정·조치 |
|---|---|---|
| E1 | 원인을 나누기 전에 「주원인 = 시험 기기」라고 보고 | §1 에 숫자로 분해 |
| E2 | S-1(수신 조회 쿼리 2건 제거)을 11-08 보완서 §6 「BLOCKED」를 읽지 않고 구현·병합(#464) | 되돌림 #466 병합 (12:30 PHT) |
| E3 | 「전역 데이터를 CDN 으로 → 크게 준다」고 말함 | 코드 확인 결과 실행 1회당 약 3.4건. 하단 탭·인트로 2개는 「즉시 반영」 계약과 충돌 |
| E4 | 「프로필 2번 받기 = 결함」이라고 말함 | 첫 화면 속도용 의도 설계(lite → 80ms 뒤 full). 변경 대상 아님 |
| E5 | 운영을 재현 못 하는 CI 검사(가짜 빈 데이터)를 만들었다가 제거 | 감지는 운영 계수기(§3 A0)로 |
| E6 | 설계안 없이 코드를 조각조각 먼저 수정 | 이 문서로 대체. 보류 코드는 이 문서 기준으로 재작성 |
| E7 | 「10회 상한」을 문서로만 넣고 막는 장치가 없었음 | §3 A1 |

---

## 1. 문제 정의 (측정 사실)

### 1-1. 무엇이 늘었나
| 지표 | 전날 | 이번 | 증가 |
|---|---|---|---|
| Supabase 요청(대시보드 기준 edge 로그) | 143,177 | 272,678 | +129,501 |
| 그중 Vercel 서버 경유 | 128,942 | 249,500 | +120,558 |
| Vercel 요청 | 약 68,600 | 약 121,000 | 약 1.8배 |
| API 1회당 Supabase(라우트별) | — | — | **이틀 거의 같음** (새 배포 회귀 아님) |

### 1-2. 누가 늘렸나
| 원인 | 증가분 | 근거 |
|---|---|---|
| 사무실 Android 시험 기기 2대(Samsung SM-M156S·Xiaomi 24076RP19G, 27.49.10.28) | **+107,572 (89%)** — 라우트 평균 배수로 낸 추정 | API 요청 +27,095(API 증가분의 93%), 앱 처음 실행 51 → **677회**, 시간당 최대 97회(00시 PHT) |
| 그 밖 | +12,986 (11%) | 항목별 분해 NOT_PROVEN |

- 시간대: 11-17 23시 ~ 11-18 12시 PHT. 같은 시간 `adb … am force-stop` → `monkey -p com.dibay.app` 반복을 실행한 작업 세션 2개(「배민 인트로/팝업 플로우 감사」·「Android 하단 네비게이션 기능 검증」). 세션별 몫 NOT_PROVEN.

### 1-3. 왜 실행 횟수가 곧 부하가 되나 (구조 결함)
1. **앱 실행 1회 = 서로 다른 API 20개가 각각 따로** 나간다(전부 1.0~1.25회/실행, 코드 위치 §부록 A). 이 20개만 Supabase 약 **40건**.
2. **API 요청마다 미들웨어(`proxy.ts`)가 회원 상태를 다시 조회**: Supabase 22,213건/일(profiles 15,304 · `member_write_gate_snapshot` 4,372 · jwks 1,287 · `required_consent_versions` 1,243). 회원 상태 캐시는 인스턴스 메모리 5초(`MEMBER_LIFECYCLE_AUTHORITY_CACHE_TTL_MS`).
3. **화면 API 1회가 Supabase 를 여러 번**: 알림 읽음 19.0 · 홈 매장 피드 16.6 · 방 열기 15.4 · 메신저 첫 화면 11.8 · 방 메시지 10.6 · 배지 7.6 · 동네 피드 7.2.
4. **인스턴스 간 공유 캐시를 거의 안 씀**: 운영에 Redis(`UPSTASH_*`·`KV_*`) 없음. Next 공유 데이터 캐시(`unstable_cache`)는 하단 탭·홈 레이아웃 등 소수만 사용(하단 탭 API 는 그래서 1회당 0.2건).
5. **다시 켤 때 전부 다시 받음**: sessionStorage·메모리 캐시는 앱을 새로 켜면 비어 있다(새 WebView 문서).

### 1-4. 운영 호출량 순위 (Vercel 경유 Supabase, 이번 구간 · 줄일 대상의 순서 근거)
| 순위 | 대상 | Supabase/일 | 1회당 |
|---|---|---|---|
| 1 | 수신 통화 조회 `calls/sessions/incoming` | 23,758 | 5.4 |
| 2 | 미들웨어(회원 확인·가입 확인·쓰기 권한) | 22,213 | — |
| 3 | 방 메시지 `rooms/[roomId]/messages` | 16,415 | 10.6 |
| 4 | 방 열기 `rooms/[roomId]/bootstrap` | 13,247 | 4.0 |
| 5 | 접속 상태 `presence` | 13,068 | 1.0 |
| 6 | 배지 `me/notifications/badge-count` | 12,546 | 7.6 |
| 7 | 동네 피드 `philife/neighborhood-feed` | 12,040 | 7.2 |
| 8 | 홈 매장 피드 `stores/home-feed` | 11,472 | 16.6 |
| 9 | 통화 세션 `calls/sessions/[sessionId]` | 9,071 | 4.9 |
| 10 | 메신저 첫 화면 `community-messenger/bootstrap` | 7,264 | 11.8 |
| 11 | 알림 읽음 `me/notifications/room-read` | 6,683 | 19.0 |
| 12 | 방 정보 `rooms/[roomId]` | 5,505 | 15.4 |
| — | 앱 실행 API 20개 합계 | 약 27,000 | 실행당 약 40 |

---

## 2. 기준 — 대형 앱 구조 (공개 자료)
| 항목 | 대형 앱 | DIBAY |
|---|---|---|
| 앱 시작 | Slack: 엣지 캐시(Flannel)가 시작 데이터를 미리 모아 줄인 1개만 전달(7~44배 축소) · Discord: 접속 시 READY 1개, 나머지 지연 | API 20개 따로 |
| 재접속 | Telegram: 기기 저장 데이터로 즉시 표시 + 마지막 지점 이후 변경분만(`getDifference`) | 전부 다시 받음 |
| 공유 캐시 | 엣지·캐시 계층이 DB 앞에서 읽기를 받음 | 거의 없음 |
| 인증 | 연결 1회 확인 | API 마다 재조회 |

출처: slack.engineering/flannel-an-application-level-edge-cache-to-make-slack-scale · docs.discord.com/developers/events/gateway-events · core.telegram.org/api/optimisation

---

## 3. 설계 항목

표기: **동작 불변** = 응답 값·화면·속도 그대로, 호출만 줄어듦. 각 항목은 도메인별 단독 PR. 「예상」은 이번 구간 측정값으로 계산 — 운영 측정 전 NOT_PROVEN, 반영 후 A0 계수기로 전후 실측.

### A0. 운영 감시 (PR #470 — 병합 대기)
- 운영 Node 서버 fetch 를 감싸 라우트별 Supabase 호출 수를 세고 기존 집계 표(`cm_monitoring_rollup_hourly`)에 5분마다 저장. 하루 1회(09:00 PHT) 예산 비교 → 넘칠 때만 관리자 알림. 새 DB 객체·비밀값 없음. 끄기 `SUPABASE_CALL_COUNTER=0`.
- 역할: 이후 모든 항목의 **전후 실측 도구**이자 재발 감지. 구조를 고치는 항목은 아님.

### A1. 시험 반복 실행 기술적 차단 (원인 1-2 · 증가분 89%)
- 현재: AGENTS.md 문구만(10회). 막는 장치 없음.
- 변경: `.claude/hooks/app-launch-guard.mjs` + `.claude/settings.json` PreToolUse(Bash · iOS 시뮬레이터 launch).
  - `monkey -p com.dibay.app`·`am start … com.dibay.app`·`simctl launch … com.dibay.app` 를 세션별로 세어 10회 초과 명령은 **실행 전 거부**.
  - 반복문(for·while·until·seq·xargs) 안의 앱 실행은 횟수 확인 불가 → 거부. 실행하는 `.sh` 파일 안도 같은 규칙.
  - 추가 허용은 Owner 가 `.claude/state/app-launch/<세션>.allow` 에 횟수를 적을 때만.
- 영향: Claude 작업 세션의 기기 시험 명령만. 앱·서버 동작 무관.
- 한계: 사람이 기기를 직접 조작하거나 Claude 밖 도구로 실행하는 것은 못 막음 → A0 가 시험 기기 사용량을 별도 집계·경보.
- 적용 조건: 훅은 각 세션이 여는 작업 폴더의 `.claude/settings.json` 을 읽는다 → main 병합 후 공용 작업 폴더(`/Users/bkkim/projects/samarket`)가 main 을 받아야 적용.
- 검증: 단위 시험(일반 명령 통과·반복문 거부·11번째 거부·다른 세션 독립·허용 파일·스크립트 파일·시뮬레이터) — 작성·통과 완료(커밋 전).

### A2. 미들웨어 회원 확인의 인스턴스 간 공유 (1-4 순위 2 · Auth HARD LOCK)
- 현재: API GET 마다 `enforceApiMemberReadPolicy`(`lib/auth/enforce-api-member-read-policy.ts`) → `resolveMemberLifecycleAuthority` → profiles `status,deleted_at`. 캐시 5초·인스턴스별 → 10초 간격 조회도 매번 DB(실측).
- 변경 방향(동작 불변): 차단·탈퇴 판정 값을 공유 캐시(`unstable_cache`, 태그 `member-lifecycle:<userId>`)에 두고, **모더레이션(차단·탈퇴·복구) 저장 경로가 태그를 즉시 무효화**. 캐시 수명만 늘리는 방식은 금지(차단 반영 지연 = 보안 계약 위반).
- 선행: `docs/auth-hard-lock.md` §4 Reopen 조건 대조, 모더레이션 저장 경로 전수(차단·탈퇴·복구·관리자 일괄) 목록화. **이 설계안 승인 후 별도 상세 설계서.**
- 예상: profiles 하루 약 1.1만~1.5만 건 감소(미들웨어 22,213 중).

### A3. 화면 API 다건 조회 줄이기 (1-4 순위 3·4·6·7·8·10·11·12)
- 원칙: 같은 요청 안의 같은 표 반복 읽기 제거 → RPC 1~2회. 결과 값 불변을 기존 응답과 대조 테스트로 증명.
- 대상과 측정 근거(1회당 호출):
  - 알림 읽음 19.0: notification_events 3.0 · rooms 2.71 · clear_notification_target 2.0 · store_orders 1.69 · stores 1.69 · owner_hub_badge 1.25
  - 홈 매장 피드 16.6: `get_store_discovery_shadow_wave` 4.37 · admin_settings 2.68 · stores 1.81
  - 방 열기 15.4 · 메신저 첫 화면 11.8(bootstrap_snapshots 3.55) · 방 메시지 10.6 · 배지 7.6 · 동네 피드 7.2(community_posts 1.99)
- 메신저·통화 연계 화면은 메신저 계약(`docs/messenger-realtime-policy.md`)·통화 규정 적용. **라우트별 상세 설계서를 이 순서로 하나씩**(호출량 큰 것부터) — 이 문서는 범위·순서만 고정.

### A4. 앱 실행 요청 묶기 (1-3 ① · 실행당 약 40건)
- 목표 구조: 실행 시 사용자별 시작 데이터를 **요청 1개·인증 1번·DB RPC 1번**으로(`/api/app/boot`), 받은 값을 기존 화면 저장소에 미리 채워 각 화면이 다시 요청하지 않게. 다시 켤 때는 기기 저장본 + 변경분만.
- 기존 부팅 관리(`lib/app-boot/run-app-boot.ts`)는 프로필 lite 1개만 묶는다. 나머지 18개는 각 컴포넌트가 따로 호출(부록 A).
- 선행: 20개 각각의 「첫 화면 필요 여부·실패 시 동작·갱신 시점」 계약 표 — **별도 상세 설계서**. 인트로·팝업 2개는 진행 중인 다른 세션과 파일이 겹쳐 그 세션 종료 후.

### A5. 실행 1회마다 나가는 확인된 중복 (작은 항목 · 동작 불변)
| # | 대상 | 현재(근거) | 변경 | 영향 호출처 | 깨질 수 있는 것 · 처리 | 예상/일 |
|---|---|---|---|---|---|---|
| A5-1 | 앱 설정 `app_settings_bundle_v1` | `/api/app-settings` 매 요청 DB(`app/api/app-settings/route.ts`), 서버 getter 인스턴스 60초 | 공유 캐시(태그 `admin-setting:<key>`), 관리자 저장(`/api/admin/app-settings` PUT·유일 저장 함수 `saveAppSettingsBundleToDb`) 직후 무효화 | `AppTitle.tsx`(전역) · `home-posts-route-core.ts` · `item-trade-chat-start-core.ts` | 다른 저장 경로 없음(코드 확인). DB 직접 수정 시 최대 300초 → 저장은 관리자 화면 경유가 규정 | 약 1,100 |
| A5-2 | 첫 진입 화면 `startup_config_v1` | 매 요청 DB | 같은 방식, 저장(`/api/admin/startup-config` PUT) 직후 무효화. 관리자 화면 조회는 DB 직접 유지 | `InitialSurfaceBootstrap.tsx` | 응답 헤더(no-store) 그대로 | 약 900 |
| A5-3 | 필라이프 섹션 `philife_neighborhood_section` | 동네 주제 API 1회에 같은 키 2번 읽음 등, 하루 1,053 | 같은 방식, 저장 2경로(`/api/admin/community/philife-neighborhood-section` PUT·POST) 직후 무효화 | 13개 파일(부록 B) — 반환 값 동일 | `sb` 인자는 섹션 행 조회에만 사용(설정 읽기는 서비스 키) — 값 동일 | 약 1,000 |
| A5-4 | 마케팅 약관(알림 설정 API) | 요청마다 `app_legal_documents` 2번(ko·en) | **marketing 만** 게시 행 목록을 공유 캐시, 시행일 판정은 매 읽기 현재 시각. 관리자 약관 저장 2경로 직후 무효화 | `marketing-consent.server.ts`·`/privacy/marketing` | 이용약관·개인정보는 가입 게이트·동의 판정(Auth HARD LOCK)이 써서 **제외** | 하루 1,444 중 marketing 분 |
| A5-5 | 계정 설정 `/api/me/settings` | 실행 1회에 2번(`AppLanguageProvider.tsx` 마운트 + 세션 확인 직후) | 세션 확인된 시점 1번. 복귀·로그인 전환 재동기화 유지 | `AppLanguageProvider`(루트) | 원격 언어 반영이 세션 확인(수백 ms)까지 늦어짐 — 화면 언어는 기기 저장값으로 즉시 표시되므로 첫 화면 영향 없음 | 약 900 |
| A5-6 | 찜 `/api/favorites/list` | 하트 표시용인데 게시글 전체를 받음(id 만 사용, `FavoriteContext.tsx:59`) | `?ids=1` id 모드(favorites 1회). 무인자·페이지 모드 응답 불변 | `FavoriteProvider` → `FavoriteToggleButton`(isFavorite 만) | 삭제된 글의 id 가 포함될 수 있으나 그 글은 화면에 없어 하트 표시 무관 | 약 1,400 |

### A6. 별도 절차가 필요한 확인된 중복 (이 문서는 사실·범위만)
| 대상 | 사실 | 절차 |
|---|---|---|
| 비회원 기록 이전 `platform-promotion/reconcile-guest` | 1회성 작업인데 로그인 이벤트마다 → 사실상 매 실행(실행당 1.21) | Auth HARD LOCK(`SupabaseAuthSync`) 대조 후 |
| 기기 등록 `me/devices/register` | 토큰이 안 바뀌어도 매 실행 | 푸시·통화 수신 토큰 경로 → 통화 변경 규정(영향 분석·실기 행렬) |
| 수신 통화 조회(1-4 순위 1) | 맥 iOS 앱 10초 조회(S4 승인 설계), 1회 5.4건 | 11-08 보완서 §6 대안 「사용자당 정리 묶기」 — 통화 규정 |

### 바꾸지 않는 것 (이유)
| 대상 | 이유 |
|---|---|
| 프로필 lite + full | 첫 화면 속도용 의도 설계(E4) |
| 알림음 설정 | 하드락 영역 + 읽을 때 서버 스냅샷 채움 부수 작업이 있어 캐시 시 동작 달라짐 |
| 하단 탭 · 인트로 live | 「즉시 반영」 계약(코드 주석·인트로 계약 §4). 하단 탭은 이미 공유 캐시라 1회당 0.2 |
| 인트로 소재 정책 `launch_intro_pool_policy_v1`(977/일) | 다른 세션 작업 영역 |

---

## 4. 순서 · PR 단위
| 순서 | 항목 | PR | 운영 동작 |
|---|---|---|---|
| 1 | A0 운영 감시 | #470 (병합 대기) | 불변 |
| 2 | A1 시험 반복 차단 훅 | 단독 | 앱 무관 |
| 3 | A5-1~A5-6 | 단독(앱 실행 중복 제거) | 불변 |
| 4 | A2 회원 확인 공유 | 상세 설계서 → 승인 → 단독 | 불변 목표 |
| 5 | A3 화면 API (호출량 순) | 라우트별 상세 설계서 → 단독 | 불변 목표 |
| 6 | A4 시작 요청 묶기 | 상세 설계서 → 단독 | 불변 목표 |
| 7 | A6 | 각 규정 절차 | — |

각 PR: 로컬 `typecheck:build`·`typecheck:test`·`test:ci`·`build` 1회 → 병합 → **A0 계수기로 해당 라우트 1회당 호출 전후 실측 보고**.

## 5. 예상 효과 (계산 · NOT_PROVEN)
| 항목 | 하루 감소(이번 구간 기준) | 비고 |
|---|---|---|
| A1 | 시험 반복이 같은 규모면 약 10만 | 시험량에 비례 |
| A5 합계 | 약 6~7천 (전체의 약 2.5%) | 작다 — 구조 효과는 A2~A4 |
| A2 | 약 1.1만~1.5만 | |
| A3 | 라우트별 상세 설계 후 산정 | 대상 합계 약 8.5만/일 |
| A4 | 실행당 약 40 → 목표 3 이하 | 상세 설계 후 산정 |

---

## 부록 A. 앱 실행 API 20개 (코드 위치 · 실행당 · 1회당 Supabase)
launch-intro/live `lib/launch-intro/discovery.ts:49` 1.25·3.0 · platform-popup/resolve `lib/platform-popup/fetch-platform-popup-resolve-client.ts:86` 1.24·2.3 · me/mandatory-address-gate `lib/addresses/mandatory-address-gate-client.ts:71` 1.23·2.8 · platform-promotion/reconcile-guest `lib/platform-promotion-lifecycle/client-record-content-visit.ts:50` 1.21·2.0 · me/notifications `lib/me/fetch-me-notifications-deduped.ts:168` 1.20·1.4 · me/address-defaults `lib/addresses/fetch-address-defaults-client.ts:185` 1.17·1.0 · auth/session `lib/auth/fetch-auth-session-client.ts:155` 1.14·1.7 · platform-popup/ptr-reveal `lib/platform-popup/ptr-reveal-client.ts:201` 1.12·2.0 · app/notification-sound-ssot `lib/notifications/notification-sound-ssot-client-hydrate.ts:102` 1.08·2.1 · philife/neighborhood-topic-options `lib/philife/fetch-neighborhood-topic-options-client.ts:69` 1.08·1.4 · app/main-bottom-nav `lib/app/fetch-main-bottom-nav-deduped.ts:42` 1.08·0.2 · me/stores `lib/me/fetch-me-stores-deduped.ts:68` 1.08·2.4 · app-settings `lib/admin-settings/app-settings-client.ts:156` 1.04·1.0 · app/startup-config `lib/startup/startup-config-client.ts:55` 1.03·1.0 · telemetry/entry `lib/telemetry/entry-telemetry.client.ts:246` 1.03·0 · favorites/list `lib/favorites/favorites-client.ts:13` 1.01·2.9 · me/notification-settings `lib/me/fetch-me-notification-settings-client.ts:111` 1.01·3.4 · me/devices/register `lib/push/native/register-native-push-client.ts:108` 1.00·1.8 · moim `lib/moim/moim-client-api.ts:72` 1.00·2.6 · me/store-owner-hub-badge `lib/chats/owner-hub-badge-store.ts:1138` 1.00·0.9

## 부록 B. A5-3 영향 호출처 (필라이프 섹션 설정 읽기 함수)
app/admin/community/sections/page.tsx · app/admin/community/topics/page.tsx · app/api/admin/community/notices/route.ts · app/api/admin/community/philife-neighborhood-section/route.ts · app/api/community/neighborhood-posts/route.ts · app/api/philife/neighborhood-topic-options/route.ts · lib/admin/community-admin/community-post-admin-patch.ts · lib/community-feed/queries.ts · lib/community-operator-import/publish.ts · lib/community-operator-import/topics.ts · lib/neighborhood/philife-neighborhood-topics.ts · lib/neighborhood/resolve-topic-for-category.ts · lib/philife/resolve-philife-global-feed-initial-rsc.ts
