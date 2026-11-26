# DIBAY 홈 슈퍼앱 개편 설계서 (2026-11-26 · Owner 「제안대로 승인」 D1~D5)

> 시안: `docs/marketing/home-redesign-20261126/v2-mobile.png` · `v2-tablet.png` (Owner 「B·C 혼합 + 일정한 배너 + 최근 통화 연동 + 모바일 배너 좌우 폭 + 태블릿 반반 + 필리핀↔한화 환율」 2026-11-26).
> 2026-11-26 Owner 「제안대로 승인」(D1~D5 제안대로). P1~P3 구현은 §11. P4(통화)는 D5 대로 따로.

---

## 0. 먼저 보고 — 기존 설계와 충돌 (Owner 결정 필요)

| # | 기존 승인 설계 | 이번 Owner 지시 | 처리 |
|---|---|---|---|
| C1 | `docs/dibay-app-home-ssot.md:13` 「개인 정보 칸 없음 — 지역이 같으면 모두 같은 화면, 개인 숫자는 머리글 종·하단 탭 배지만」 (v4, 2026-11-14) | 개인별로 주문 내역·통화 내역 등을 홈에 보여 줌 | 이번 지시가 뒤이므로 **이 설계로 SSOT 를 바꾸는 안**으로 작성. 승인 시 SSOT 같은 PR 에서 개정 |
| C2 | 같은 문서 「검색창 없음 (통합검색 = 라운지 머리글)」 | 시안 v2 태블릿에 검색창 | 모바일 = 검색 아이콘, 태블릿 = 검색창. 둘 다 **기존 통합검색 화면으로 이동**만 (새 검색 기능 없음) |
| C3 | 같은 문서 「옛 칸 진행 중 배달은 v4 에서 뺐다」 | 「내 진행 중」(주문·거래) | 이번 지시로 되살림 |
| C4 | `AGENTS.md` 통화 변경 규정 | 홈에 최근 통화 + 다시 걸기 | 통화 **코드는 바꾸지 않고 기존 API·기존 다시 걸기 경로만 호출**. 그래도 통화 목록 API 호출량이 늘므로 규정 3번(영향 분석·승인)을 §5-3 에 적고 **단독 단계(P4)** 로 분리 |

---

## 1. 화면 구성 (위 → 아래)

| 순서 | 칸 | 회원 | 비로그인 | 어드민 |
|---|---|---|---|---|
| H | 머리글: 로고(아이콘+dibaY) · 지역 칩 · 검색 · 종 | 지역 = 대표 주소, 종 배지 | 지역 = 「전체 지역」, 종 자리 = 「로그인」 | 지역 칩 보이기 (기존 `header.showAddress`) |
| ① | 정보 띠: 환율 + 날씨 (반반 두 칸) | 날씨 = 대표 주소 좌표 | 날씨 = 마닐라(기본 좌표) | 칸 보이기·비로그인 보이기 (신규 `sections.infoStrip`) |
| ② | 배너 (한 장씩, 화면 좌우 폭) | 대상 all·member | 대상 all·guest | 기존 배너 편집 그대로 (+ §4-2 기간 추가안) |
| ③ | 서비스 8칸 (4×2) | 그대로 | 로그인 필요 칸은 누르면 로그인 시트 | 기존 `services` 보이기·순서 |
| ④ | telRING 최근 통화·대화 | 최근 통화 3 + 안 읽은 대화 요약 | 「로그인하고 친구와 무료 통화」 안내 카드 | 칸 보이기 (신규 `sections.telring`) |
| ⑤ | 내 진행 중 (주문·거래) | 진행 중 있을 때만 표시 | 숨김 | 칸 보이기 (신규 `sections.myActivity`) |
| ⑥ | 공지 한 줄 | 기존 | 기존 | 기존 |
| ⑦ | 피드 선반 (마켓 · DIPICK 맛집 · 정보 공유) | 기존 `HomeDiscoverFeed` | 기존 (DIPICK 은 기존 로그인 안내 카드) | 기존 |

- 칸 순서는 지금처럼 **코드 고정**(`HOME_SECTION_KEYS`), 어드민은 보이기만.
- 서비스 8칸: 정보 공유 · 마켓 · 모임 · DIPICK · telRING · 이벤트 · 환율 계산 · 전체. 지금의 큰 초록 telRING 칸은 ④ 로 옮기고, ③ 은 **같은 크기 8칸**.
- 「환율 계산」 칸 = 신규 바텀시트(₱↔₩ 계산기). 새 페이지 없음.

---

## 2. 배치 (모바일·태블릿) — 숫자로 고정

기준은 지금처럼 **홈 열 폭 container query**(`homer3`, `app/home-hub.css:337`). 측면 레일이 있어도 홈 열 폭 기준이라 같다.

| 홈 열 폭 | 배치 |
|---|---|
| < 600 (휴대폰) | 1열. 위 표 순서 그대로 |
| 600 – 1023 (태블릿 세로) | **2열 50:50** `grid-template-columns: minmax(0,1fr) minmax(0,1fr)`, 간격 16px. 1행 = ② 배너 \| ③ 서비스, 2행 = ④ telRING \| ① 정보 띠 + ⑤ 내 진행 중(세로로 쌓음). 피드는 2열 아래 전체 폭 |
| ≥ 1024 (태블릿 가로·PC) | 같은 2열 50:50, 간격 20px, 최대 폭 1240 (기존) |

- **반반 정확히**: `1fr 1fr` + `minmax(0,…)` 로 내용 길이와 무관하게 같은 폭. 같은 행의 두 칸은 `align-items: stretch` 로 **같은 높이**. 지금의 `1.75fr / 1fr`(`app/home-hub.css:467`)는 삭제.
- 태블릿 1행 높이 = 서비스 4×2 칸 높이에 맞추고 배너는 그 높이를 채운다(이미지 `object-fit: cover`, 지금의 ≥1024 규칙 `min-height:300px` 방식 재사용).
- 측면 레일·하단 탭 결정은 기존(`lib/device/dibay-shell-resolver.ts`) 그대로.

### 2-1. 배너 — 모바일에서 옆 배너 보이는 문제

- 원인(코드 확인): `app/home-hub.css:56-58` `.home-hero-track[data-multi] .home-hero-card { width: calc(100% - 28px) }` + 트랙 좌우 16px 여백 + 카드 간격 12px → 다음 카드 약 16px 보임. 600 이상은 `78%`(:237).
- 고침: 모든 폭에서 **카드 폭 = 배너 칸 폭 100%**, 트랙 `padding-inline:0`, `gap:0`, `scroll-snap-align:start`. 모바일은 화면 좌우 끝까지(기존 음수 여백 `.home-r3-banner` 유지).
- 장 수 표시 = 배너 안 오른쪽 아래 「1 / 3」(기존 카운터 재사용). 점(dots)은 숨김. 「전체보기」 시트는 유지.
- 비율: 휴대폰 16:9 고정 (지금 16:10 → 16:9, 어드민 업로드 기준과 같음). 태블릿은 §2 대로 칸 높이 채움.
- 자동 넘김 4초·멈춤 조건(손가락·화면 밖·앱 뒤·동작 줄이기) 기존 그대로(`HomeBanner.tsx:23,126-146`).

---

## 3. 칸별 상세 — 데이터·눌렀을 때·상태

공통 상태: **불러오는 중** = 칸 높이 고정 회색 뼈대(레이아웃 흔들림 없음) · **실패** = 칸 안 「다시 시도」 · **빈 상태** = 칸별 문구(아래).

### ① 정보 띠

| 항목 | 환율 | 날씨 |
|---|---|---|
| 표시 | 「1 PHP = 21.05원」 + 전일 대비 ▲▼% + 기준일(예: 11.25) | 「Pasig ☀ 31° 맑음」 |
| 데이터 | 기존 `GET /api/exchange-rates` (Frankfurter·ECB, Supabase 0회). **변경**: 응답에 `prevKRW`, `date` 추가(전 영업일 조회 1회, 같은 캐시 300초) | **신규** `GET /api/weather?lat&lng` — Open-Meteo(키 없음). 좌표 소수 2자리로 줄여 보냄, 응답 캐시 30분(`s-maxage=1800`) |
| 좌표 | — | 회원 = 대표 주소 `latitude/longitude`(기존 `/api/me/address-defaults`), 없으면·비로그인 = 마닐라 14.60,120.98 |
| 누르면 | 환율 계산 시트 (₱ 입력 ↔ ₩ 자동, 반대도) | 아무 동작 없음(장식 아님 표시 위해 누름 효과 없음) |
| 실패 | 칸 숨기지 않고 「환율 정보를 불러오지 못했어요」 | 날씨 칸만 숨기고 환율 칸이 전체 폭 |

- ECB 는 영업일 하루 1회 갱신 → 「실시간」이라고 쓰지 않고 **기준일**을 함께 표시.

### ② 배너 — §2-1, 어드민 §4-2

| 누르면 | 기존과 동일: `href` 로 이동, 로그인 필요 메뉴면 로그인 시트(`HomeBanner.tsx:152-159`) |
|---|---|

### ③ 서비스 8칸 — 기존 `HOME_MENU_CATALOG` 그대로

| 칸 | 이동 | 비로그인 |
|---|---|---|
| 정보 공유 | `/philife` | 열림 |
| 마켓 | `/market` | 열림 |
| 모임 | `/moim` | 열림 |
| DIPICK | `/stores` | 열림 |
| telRING | `/community-messenger?section=chats` | 로그인 시트(`messenger_open`) |
| 이벤트 | `/events` | 열림 |
| 환율 계산 | 환율 계산 시트(신규) | 열림 |
| 전체 | `/services` | 열림 |

- 배지: telRING 칸 = 안 읽은 대화 수(`badge-count.projection.bottomChatTotal`, 기존 값 재사용 — 새 요청 없음).

### ④ telRING 최근 통화·대화

| 항목 | 내용 |
|---|---|
| 머리 | 「telRING 최근 통화·대화」 + 「전체보기 ›」 → `/community-messenger?section=call_logs` |
| 줄(최대 3) | 아바타 · 이름 · 종류 아이콘(영상/음성) · 「영상 통화 12분」/「부재중 통화」(빨강) · 상대 시각 · 오른쪽 **다시 걸기** 버튼(영상 통화면 영상, 음성이면 음성) |
| 데이터 | 기존 `GET /api/community-messenger/calls` 첫 페이지에서 앞 3건만 사용. 기존 클라이언트 `fetchCommunityMessengerCallLogsClient`(단일 요청·60초 신선도) 를 **수정 없이 호출**. 표시 문구는 기존 `presentCallHistoryRow`·`call-duration-label` 재사용 |
| 줄 누르면 | 그 대화방 열기(`roomId`) |
| 다시 걸기 | 기존 통화 탭과 **같은 경로** — 선택 시트 → `guardInstantOutgoingCallStart` → `POST /calls/redial-room` → `launchOutgoingDirectCall`. 새 경로 없음 |
| 부재중 | 부재중 줄이 보이면 읽음 처리하지 않는다(읽음 = 통화 탭에서만, 기존 규칙 유지) |
| 실시간 | 홈에서는 통화 실시간 구독을 **새로 열지 않는다**. 홈에 다시 들어오거나 당겨서 새로고침할 때 다시 읽음(60초 신선도 안이면 캐시) |
| 아래 버튼 | 「채팅」 → 대화 목록, 「통화」 → 통화 목록 (지금 telRING 칸 버튼 그대로) |
| 빈 상태 | 「아직 통화 기록이 없어요 · 친구와 통화해 보세요」 + 「친구 찾기」 → `/community-messenger?section=friends` |
| 비로그인 | 「로그인하고 친구와 채팅·통화하세요」 + 「로그인」(`buildLoginHref("/home")`) |
| 통화 중 | 내가 통화 중이면(`useOwnLiveCall`) 다시 걸기 버튼 비활성 + 「통화 중」 표시 |

### ⑤ 내 진행 중 (회원 · 진행 중 있을 때만)

| 줄 | 데이터 | 표시 | 누르면 |
|---|---|---|---|
| 주문 | 기존 `GET /api/me/store-orders?hub_summary=1` (`activeOrders`, `recent`) — 기존 클라이언트 `fetchMeStoreOrdersHubSummaryDeduped` | 「주문 {매장} · {단계}」 단계 이름은 **`store-order-process-model.ts` 의 `orderStatusName` 만** 사용(다른 표 금지) | 그 주문 상세 `/orders/store/{id}` (2건 이상이면 「주문 n건 진행 중」 → `/orders`) |
| 거래 | 새 요청 없이 ④ 와 같은 home-sync 결과가 있으면 그 안 거래 방(`contextMeta.kind="trade"`, 거래 끝나지 않은 것) 개수·첫 상품명. 없으면 줄 숨김 | 「거래 중 n건 · {상품명}」 | 그 거래 채팅방 / 2건 이상이면 거래 채팅 목록 |

- 둘 다 0건이면 칸 전체 숨김(빈 칸 안 보임).
- 「도착 15분」 같은 예상 시간은 **지금 데이터에 없음** → 표시하지 않는다(시안의 「도착 15분」은 빼고 단계 이름만).

### ⑥ 공지 · ⑦ 피드 — 기존 그대로(`HomeNoticeLine`, `HomeDiscoverFeed`)

---

## 4. 어드민

### 4-1. 칸 보이기 (기존 `admin_settings.home_layout` 확장, schemaVersion 2 유지·필드 추가)

| 신규 키 | visible | guestVisible | 기본값 |
|---|---|---|---|
| `sections.infoStrip` | ✓ | ✓ | 둘 다 켬 |
| `sections.telring` | ✓ | ✓ (비로그인 = 안내 카드) | 둘 다 켬 |
| `sections.myActivity` | ✓ | — (비로그인 항상 숨김) | 켬 |

- 저장은 기존 `PUT /api/admin/home-layout` (revision 409 잠금·감사 로그·`revalidateTag("home-layout")`) 그대로. 옛 저장값에 키가 없으면 기본값(`normalizeHomeLayout`).
- 어드민 화면 「섹션」 탭에 세 줄 추가. 미리보기(375/768/1100)는 새 배치로.

### 4-2. 배너

- 지금 편집 가능: 이미지(16:9 업로드), 칩·제목·본문·버튼 문구(ko/en), 이동 주소, 대상(전체·회원·비로그인), 보이기, 「광고」 표시, 순서(위·아래), 최대 10장.
- **추가 제안**: 게시 기간 `startsAt`/`endsAt`(PHT 입력, UTC 저장, 기간 밖이면 앱에서 안 보임). 지금은 기간 필드가 없음 — **Owner 결정 필요(D3)**.
- 운영 배너 값은 이번 작업에서 **바꾸지 않는다**(시험 저장 금지).

---

## 5. 눌림 · 진동 · 소리

### 5-1. 공통 규칙 (홈의 모든 누를 수 있는 것)

| 항목 | 규칙 | 근거·재사용 |
|---|---|---|
| 눈에 보이는 눌림 | 하나로 통일: **0.97 축소 + 배경 `--sam-pressed-surface`**, 120ms. 지금 홈은 0.97/0.985 축소·0.7/0.8 흐림이 섞여 있음(`app/home-hub.css:63,388,417,447,531,722…`) → `.sam-press` 계열 하나로 | `app/samarket-components.css:797-834` |
| 진동 | 누를 때 **가벼운 진동 1회**. iPhone·Android 모두 네이티브 `@capacitor/haptics` `impact(Light)` — 이미 앱에 설치됨(`package.json`, iOS `HapticsPlugin`) → **웹 변경만, 네이티브 빌드 불필요**. 플러그인 없는 옛 앱·웹은 `navigator.vibrate(10)`(iPhone 웹은 무진동) | `lib/ui/light-tap-feedback.ts:112-170` 패턴 |
| 소리 | 누를 때 짧은 클릭음(기존 920Hz 55ms) | `playLightTapClickSound` (`light-tap-feedback.ts:28-52`) |
| 끄기 | 진동 = 내정보 알림 설정 `vibration_enabled` 가 꺼져 있으면 안 함 · 소리 = `sound_enabled` 꺼져 있으면 안 함 (기존 설정 재사용, 새 설정 없음) | `NotificationsSettingsContent.tsx` |
| 통화 중 | 내가 통화 중이면 소리 없음(진동만) | 머리글 뒤로 버튼 방식(`lib/ui/header-back-press-feedback.ts`, `lib/call/own-live-call.ts` 를 정적 import 하지 않음) |
| 동작 줄이기 | 축소 애니메이션 끔, 진동·소리는 유지 | 기존 reduced-motion 규칙 |
| 마우스(PC) | 진동·소리 없음, 눈 눌림만 | 기존 helper 의 touch 판정 |
| 크기·접근성 | 누를 곳 최소 44×44 · 아이콘만 있는 버튼 `aria-label` · `:focus-visible` 테두리 추가(지금 홈에 없음) | `docs/customer-platform/04-DESIGN-SYSTEM.md` |

### 5-2. 칸별 피드백 종류

| 대상 | 진동 | 소리 |
|---|---|---|
| 서비스 칸·배너·피드 카드·전체보기·지역 칩·종 | 가벼움(light) | 클릭음 |
| 다시 걸기 | 가벼움 | **없음**(통화 화면 소리와 겹치지 않게) |
| 환율 시트 숫자 입력 | 없음 | 없음 |
| 배너 손으로 넘김 | 장 바뀔 때 selection 1회 | 없음 |
| 당겨서 새로고침 | 시작 시 light 1회 | 없음 |

- 새 helper: `lib/ui/home-press-feedback.ts` (위 표를 한곳에서 결정). 홈 컴포넌트는 이것만 호출.

### 5-3. 통화 변경 규정 영향 분석 (④ 다시 걸기·최근 통화)

| 항목 | 내용 |
|---|---|
| 바꾸는 통화 파일 | **없음** (call-history·redial·launch·call API·service.ts 통화 함수 무수정) |
| 바뀌는 동작 | 홈을 열 때 `GET /api/community-messenger/calls` 1회 추가(60초 신선도·단일 요청) |
| 영향 경로 | 발신 시작(홈에서 다시 걸기 → 기존 경로) · 통화 목록 서버 부하. 수신·CallKit·FCM·VoIP·종료·부재중 처리 무관 |
| 구 바이너리 | 웹만 변경 → 설치 앱 재시작으로 반영. 네이티브 무관 |
| 위험 | ① 통화 목록 API 는 hydrate 가 무거움(`service.ts:4852`) → 요청 예산 미등록 라우트가 홈 트래픽만큼 늘어남 ② 다시 걸기 버튼이 통화 탭과 다르게 동작하면 혼란 |
| 대응 | ① 예산 표에 등록하고 하루 1회 감시로 확인, 늘면 홈 전용 가벼운 API(최근 3건)를 **별도 통화 단계**로 설계 ② 다시 걸기 = 통화 탭 함수 그대로 호출 |
| 롤백 | 어드민 `sections.telring` 끄기(즉시) 또는 P4 PR 되돌리기 |
| 실기기 검증 | Android↔iPhone: 홈에서 음성·영상 다시 걸기 → 상대 수신·연결·종료 · 통화 중 홈 버튼 비활성 · 부재중 표시 후 통화 탭 읽음 처리 정상 |

---

## 6. 운영 요청 수 (회원이 홈을 한 번 열 때)

| 요청 | Supabase 호출(예산 표) | 지금 | 개편 후 |
|---|---|---|---|
| 홈 레이아웃·카탈로그 | 서버 캐시 | 있음 | 그대로 |
| badge-count | 5.2 | 있음(전역) | 그대로(재사용) |
| address-defaults | 1.1 | 있음 | 그대로(날씨 좌표 재사용) |
| exchange-rates | 0 (외부) | 없음 | +1 (캐시 300초) |
| weather (신규) | 0 (외부) | 없음 | +1 (캐시 30분) |
| calls 첫 페이지 | **미등록** | 없음 | +1 (60초 신선도) |
| home-sync tier=critical | 5.0 | 없음 | +1 (엣지 캐시 5초) — 거래 진행 중용 |
| store-orders hub_summary | **미등록** | 없음 | +1 |
| 피드(마켓·정보 공유·매장) | 7.8 / 4.0 / 10.5+2.2 | 있음 | 그대로 |

- 미등록 2개(`/api/community-messenger/calls`, `/api/me/store-orders`)는 **같은 PR 에서 `lib/perf/request-budget.ts` 에 실측값으로 등록**(`docs/request-budget-ssot.md` §3–4).
- 비로그인은 exchange-rates·weather 2개만 추가(둘 다 Supabase 0).
- home-sync 를 홈에서 부르는 대신 거래 줄을 빼면 +1 줄어듦 → D4.

---

## 7. 문구(i18n)

- 새 키는 `lib/i18n/catalog/home-hub.ts` 에 ko·en 동시: `home_info_rate_label`, `home_info_rate_base_date`, `home_info_weather_*`, `home_rate_calc_*`, `home_telring_recent_title`, `home_telring_empty_*`, `home_telring_guest_*`, `home_telring_in_call`, `home_my_activity_title`, `home_my_order_one`, `home_my_order_many`, `home_my_trade_*`, `home_menu_rate_calc`.
- 통화 종류·시간 문구는 기존 call-history presenter 문구 재사용(새로 만들지 않음).
- `npm run check:i18n-quality` 통과.

---

## 8. 바뀌는 파일 (단계별 · 각 단계 끝에 화면이 깨지지 않게)

| 단계 | 내용 | 파일 | 통화 규정 |
|---|---|---|---|
| P1 | 배치·배너·눌림 통일 (데이터 변경 없음) | `app/home-hub.css`, `components/home-hub/HomeScreen.tsx`, `HomeBanner.tsx`, `HomeServiceCards.tsx`(8칸, telRING 큰 칸 제거 → P3 전까지는 지금 telRING 칸을 ④ 자리에 그대로 둠), `lib/ui/home-press-feedback.ts`(신규) | 무관 |
| P2 | 정보 띠·환율 계산 시트·날씨 | `app/api/exchange-rates/route.ts`(prev·date), `app/api/weather/route.ts`(신규), `components/home-hub/HomeInfoStrip.tsx`·`HomeRateCalcSheet.tsx`(신규), `lib/home/home-layout-contract.ts`(sections 추가), 어드민 섹션 탭 | 무관 |
| P3 | 내 진행 중 | `components/home-hub/HomeMyActivity.tsx`(신규), `lib/perf/request-budget.ts`(store-orders 등록) | 무관 |
| P4 | telRING 최근 통화·대화 + 다시 걸기 | `components/home-hub/HomeTelringRecent.tsx`(신규), `lib/perf/request-budget.ts`(calls 등록) | **적용 — 단독 PR, 자동 병합 없음, 실기기 행렬 PASS 후 병합** |
| 문서 | SSOT 개정 | `docs/dibay-app-home-ssot.md` | — |

- 각 PR: `typecheck:build`, 관련 vitest(레이아웃 계약·환율 라우트·피드백 helper), `verify:design-system-hard-lock`, `check:i18n-quality`, 변경 파일 eslint.
- 실기기: Samsung·Xiaomi·iPhone 에서 모바일 배너 좌우 폭·태블릿(가로·세로) 반반·진동·소리·비로그인 화면 확인. 앱 실행 상한 10회 안.
- 배포 구분: **웹만**(네이티브 빌드 없음).

---

## 9. Owner 결정 필요

| # | 내용 | 제안 |
|---|---|---|
| D1 | 홈 SSOT 「개인 정보 칸 없음」 해제 (C1) | 해제 |
| D2 | 날씨 — 외부 서비스(Open-Meteo)에 대략 좌표(소수 2자리) 전송 | 허용 |
| D3 | 배너 게시 기간 필드 추가 | 추가 |
| D4 | 「거래 중」 줄을 위해 홈에서 home-sync 호출(+1 요청) | 포함 |
| D5 | P4(통화) 를 P1~P3 와 분리해 나중에 진행 | 분리 |

---

## 10. 확인하지 못한 것 (NOT_PROVEN)

- 통화 목록 API 실제 Supabase 호출 수(예산 미등록 — 실측 필요).
- 홈 개편 후 실제 화면(구현 전이라 시안만).
- iPad 실기기에서 반반 배치(구현 후 확인).

---

## 11. 구현 기록 (P1~P3 · 2026-11-26)

| 항목 | 설계와 다른 점 · 이유 |
|---|---|
| 주문 줄 이동 | 설계 `/orders/store/{id}` → 실제 주문 상세 경로 `buyerStoreOrderDetailPath` = `/orders?expand={id}` (`/orders/store/{id}` 는 채팅·후기만 있음) |
| 주문 단계 | 주문 요약 API 에 `fulfillment_type`·`firstActive`(가장 최근 진행 중 주문) 추가 — `orderStatusName` 에 주문 방식이 필요. 매장 이름 조회는 1회 그대로(`.in`) |
| 서비스 8칸 순서 | 어드민 저장 순서를 따른다(운영 11-26 조회: 마켓·DIPICK·정보 공유·(모임)·telRING·이벤트) + 환율 계산 + 전체. 운영 설정은 바꾸지 않음 |
| 환율 | 시계열 1회(`/{10일 전}..`)로 마지막 두 영업일 — 요청 수 그대로. 주소 `api.frankfurter.dev/v1`(옛 주소 301) |
| 예산 | `/api/me/store-orders` 6.0 등록(계수기 7일 3.34 · hub_summary 코드 계산 4~6). calls 는 P4 에서 |
| 종(알림) 누름 | 공용 부품 `Tier1NotificationAnchor` 라 이번 범위에서 진동·소리 추가 안 함 |
| 검색(C2) | 머리글 검색 버튼 — 휴대폰 아이콘 44×44 · 홈 폭 600 이상 검색 알약. 둘 다 `openGlobalSearchFromHere`(기존 통합검색)로만 이동 |
