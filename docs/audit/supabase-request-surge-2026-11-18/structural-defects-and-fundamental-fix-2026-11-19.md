# Supabase 요청 — 회원 1천·1만 규모에서 터지는 구조 결함과 근본 수정 설계 (2026-11-19)

- Owner 지시: 「커서 방향이 잘못됐으면 확실히 잡고, Total Requests 를 줄이는 근본 문제를 잡아라. 회원 1000·10000 이면 무조건 터지는 구조 — 하나하나 확인해서 구조 결함을 잡아라」 · 「커서 작업이 잘못된 쓰레기라면 리버트」
- 상태: **설계(승인 요청).** 이 문서의 코드 변경은 아직 0건. 함께 한 조치는 §0.
- 증거 표기: PROD(운영 실측) · CODE(file:line 확인) · 산술(측정 아님) · NOT_PROVEN
- 실측 창: 2026-11-18 00:00 ~ 24:00 PHT (16:00Z~16:00Z). Vercel `external_api_request.count`(서버→Supabase, 라우트별) · `request.count`(라우트·기기별) · Supabase edge 로그 · 운영 DB 읽기 전용.

---

## 0. 이미 한 조치 (Cursor 작업 정리)

| Cursor PR | 판정 | 조치 |
|---|---|---|
| #476 B3 메시지 | 운영 결함(지운 대화 재노출) | **#479 수정 · 병합됨** |
| #474 B1 홈 피드 | 운영에서 요청 증가(batch RPC 없음) · 캐시 손실 | **#480 revert** (자동 병합 등록) |
| #478 B4 Auth | 운영 미동작(Redis 없음) · 켜면 무만료 차단 누락 위험 | **#481 revert** (자동 병합 등록) |
| #477 C cron | 통화 푸시를 매장 cron 과 묶음(통화 규정 위반) · 푸시 실패 시 주문 자동취소 정지 | **#482 revert** (자동 병합 등록) |
| #475 B2 읽음 | 실패 시 폴백 있음, 결함 미발견 | 유지 |
| #473 A1 수신 | 서버 단가 5→1 은 맞음. 만료 울림 1회 재노출(유령 벨) 위험 | 유지 · §4 S3 에서 순서 결함만 수정(통화 규정 승인 필요) |

**Cursor 방향의 근본 잘못:** 「요청 1회당 왕복 몇 개 줄이기」(B1·B2·B3)에 집중했다. 그러나 회원 수에 비례해 폭발하는 것은 **요청 횟수 자체**(켜 두기만 해도 도는 주기 호출, 실행·복귀마다 20여 개로 흩어진 API)다. 단가를 10% 줄여도 횟수가 회원 수 × 시간으로 늘면 그대로 터진다.

---

## 1. 지금 25만은 무엇인가 (PROD)

서버 경유 Supabase(라우트별, 24h) 상위:

| 라우트 | 요청 | Supabase | 1회당 | 성격 |
|---|---|---|---|---|
| proxy(`/_middleware`) | — | 16,323 | — | 모든 요청 |
| `rooms/[roomId]/messages` | 1,282 | 14,381 | **11.2** | 방 진입·이전 대화 |
| `rooms/[roomId]/bootstrap` | 3,015 | 11,988 | 4.0 | 방 진입 |
| `community-messenger/presence` | 11,394 | 11,604 | 1.0 | **12초 주기** |
| `philife/neighborhood-feed` | 1,559 | 11,186 | 7.2 | 홈 |
| `me/notifications/badge-count` | 1,453 | 10,980 | 7.6 | 실행·복귀 |
| `stores/home-feed` | 621 | 10,916 | **17.6** | 홈 |
| `calls/sessions/[sessionId]` | 1,673 | 8,546 | 5.1 | 통화 |
| `community-messenger/bootstrap` | 613 | 7,297 | **11.9** | 메신저 첫 화면 |
| `me/notifications/room-read` | — | 5,895 | — | 방 읽음 |

정적 파일: `/favicon.ico` 11,322 · 앱 아이콘 4,726 (Vercel 만, Supabase 0).

---

## 2. 규모에서 터지는 구조 결함 (회원 수에 비례하는 것만, 큰 순)

### S1. 화면이 켜져 있으면 사용자가 아무것도 안 해도 12초마다 DB 쓰기 — presence HTTP 하트비트
- CODE: `lib/community-messenger/realtime/presence/use-community-messenger-presence-runtime.ts:29` `HEARTBEAT_MS = 12_000`, `:325-337` 화면이 보이면 무조건 재예약. **활동 여부와 무관.** 메신저 레이아웃 전체에서 켜짐(`app/(main)/community-messenger/layout.tsx:20`).
- PROD: 사용자 `a75ca8cd…`(Android 1.2.7 (54)) — `app_visibility=foreground`, **마지막 활동 07:28Z, 9시간 동안 활동 0인데 16:24Z 에도 하트비트 중.** iPhone 1대가 24시간 내내 6시간당 약 1,240건.
- 같은 정보를 이미 Realtime presence 채널(`channel.track`)로 보내고 있다(`:347-352`). DB `presence_snapshots` upsert 는 그 위에 얹은 **두 번째 경로**.
- 비용: 켜 둔 기기 1대 = **시간당 300건, 하루 최대 7,200건.**
- 레거시 대비: 레거시 메신저(카톡류)는 접속 표시를 소켓 presence 로만 하고, DB 의 last_seen 은 **상태가 바뀔 때만** 쓴다.

### S2. 거래 채팅방 — Realtime 이 정상이어도 5초 HTTP 폴링
- CODE: `components/chats/ChatDetailView.tsx:1252-1262` 거래 상품 방 5s(연결 중에도), 일반 방은 연결 중 25s.
- 비용: 방을 열어 둔 1명 = 720회/시 × 약 4 = **시간당 약 2,900건.**
- 레거시 규칙(`incoming-call-ui-policy.ts:31` `if (realtimeOk) return false`)과 반대.

### S3. 웹·Mac 수신 통화 탐색 — Realtime 정상에도 10초, 숨긴 탭에서도 계속
- CODE: `call-v4-incoming-discovery.ts:47` 10s · 숨김 확인 없음(`:411~`). 레거시는 Realtime 정상·숨김이면 HTTP 0.
- A1 로 1회당 5→1 이 됐지만 **횟수는 그대로**(켜 둔 웹·Mac 1대 시간당 360회).
- A1 순서 결함: 목록 SELECT 후 정리 → 만료 울림이 1회 응답에 실림(유령 벨).
- **통화 변경 규정 대상.** S4(11-08 「폴링 0 불승인」) 재승인 필요.

### S4. 화면 1개 = 흩어진 API 여러 개 × API 1개 = Supabase 여러 번
- 홈 진입: home-feed 17.6 + neighborhood-feed 7.2 + home/store-menus 2.2 + philife/posts 7.8 ≈ **35**.
- 메신저 방 진입: bootstrap 4.0 + messages 11.2 + room-read/rooms 15~19 ≈ **30~35**.
- 메신저 첫 화면: bootstrap 11.9(스냅샷 3.55회 반복).
- 원인: 라우트가 표를 하나씩 직렬·병렬로 읽고, 같은 요청 안에서 같은 표를 여러 번 읽는다(root-cause-design §4-1).

### S5. 앱 실행 1회 = 서로 따로인 시작 API 약 20개
- CODE(하위 조사, structural-fix-design 부록 A): startup-config · app-settings · main-bottom-nav · notification-sound-ssot · launch-intro · platform-popup · mandatory-address-gate · address-defaults · me/settings · me/profile×2 · badge-count · store-owner-hub-badge · notification-settings · devices/register · telemetry · favorites · moim … 
- 각각이 proxy 회원 상태 확인(5초·인스턴스별 캐시라 대부분 놓침)과 핸들러 인증을 **따로** 치른다.
- 이 중 절반은 **모든 회원에게 같은 설정값**(startup-config·app-settings·bottom-nav·sound-ssot·launch-intro·category-settings)인데 CDN 캐시 없이 매번 서버·DB 를 탄다.
- 비용: 화면 이동 없는 콜드 스타트 약 95~115건(CODE 추정), 측정 평균 195건(화면 이동 포함).

### S6. 앱 복귀(백그라운드→앞) 1회마다 15~25건
- badge-count(~8) · friend-requests(~3-5) · owner-hub-badge · 주소 게이트 · 홈 목록 숨김 확인(간격 제한 없음) …
- 휴대폰 사용자는 하루 수십 번 앱을 오간다 → 실행보다 큰 항목이 될 수 있다.

### S7. 요청마다 회원 상태·쓰기 게이트 재확인
- `/api` GET 마다 profiles `status,deleted_at` (5초·인스턴스별 캐시) · 쓰기마다 `member_write_gate_snapshot` RPC(캐시 없음).
- PROD: `profiles` 하루 25,779건(1위).
- Redis 없이 인스턴스 메모리 캐시로는 서버리스에서 적중하지 않는다(B4 실패 원인).

### (참고) 회원 수와 무관한 고정 바닥
- cron 23개 유휴 약 1.35만/일(CODE). 줄이면 좋지만 규모 폭발 원인은 아니다.

---

## 3. 규모 산술 (측정 아님 — 지금 단가 × 가정 사용 패턴)

가정: 활성 회원 1명/일 = 실행 3회 · 복귀 10회 · 메신저 화면 20분 · 방 진입 5회 · 홈 진입 3회. 그리고 회원의 5% 는 메신저 화면을 켜 둔 채 둔다(충전 중 등 — S1 PROD 사례).

| 항목 | 활성 1명/일 | 근거 |
|---|---|---|
| 실행 3 × 105 | 315 | S5 |
| 복귀 10 × 20 | 200 | S6 |
| 메신저 20분 presence | 100 | S1 |
| 방 진입 5 × 33 | 165 | S4 |
| 홈 진입(실행 외 추가) | ~70 | S4 |
| proxy·인증 | ~60 | S7 |
| **합** | **약 900** | |
| 켜 둔 기기 1대 | **7,200** | S1 |

| 회원 | 활성 40% | 켜 둔 기기 5% | 하루 합계(산술) |
|---|---|---|---|
| 1,000 | 400 × 900 = 36만 | 50 × 7,200 = 36만 | **약 72만** |
| 10,000 | 4,000 × 900 = 360만 | 500 × 7,200 = 360만 | **약 720만** |

→ 지금(시험 기기 수 대)의 25만이 회원 1만에서는 **약 30배.** Cursor 의 B1~B3 는 이 표의 「방 진입·홈」 단가 일부만 건드렸고, 가장 큰 두 줄(켜 둔 기기, 실행·복귀 횟수)은 그대로다.

---

## 4. 근본 수정 설계 (원칙: 같은 화면·같은 기능을 **요청 횟수 자체를 줄여서**)

| # | 결함 | 근본 수정 | 수정 후 단가 | 기능·속도 | 규정 |
|---|---|---|---|---|---|
| **F1** | S1 presence | ① DB 하트비트를 **상태 전환 때만**(보임↔숨김, 온라인↔오프라인, 방 입장/퇴장). 접속 중 표시는 이미 있는 Realtime presence 로. ② 활동 없음 5분이면 「자리 비움」으로 1회 쓰고 하트비트 정지, 터치 시 재개. ③ 서버 측 「오래된 온라인」 판정은 `last_ping_at` 대신 Realtime presence + 전환 기록으로 | 켜 둔 기기 7,200 → **~10/일** | 접속 표시 지연 없음(Realtime 이 주 경로). 통화 presence lease 와 묶여 있어 영향 분석 필수 | **통화 변경 규정**(presence lease) — 계획·승인·실기 행렬 |
| **F2** | S2 거래방 폴링 | Realtime 연결 정상이면 HTTP 0, 끊김·복귀 때만 1회 정합 + 끊김 동안 6s (레거시 규칙과 동일) | 2,900/시 → **~0** (끊김 시만) | 메시지 수신은 Realtime 으로 동일. 끊김 감지 시 즉시 백업 | 거래 채팅 도메인 단독 PR |
| **F3** | S5 실행 fan-out | ① **공통 설정 6종을 CDN 캐시 응답**으로(`s-maxage`+`stale-while-revalidate`, 어드민 저장 시 태그 무효화) → Supabase 0. ② 회원별 시작 데이터(profile·settings·badge·hub-badge·notification-settings·address-defaults·favorites)를 **`/api/app/boot` 1회 + DB RPC 1개**로 | 실행 105 → **~15** | 첫 화면 더 빨라짐(왕복 20 → 2) | 앱 실행 경로 — 단계별 단독 PR, 실기 확인 |
| **F4** | S6 복귀 묶음 | 복귀 시 **변경 여부만 묻는 1회**(`/api/app/resume?since=` → 서버가 버전/카운터만 비교, 바뀐 것만 갱신). badge 는 Realtime 카운터 bump 로 | 복귀 20 → **~2** | 동일 | F3 와 같은 계열 |
| **F5** | S4 화면 단가 | 화면 하나 = **DB RPC 1개**(서버 조립). 홈: home-feed 순위·메뉴·인기 한 RPC(마이그레이션). 방 진입: bootstrap+messages+read 를 한 응답으로. 메신저 첫 화면: 스냅샷 1회 | 홈 35 → ~4, 방 33 → ~5 | 왕복 감소로 빨라짐 | 도메인별 단독 PR · **운영 DB 적용은 승인 후 먼저**, 코드는 적용 확인 뒤 병합(B1·B3 실패 재발 방지) |
| **F6** | S7 인증 반복 | 회원 상태(차단·탈퇴)를 **JWT 클레임**으로(Supabase Custom Access Token Hook) — 상태 변경 시 세션 무효화. 쓰기 게이트는 쓰기 RPC 안에서 확인 | 요청당 0.2~1 → **0** | 차단 반영: 세션 무효화로 즉시 | **Auth HARD LOCK** — 별도 설계·승인 |
| **F7** | S3 웹·Mac 수신 | A1 순서 결함 수정(정리 후 목록) + 숨긴 탭 HTTP 0 + (S4 재승인 시) Realtime 정상 시 HTTP 0 | 360/시 → ~0 | 레거시와 같음 | **통화 변경 규정** |
| F8 | 고정 바닥 | 5분 cron 단일 due-probe RPC · 단일 RPC 만료 작업은 pg_cron 으로 · pg_cron 과 중복 호출 제거 | 1.35만 → ~0.6만/일 | 무관 | 통화·푸시 cron 은 제외 |
| F9 | 정적 파일 | favicon·앱 아이콘 `Cache-Control: max-age=86400` | Vercel 1.6만/일 → ~0 | 무관 | 웹 단독 |

**수정 후 산술:** 활성 1명/일 약 900 → **약 100** (실행 3×15 + 복귀 10×2 + 방 5×5 + 홈 3×4 + 기타). 켜 둔 기기 7,200 → ~10.
회원 1만: 약 720만 → **약 40만/일** (지금 시험 단계 25만과 비슷한 수준).

---

## 5. 순서 (효과·위험 순, 각각 단독 PR · 단계마다 운영 실측 전후 기록)

1. **F9 정적 캐시 · F2 거래방 폴링** — 통화·Auth 무관, 즉시 가능. (승인 시 바로 구현)
2. **F1 presence** — 가장 큰 규모 위험. 통화 규정이라 영향 분석 문서 → Owner 승인 → 구현 → 실기 행렬.
3. **F3 시작 설정 CDN 캐시 → F3 boot 묶음 → F4 복귀** — 앱 실행 경로, 실기 10회 상한 안에서 측정.
4. **F5 화면 RPC** — 마이그레이션 운영 적용 승인 → 적용 확인 → 코드 병합.
5. **F6 Auth 클레임** — Auth HARD LOCK 설계 문서 먼저.
6. **F7 수신 통화** — 통화 규정, S4 재승인.
7. F8 cron.

각 단계 완료 = 코드 PASS + 운영에서 해당 라우트 「요청 수·1회당 Supabase」 전후 비교(Vercel 지표). 추정만으로 완료라고 쓰지 않는다.

---

## 6. NOT_PROVEN · 한계
- §3 은 산술이다. 실제 회원 사용 패턴(실행·복귀 횟수, 켜 둔 비율)은 측정한 적 없다.
- 실행 1회 95~115건은 코드 추정(측정 195는 화면 이동 포함).
- 앱 직접 호출(Supabase 직접, 하루 약 2.3만)의 경로별 분해는 하지 않았다.
- `a75ca8cd…` 기기가 사무실 시험 기기인지 실사용자인지는 확인 못 함 — 결함 판단(활동 0 하트비트)과는 무관.
