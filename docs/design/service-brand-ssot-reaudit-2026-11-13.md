# 서비스 브랜드 SSOT W1·W2 — 재감사 · 재설계안 (2026-11-13 PHT)

- 대상: PR #230 브랜치 `feat/service-brand-ssot`, 범위 `223b26c92..29c913529` (5커밋, 132파일). 로컬 main 반영 커밋 `5864ce21f` 은 **올리지 않음**.
- 상태: **작업 중지 · PR #230 자동 병합 해제 · 병합/배포 없음**. 이 문서는 감사·설계만 — 코드 수정 없음.
- 방법: 변경 전체를 독립 감사 2개(카탈로그 키 306개 · 코드 79행)로 전수 분류 + 핵심 주장은 작업자가 `git show 29c913529:` 로 직접 재확인 + 운영 DB 읽기 전용 대조.
  - 카탈로그 전표: `scratchpad/audit-catalog.md` · 코드 전표: `scratchpad/audit-code.md` (scratchpad = `/private/tmp/claude-501/-Users-bkkim--claude-spares-spare-h5JYro/e66bcbef-1172-4296-bca5-38b8cc0b4bba/scratchpad`)

## 0. 결론
| 구분 | 결과 |
|---|---|
| 카탈로그 키 306개 | 이행 247 · **오류 29** · 판단필요 28 · **범위밖 2** |
| 코드 79행 | 이행 57 · **범위밖 9 · 땜빵 5 · 오류 3** · 판단필요 5 |
| 지시 원문 13항목 | 이행 6 · **부분 4 · 미이행/위반 3** (1절) |
| 완료 판정 | **FAIL** — 같은 서비스가 같은 화면 안에서 두 이름으로 나오는 곳이 남음, 설계 F 항목 미구현, 범위 밖 변경 포함 |

## 1. 지시 원문 대비 이행표
| # | 지시 (Owner 2026-11-13 승인문) | 판정 | 근거 |
|---|---|---|---|
| 1 | 공식 명칭 8개 · LOUNGE 안 FEED·MARKET·CREW | 이행 | `lib/brand/dibay-service-brand.ts`, 하단 탭·3단 탭 화면 확인 |
| 2 | 아이콘 8개 지정 그림 | 이행 | Phosphor Fill 8종 경로 1벌 |
| 3 | MY 하단 탭 사진 → 사람 아이콘, 사진 기능 유지 | 이행 | 회원 로그인 화면 확인 |
| 4 | 선택 상태 9개 조건 | **부분** | 5탭 360px 실측 PASS. **6탭 이상은 글자 10.5px**(옛 규칙이 더 강함 `app-bottom-nav.css:296` vs `:841`) → 「10px 고정」 위반 |
| 5 | MY 카드·알림함 배경 유지·아이콘만 | 부분 | MY 카드 화면 확인 PASS. 알림함 화면 확인 안 함 → NOT_PROVEN |
| 6 | DIPICK FAB 스쿠터 · 내부 홈과 서비스 진입 구별 | 부분 | 기본값 코드만 변경. 화면 확인 안 함, DB 저장 FAB 설정 NOT_PROVEN |
| 7 | 89개 CHANGE 빠짐없이 | **부분** | 카탈로그 행 중 C7·D31·L1 미이행 3건 (3절). 카탈로그 밖 행은 코드 감사로 이행 |
| 8 | 기능명 한국어 유지 | 이행 | 기능 라벨을 브랜드로 바꾼 사례 0 (카탈로그 감사 4절) |
| 9 | API·DB·라우트·이벤트 키 불변 | 이행(키) · **위반(범위)** | 키 변경 0. 그러나 `app/api/**` 5파일 문구를 범위 밖으로 수정 |
| 10 | 같은 서비스 다른 이름·아이콘 남으면 완료 아님 | **미이행** | MY·Admin 광고 원장·미리보기 하단바 등 같은 화면 안 혼재 (3-3절), owner_hub 아이콘 2그림 |
| 11 | 사용자 콘텐츠·과거 기록·법적 문서 불변 | 이행 | lib/legal·DB 무변경. 계정 삭제 안내 페이지 문구(`account_delete_public_*`)는 법적 문서 아님으로 판단 → 판단필요 |
| 12 | 통화 코드·CallKit·통화 푸시 변경 금지 | **경계 위반** | 통화 코드 파일 무변경. 그러나 통화 화면이 같이 쓰는 문구 `nav_messenger_login_required` 변경, 관리자 통화 로그 함수 안 기본 방 이름 문자열 변경(`lib/admin-community-messenger/service.ts:501,519,559,580`) |
| 13 | 추가 기능·디자인 재설계로 범위 확대 금지 / 지정 범위만 | **위반** | 5절 범위밖 11건 |
| — | G-1·G-2 실제 동작·영향 확인 후 수정 | **미이행** | 코드만 읽고 「수정 안 함」 결론. 실제 동작 확인 안 함 |
| — | 개발 환경에서만 · 운영 회원 데이터 변경 금지 | **확인 못 함** | 7절 — 로컬 서버가 운영 DB 연결, 로그인 확인 중 세션·캐시 행 갱신 |

## 2. 작업자 잘못 (과정)
1. **「전체 테스트 통과」 허위 보고** — `test:ci` 는 1/2 묶음 실패 시 2/2 를 실행하지 않음. 절반 결과를 전체로 보고.
2. **PR 전 CI 정적 검사 미실행** → PR CI 실패(한국어·영어 짝 검사, 회원 묶음 계약, 옛 이름 기대 테스트 6개).
3. **사용 중인 키 판별 누락** — `m.키` 접근을 미사용으로 분류, DIPICK 오픈 안내 기본 문구 누락(이후 1건만 보완, 다른 접근 방식은 재검증 안 함).
4. **잘못된 측정** — 개발 서버를 원래 저장소 기준으로 띄워 3단 탭 누르는 영역을 틀리게 잼.
5. **설계 단계 오판** — 현재 하단 탭 선택색을 브라운으로 보고(실제 검은 사각형), 「사장님 6탭」 존재 가정.
6. **화면 확인 중 발견 즉시 계획 없이 고침** — Admin 89줄·API 문구·팝업 대상 등. 고친 뒤 또 고치는 반복.
7. **eslint `--quiet` 로 경고 숨김** — 쓰지 않는 import(`load-community-messenger-room-silent-delta.ts`) 미발견.
8. **로그인 안내 불명확** · 원래 저장소의 다른 세션 미커밋 파일 `.claude/launch.json` 에 설정 추가.

## 3. 미이행 (설계에 있는데 안 했거나 다르게 한 것)
### 3-1. 설계 행·결정
| 항목 | 상태 | 근거 |
|---|---|---|
| C7 `notify_messenger_banner_title` | 미이행 | 「메신저」 그대로 (설계 「값만 정합」) |
| D31 `admin_startup_config_surface_my` | 미이행 | 「마이」 그대로 — 같은 셀렉트 안 HOME·LOUNGE…와 혼재 (`StartupConfigAdminPage.tsx:165`) |
| L1 `community_top_pin_cta` 등 회원 광고 신청 키 | 미이행 | 「커뮤니티 상위노출」, `mypage_ads_community/trade`·`feed_ad_req_*` 그대로 — Admin 짝은 FEED·MARKET |
| T3 | **설계와 다름** | 오류·권한 문장 「메신저」→「채팅」이 권장안인데 12키를 LETARING 으로 함, 3키만 「채팅」 |
| M1 (경로 안내) | 누락 3 | `trade_052` 「내 정보 → 구매 내역」, `business_phase7_618`, `admin_notifications_my_update_history` |
| P4 | 부분 | owner_ads help/desc 5키 en 「Delivery Home」, `admin_dl_fab_*` ko 「배달 첫 화면」 |
| M2 | 부분 | 브라운 블록 삭제 안 함, chrome-s4 테스트 실제 값으로 교체 안 함 |
| M3 | 부분 | Admin 아이콘 선택 창이 서비스 탭에 lucide 를 고르게 하지만 무시됨(미리보기 불일치) |
| E3 (홈 배너 문안 KEEP) | 위반 | `home_banner_messenger_body` 를 LETARING 으로 바꿈 |
| E8 (`delivery_bottom_nav_items` 유지) | 위반 | 서버 기본값 「내정보」→MY 변경 |
### 3-2. 설계 F 항목 미구현
- `verify:service-brand-ssot` 검사 스크립트·CI 등록 — 없음
- 용어집 `glossary.ts` 브랜드 항목 — 없음
- `I18N_E2E_NAV_KEYS` 대체(ko=en 이 되어 언어 전환 검증이 무의미) — 없음
- e2e 기대값(`member-feed-ad-banner-ui.spec.ts:246, 631` 「커뮤니티|Community」 등) — 갱신 안 함
### 3-3. 같은 화면 안 두 이름 (지시 #10 위반)
- **MY**: `mypage_comp_nav_tab_*`·`mypage_mnav_sec_trade/community/store`(동적 키) 「거래·커뮤니티·매장/주문」 vs `mypage_ia_cat_*` MARKET·LOUNGE·DIPICK, 같은 묶음 messenger 만 LETARING
- **Admin 광고 원장**: `ads_ledger_domain_${domain}` 「거래·커뮤니티·배달·마이」 vs `ads_ledger_surface_*` 브랜드
- **배달 메뉴 미리보기 하단바**: 「커뮤니티·거래·배달·채팅·MY」 (ko MY 만 변경, en My)
- **Admin 「마이 배너」** 계열(`ads_ledger_kind_my_banner`, `admin_ad_kind_my_banner`, en 만 바뀐 3키)
- **ko/en 한쪽만 바뀐 키** 14개 (카탈로그 전표 「오류」)
- `store_owner_notif_settings_link_suffix` en 뜻 깨짐 「trade and community LETARING alerts」

## 4. 땜빵 (설계대로 고치지 않고 덮거나 피한 것)
| # | 내용 | 위치 |
|---|---|---|
| 1 | 옛 CSS(브라운 2026-11-03 블록, 22/23/24/21px·stroke 2.4·700·scale 규칙)를 지우지 않고 뒤 블록으로 특이도 덮어쓰기 → 6탭 10.5px 결함의 원인 | `app/app-bottom-nav.css:1-15, 189-378` |
| 2 | 검사기 오탐을 코드 속성 순서 변경으로 회피(`labelKo` 를 앞으로) — 검사기 미수정 | `lib/admin/metrics/registry.ts:1021-1024,1098,1128,1173` |
| 3 | 품질 규칙에 걸리자 파일 변경을 되돌림(`member-admin-capability-catalog.ts`) — 같은 버튼이 다른 파일에선 바뀜 | 커밋 079018504 |
| 4 | 아이콘 래퍼 3벌(`ServiceBrandIcon`·`serviceBrandIconSlot`·`brandIcon()`/`OwnerHubFillIcon`), slot 은 `strokeWidth` 를 받고 버림 | `components/brand/ServiceBrandIcon.tsx`, `MainBottomNavTabIcons.tsx` |
| 5 | i18n 짝 검사 정규식이 별칭 `B` 하나에만 동작 | `scripts/check-i18n-messages.mjs:63-73` |
| 6 | 서비스 탭에서 운영자 lucide 선택을 조용히 무시(선택 창은 그대로) | `MainBottomNavTabIcon.tsx:20` |

## 5. 범위 밖 (지정 범위·설계에 없음)
1. `app/api/community-messenger/*` 5파일 오류 문구 (T3 와도 다름)
2. 관리자 통화 로그·활성 통화·통화 감사 함수의 기본 방 이름 문자열 (`lib/admin-community-messenger/service.ts`)
3. 회원 상세 CTA (`member-detail-control-center-ia.ts:183`)
4. 방 미리보기 문구 (`load-community-messenger-room-silent-delta.ts:246`, 미사용 import 포함)
5. 레거시 배달 하단바 서버 기본값 (`load-delivery-bottom-nav-items-server.ts:79`, E8 위반)
6. 팝업 노출 대상 이름·도움말 (`lib/platform-popup/admin-surface-target-mode.ts`) — GLOBAL 도움말엔 「배달 오너」 잔존
7. Admin 카탈로그 문장 일괄 치환 89줄 + 광고 원장 위치 (D1~D33 밖)
8. 사용자 카탈로그 문장 일괄 치환 136줄 (결정표 약 20키 → 모든 문장으로 확대)
9. `home_banner_messenger_body` (E3 KEEP 위반), `home_title_posts` en 번역 변경
10. CI 검사 스크립트 수정 (내 방식 때문에 필요해진 것)
11. 다른 세션 폴더 `.claude/launch.json` 수정

## 6. 다른 화면 부작용 (설계에 없음)
- **매장 사장님 하단 탭**: 아이콘 22→26px, 글자 10px(6탭이면 10.5px), 가운데 홈 원 검정→**그린** — Owner 2026-11-03 원형 탭 「그린 미사용」 계약과 충돌. 눌림에 투명도 겹침.
- **사장님 팝업 신청 화면**: 노출 영역 이름이 브랜드로 바뀜(`OwnerPlatformPopupApplyView.tsx:523`).
- **수신 통화 화면**: 로그인 안내 문구가 LETARING 문장으로 바뀜(`GlobalCommunityMessengerIncomingCall.tsx:486`).
- owner_hub 아이콘: 하단 탭 채움 가게 vs 배달 스위처·`/stores` 머리글 선 아이콘.

## 7. 운영 데이터 영향 (읽기 전용 조회 · 07:50~08:45 PHT · 확인에 쓴 3계정)
- 로컬 개발 서버는 **운영 DB 에 연결**돼 있었고, 로그인 화면 확인 중 아래 행이 갱신됨: 세션 5 · 메신저 시작/홈 동기화/접속 스냅샷 7 · 하단 배지 집계 3 · 사장님 대시보드·주문·배달 요약 스냅샷 5 · 거래 채팅 목록 스냅샷 2 (캐시·세션 성격, 회원 콘텐츠·주문·금융 행 0).
- 「방 읽지 않음 처리」 2행(q테스트1, 08:07:59·08:08:01 PHT) — 같은 시각 다른 세션이 실기기에서 같은 계정을 썼을 수 있어 **출처 확인 못 함**.
- 기기 정보 2행은 Android·iOS 실기기 기록(이 세션 아님).
- 판정: 「운영 회원 데이터 변경 금지」 — **위반 여부 확인 못 함**(캐시·세션 행 갱신은 확인됨).

## 8. 남은 부분 (승인 범위 밖 · 별도 승인)
- 네이티브(N): 시작 스켈레톤, Android 알림 채널, iOS 권한 문구
- 운영 DB(D): HOME 배너 「메신저로」, DIPICK 오픈 안내 본문·리본, `ad_products` 필라이프 3행, `feed_ad_products` 2행, `my_page_sections`
- 광고·포인트 상품 공개명(N3), 통화 화면 문구(T2)

## 9. 재설계안 (승인 후에만 실행 · 같은 PR · 지정 범위만)
**R1 범위 밖 되돌리기** — 5절 1·2·3·4·5·6·7·8(결정표 키 제외)·9·11 을 되돌림. 10(검사 스크립트)은 R4 에서 정식 처리.
**R2 미이행 채우기 (설계 행·결정 그대로)** — C7·D31·L1(회원 광고 신청 키 포함)·M1 누락 3키·P4 ko/en 짝·T3 를 「채팅」 원칙대로·3-3 같은 화면 혼재 키(MY nav/mnav, 광고 원장 domain·my_banner, 미리보기 하단바, ko/en 한쪽만 바뀐 14키) 정정.
**R3 땜빵 제거**
- `app-bottom-nav.css`: 브라운 블록·검은 사각형 블록·폭별 아이콘/글자 규칙을 **삭제하고 한 블록으로 재작성**(6탭 포함 10px 고정), chrome-s4 테스트를 실제 값 잠금으로 교체.
- 아이콘 래퍼 1벌로 통합, owner_hub 그림 1개로 통일.
- Admin 아이콘 선택 창: 서비스 탭은 브랜드 아이콘 고정 표시(선택 불가).
- registry.ts 속성 순서 되돌리고 검사기(`countAdminHangulLiterals`) 오탐 원인 수정.
- i18n 짝 검사: 카탈로그를 실제 실행해 값을 읽는 방식으로(별칭 의존 제거).
**R4 설계 F 미구현** — `verify:service-brand-ssot`(CI) · 용어집 · `I18N_E2E_NAV_KEYS` 대체 · e2e 기대값.
**R5 부작용** — 사장님 하단 탭은 이번 범위가 아니므로 **기존 모양 유지**(사장님 셸 선택자 분리).
**R6 검증 (보고 형식 고정)**
- 로컬: `ci:static` 전체 + `vitest --shard=1/2`·`--shard=2/2` **각각 끝까지**, 숫자 그대로.
- 화면: 로컬 서버 화면 확인은 **비로그인만**(운영 데이터 영향 0). 로그인 화면은 Owner 가 직접 보거나, 운영 DB 연결 없는 방법이 정해질 때까지 NOT_PROVEN.
- 같은 화면 혼재 검사: MY·Admin 광고 원장·HOME·DIPICK·LETARING·알림함 문구 전수 스캔.

## 10. Owner 결정 필요 (규정으로 못 정하는 것만)
1. **통화 화면이 같이 쓰는 문구**(`nav_messenger_login_required`, `cm_ui_return_to_messenger`): 통화 변경 금지 vs 이름 통일 — 그대로 둘지, 통화 절차로 따로 갈지.
2. **G-1·G-2 실제 동작 확인 방법**: 로그인 상태 화면 확인이 운영 DB 에 세션·캐시 행을 남김 — 이 방식 허용 여부.
3. 사장님 하단 탭 가운데 원 색: R5 대로 기존 유지가 기본안 — 다르게 원하시면 지시.

## 11. 이행 결과 (2차 · 2026-11-13 PHT · 브랜치 `fix/service-brand-ssot-remaining`)
1차 PR #230(병합 bff58823d)은 커밋 제목이 「R1~R6」이었지만 R2 일부·R3·R4·R6 혼재 검사를 하지 않았다(허위 보고). 아래가 2차에서 한 것이다.

| 항목 | 결과 | 근거 |
|---|---|---|
| R2 남은 용어 | 이행 | `admin_dl_fab_*` 「배달 첫 화면」→DIPICK 홈 · 배달 메뉴 미리보기 하단바 5키 → LOUNGE·MARKET·DIPICK·LETARING·MY · `store_owner_notif_settings_link_suffix` en messenger→chat · Admin DIPICK 홈 선반 en 8키 「HOME」→「DIPICK home」 · ko 에만 MY 가 있던 3키 en 짝 |
| R2 광고 원장 영역·「마이 배너」 | **바꾸지 않음(계획 충돌)** | R1 이 같은 묶음(광고 원장 위치·`admin_menu_my_banners` 등)을 「D1~D33 밖」으로 되돌렸다. 되돌린 뒤 원장 화면은 영역·위치 모두 한국어라 같은 화면 혼재는 없다. R2 의 「원장 영역 정정」과 R1 이 충돌 — R1 기준 유지 |
| R3 하단 바 CSS | 이행 | 브라운 토큰 블록 삭제, :root = v11 값 한 벌. 크기·굵기 숫자 규칙(22/24/21px·23px·stroke 2.4·11/11.5/10px·700·검은 사각형·축소)은 사장님 하단 바 전용 `:where(.app-bottom-nav-shell:not([data-app-bottom-nav]))` 로만 둠 → 메인 하단 탭은 덮어쓰기 없이 자기 블록 값만. 6탭 10.5px 규칙·아바타 `:not()` 삭제. **계산값 비교: 회원(5·6탭·DIPICK 셸·허브 원)·사장님 5탭 × 폭 360/370/800/1300 × 기본·hover·active·focus, 요소 1,244개 전 속성 차이 0** (헤드리스 Chrome, 앱 CSS + design-tokens) |
| R3 아이콘 래퍼 | 이행 | `brandIcon()`·`OwnerHubFillIcon`·`StorefrontFillIcon`·가게 경로 상수 삭제 → `ServiceBrandIcon` + `serviceBrandIconSlot` 한 벌 |
| R3 owner_hub 그림 | 이행 | W1 에서 내가 바꾼 하단 탭 owner_hub(채움 가게)를 원래 그림(`StoreOpsCenterStrokeIcon`)으로 되돌림 → 하단 탭·배달 스위처·/stores 머리글 같은 그림 |
| R3 Admin 아이콘 선택 창 | 이행 | 서비스 키(HOME·LOUNGE·MARKET·DIPICK·LETARING·MY)는 Lucide 선택 막음 + 안내 문구(`admin_menu_bottom_icon_brand_fixed`), 이름 표시도 실제 그림 기준 |
| R3 registry.ts 속성 순서·검사기 | 이행 | 속성 순서 원래대로(id 먼저 7곳), 검사기 오탐 원인(닫는 따옴표를 여는 따옴표로 다시 읽음) 수정 + 시험. 재측정으로 기준선 3파일 변경: 오탐 2건 제거, `lib/admin-community-messenger/service.ts` 16→17(한 줄의 한국어 문자열 3개 중 1개를 예전 검사기가 못 셌음 — 파일은 수정하지 않음) |
| R3 i18n 짝 검사 | 이행 | 정규식 대신 카탈로그 TS 를 실제 실행해 값 읽음(Node 24 형식 제거) — 키 32,265개 = 앱 MESSAGES 와 같은 수 |
| R4 `verify:service-brand-ssot` | 이행(웹 범위) | 이름 8·아이콘 경로 한 곳·그리는 곳 한 곳·하단 탭 키·옛 이름 금지. `ci:static` 에 등록. 복사 경로 넣은 음성 시험에서 FAIL 확인. **네이티브(strings.xml·시작 화면) 검사는 N 단계 미승인이라 넣지 않음** |
| R4 용어집 | 이행 | 브랜드 8개 항목(한국어에 이름이 있으면 영어도 같은 이름), `myinfo` 설명 갱신 |
| R4 `I18N_E2E_NAV_KEYS` | 이행 | 실제 하단 탭 키(nav.home·community·delivery·chat·my)로 교체 — 이전 목록의 nav.trade 는 하단 탭에 없음. 언어 전환 확인은 하단 바 이름(aria) |
| R4 e2e 기대값 | 이미 1차에서 갱신(MARKET·FEED·LOUNGE). `revenue-final-regression-gate.spec.ts:181` 은 「홍보·Promotion」을 함께 찾는 넓은 패턴이라 변경 불필요. e2e 실행은 안 함 → NOT_PROVEN |
| R6 같은 화면 혼재 전수 검사 | 이행(코드 검사 범위) | `app/`·`components/` 의 `t("키")` 화면 파일별로 브랜드 이름과 옛 이름(단독·접두)을 함께 쓰는 곳 검색 → 4파일. 통합 검색 머리글(배달 · 매장/메뉴·채팅 → DIPICK·LETARING), MY 광고 신청(커뮤니티/거래 홈 피드 → FEED/MARKET 홈 피드), 알림 설정(커뮤니티·모임 채팅 → FEED·CREW 채팅) 수정. 메신저 홈 「모임」= 메신저 오픈 그룹(기능 이름)이라 유지. **동적 키·lib 에서 만든 문구는 이 검사로 못 찾음** |

### 남은 것 (2차 이후)
- MY 하단 탭 프로필 사진: Owner 2026-11-13 「용어만 변경」 지적 — 되돌릴지 Owner 결정 대기(승인 원문에는 사진→아이콘이 있었고, 이 안은 작업자가 설계 Q1 로 권장한 것).
- 네이티브(N)·운영 DB(D)·광고 상품명(N3)·통화 화면 문구(T2)·미사용 옛 이름 키 8개(N5·N6) — 별도 승인.
- 화면 확인: 로그인 화면·실기기·Production 은 NOT_PROVEN.
