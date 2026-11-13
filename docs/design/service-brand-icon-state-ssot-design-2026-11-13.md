# DIBAY 서비스 용어 · 아이콘 · 선택 상태 통합 SSOT 설계 (감사·설계·시안만)

- 작성: 2026-11-13 (PHT)
- 기준 코드: `origin/main` **fec8f2f61** (읽기 전용 작업 폴더). 코드·DB 수정, 커밋, PR, 배포 **없음**.
- 이전 감사: `docs/design/service-brand-name-ssot-audit-2026-11-13.md` (CHANGE 89행 · 결정 20개 · DB REVIEW 4건) — 이 문서가 그 계획(S1~S4)을 **대체**한다.
- 시안: `docs/design/service-brand-icon-state-mockup-2026-11-13.html` (30개 화면, 앱 원본 CSS 컴파일본 + Pretendard 1.3.9 + 실제 마크업 클래스, 브라우저 실측 포함)
- Owner 지시 원문 반영:
  - 「아이콘을 … 텔레그램처럼 동일하게 해라, 단지 선택된 내부 색상이 디바이 색상」 (2026-11-13)
  - 공식 명칭 8개 변경 불가 · LEVEL 1~4 분류 · LOUNGE/FEED 경계 · 기능명 한국어 유지
- 실기기: 지시대로 **조작하지 않음** → 실기 판정은 전부 NOT_PROVEN.

---

## 0. 먼저 보고할 것 (충돌·작업자 실수)

1. **이전 보고 정정 — 현재 하단 탭 선택 모양을 잘못 봤다.** 처음 시안에서 「선택색 = 브라운(2026-11-03)」으로 적었다. 실제 운영 값은 같은 파일 뒤쪽 블록이 덮어쓴 **검은 둥근 사각형 30×28 안 흰 아이콘 18px**이다(`app/app-bottom-nav.css:779-843`, 주석 「네이버형 하단 탭 (홈 설계안 v11 · Owner 「구현 시작」 2026-11-09)」). 시안에서 계산 스타일을 재다가 발견해 고쳤다.
2. **Owner 결정끼리의 충돌**
   - 2026-11-03: 하단 탭 강조 = 브라운, 그린은 실행 버튼 전용 (「녹색으로 버튼과 구분이 안 된다」, `app-bottom-nav.css:4-8`) — 지금은 덮여 안 쓰인다.
   - 2026-11-09: 네이버형 = 검은 사각형 선택 + **MY 탭 = 프로필 사진**(`BottomNav.tsx:226-239`).
   - 2026-11-13(이번): 텔레그램형 = 채움 아이콘, 선택 = DIBAY 색.
   - 이번 지시가 11-09 의 **선택 모양**을 대체하는 것은 지시 문구로 분명하다. **MY = 프로필 사진을 사람 아이콘으로 바꾸는 것**은 지시에 직접 없으므로 결정 항목(Q1)으로 남긴다. 시안은 텔레그램과 같게 사람 아이콘으로 그렸다.
3. **테스트가 실제 화면 값을 잠그지 않는다.** `lib/layout/__tests__/chrome-s4-bottom-nav.test.ts:23-37` 은 덮여서 안 쓰이는 브라운 토큰 문자열을 잠그고 있고, 실제 v11 값(#111·30×28·#ff3b30)을 잠그는 테스트는 없다. 구현 시 같은 단계에서 테스트를 실제 값 기준으로 바꾼다.

---

## A. 공식 용어 SSOT 표

LEVEL: 1 브랜드 · 2 기능(한국어 유지) · 3 경로 안내(실제 메뉴명과 일치) · 4 내부 식별자(변경 금지).

| 서비스 | LEVEL 1 공식 표기 | 허용 (설명용) | 금지 표현 (브랜드 자리) | LEVEL 2 기능명 예외 (한국어 유지) | 사용 위치 |
|---|---|---|---|---|---|
| 홈 | **HOME** | 「홈」(안내문 속 설명) | Home(영문 카멜), 홈(탭 라벨) | — | 하단 탭, 서비스 카드, 첫 진입 설정 |
| 커뮤니티 전체 | **LOUNGE** | 라운지·커뮤니티(설명) | 커뮤니티/Community(탭·워크스페이스·도메인 칩) | 커뮤니티 활동 제한 안내 문장 | 하단 탭, Admin 워크스페이스·운영 홈 탭, 알림 분야 탭 |
| 게시글·정보 | **FEED** | 피드·게시글(설명) | 정보교환, 필라이프/Philife, 동네생활, 커뮤니티(게시글 뜻) | 게시글, 댓글, 글쓰기, **「피드 배너」의 피드(지면 형태)** | LOUNGE 3단 탭, 허브·상세 1단 제목, 검색 섹션, HOME 카드 |
| 거래 | **MARKET** | 마켓·사고팔기(설명) | 거래/Trade/Marketplace/중고거래/DIBAY MARKET(자리 이름) | **거래 신고, 거래 완료, 거래 채팅, 거래 내역** | LOUNGE 3단 탭, 허브·상세 제목, 검색, HOME 카드, Admin 워크스페이스 |
| 모임 | **CREW** | 크루·모임(설명) | 모임/Groups/Meetup(탭·허브 제목) | **모임 가입, 모임 탈퇴, 모임장, 모임 목록(개체)** | LOUNGE 3단 탭, 허브 제목, Admin 섹션 |
| 배달·주문 | **DIPICK** | 디픽·배달(설명) | 배달/Food/Delivery(탭·워크스페이스), DIBAY 배달 | **배달비, 배달 주문, 주문 내역, 주문 취소, 매장** | 하단 탭, /stores 제목, HOME 카드, Admin 워크스페이스 |
| 채팅·통화 | **LETARING** | 레터링·채팅(설명) | 채팅/Chat/메신저/Messenger/SAMessenger/사마켓 메신저(자리 이름) | **메시지 보내기, 채팅방, 통화 기록, 음성 통화** | 하단 탭, 메신저 1단 첫 제목, HOME 카드, Admin 워크스페이스 |
| 내정보 | **MY** | 내정보(설명) | 내정보/My Page/마이(탭·허브 제목) | **계정 정보(/mypage/account), 알림 설정** | 하단 탭, MY 1단 제목, 경로 안내 「MY > 알림 설정」 |

규칙:
- 브랜드 표기는 ko·en 같은 영문 대문자(번역하지 않음). LEVEL 2 는 지금 카탈로그 문구를 그대로 둔다.
- 「브랜드+기능」 메뉴(예: 거래 신고)는 **LEVEL 2 로 본다 = 그대로**(지시 예시 「MARKET: 서비스명 / 거래 신고: 기능명」). 이전 결정 L2 는 이 규칙으로 닫는다.
- LEVEL 3 경로 안내는 실제 메뉴명과 같아야 하므로 「내정보 › 알림 설정」 → 「MY › 알림 설정」으로 맞춘다(법적 문서 제외, E-N1).

---

## B. 공식 아이콘 SSOT 표 (텔레그램형)

**라이브러리 결정: Phosphor Fill** — 이미 설치된 `react-icons` 5.6.0 의 `pi` 세트(MIT). 이유:
- Owner 지시가 텔레그램처럼 **채움 단색** 아이콘이다. 지금 앱의 lucide·Heroicons 복사본은 **선 아이콘만** 있다.
- Ionicons 5 도 검토했으나 배달(자전거)이 선 그림뿐이라 8개 무게가 안 맞았다(시안 1차에서 실측으로 확인 후 제외).
- Phosphor Fill 은 8개 브랜드 + 매장(6번째 탭) 모두 같은 굵기의 채움 그림이 있다.
- **런타임에 react-icons 를 import 하지 않는다.** 9개 경로 데이터(viewBox 0 0 256 256)를 SSOT 파일 1곳에 상수로 복사해 웹·Admin·네이티브 시작 화면 생성기가 같은 값을 쓴다(번들 증가 없음, 시작 화면 HTML 도 같은 그림).

| 서비스 | 대표 아이콘 | 지시 후보(선) → 결정 근거 | 지금 앱에서 쓰는 그림 (통일 대상) |
|---|---|---|---|
| HOME | `PiHouseFill` | house → 같은 뜻 채움 | Heroicons home(하단 탭), 직접 그린 집(시작 화면·owner_hub), lucide Home(사장님 탭) |
| LOUNGE | `PiUsersThreeFill` (세 사람) | users-round → 같은 뜻. CREW 와 겹치지 않게 「세 사람」 | Heroicons newspaper(하단 탭!), users(시작 화면·MY 카드), user(알림) |
| FEED | `PiNewspaperFill` | layout-list → **신문으로 변경**: layout-list 는 「목록 보기 전환」 기능 아이콘으로 읽히고 앱 사용처 0, HOME 카드가 이미 Newspaper | lucide Newspaper(HOME 카드·바로가기) |
| MARKET | `PiShoppingBagFill` | shopping-bag 그대로 | Tag(HOME), 화살표(관리자 키), Package(시작 화면), MessagesSquare(MY), MessageCircle(알림 — 채팅과 같은 그림) |
| CREW | `PiFlagFill` (깃발) | users → **깃발로 변경 권장**: LOUNGE(세 사람)와 18~26px 에서 구분 안 됨. 대안 `PiUsersFill`(두 사람) — Q2 | lucide Users(모임 대표사진 없을 때) |
| DIPICK | `PiMopedFill` (배달 스쿠터) | bike → **스쿠터로**: 채움 자전거 없음, 배달 라이더 뜻이 더 정확 | Heroicons 쇼핑백(하단 탭 — **MARKET 그림과 충돌**), Receipt(HOME), Bike(진행 중 주문), 책장(시작 화면), ShoppingBag(MY), Package(알림) |
| LETARING | `PiChatsCircleFill` (말풍선 둘) | message-circle → 텔레그램 「대화」 탭과 같은 두 말풍선 | Heroicons chat(하단 탭), MessageCircle(HOME·알림·시작 화면) |
| MY | `PiUserCircleFill` | user-round → 텔레그램 연락처와 같은 원 안 사람 | 프로필 사진(하단 탭), 채운 점 3개(아이콘 키 `my` — 「더보기」로 읽힘), user(시작 화면) |
| (매장 사장님 6번째 탭) | `PiStorefrontFill` | 브랜드 아님, 기능 아이콘 | 직접 그린 집 |

**크기·색·상태 (하단 탭 기준, 시안 3절에서 실측)**

| 항목 | 현재 (v11) | 제안 (텔레그램형) | 근거 |
|---|---|---|---|
| 아이콘 크기 | 22px, 선택 시 18px(검은 사각형 안) | **26px 고정** — 선택해도 크기·모양 그대로 | 텔레그램 = 크기 변화 없음 |
| 그림 | 선(stroke 2 / 선택 2.4) | 채움 단색 (stroke 0) | 지시 |
| 비선택 색 | 아이콘 #1e1e1e, 글자 #2b2b2b | **`--sam-icon-soft`** (회색, 기존 토큰) | 지시 「비선택 = 중성 회색」, 새 색 만들지 않음 |
| 선택 색 | 흰 아이콘 + #111 사각형 | **아이콘·글자만 `--dibay-green` #0B421A**, 배경 없음 | 지시 「선택된 내부 색상만 DIBAY 색」 |
| 글자 | 11px / 500, 선택 700, ≤374px 10px, 6탭 10.5px | **10px / 500 고정**(선택도 굵기 그대로 — 색으로 구분 + 아이콘 색) | 텔레그램 = 굵기 변화 없음. 색만으로 구분되는 문제는 아이콘 색·글자 색 두 곳이 함께 바뀌어 보완(Q3) |
| 눌림 | scale 0.97 + 배경 4% | **투명도 55%**, 크기 그대로 | iOS 탭바 눌림 |
| 포커스 | outline 그린 35% | 그대로 유지(키보드 전용) | 04-DESIGN-SYSTEM `:47` |
| 비활성 | 정의 없음 | `aria-disabled="true"` + 투명도 38% | 신규 정의 |
| 배지 | 빨강 #ff3b30 18px, 아이콘 오른쪽 위 7px 겹침 | **그대로** (Owner 2026-11-09 「30% 겹치게」) | 기존 결정 |
| 탭 칸 | 48px 높이, 360px 5탭 = 69px 폭 | 그대로 → 44×44 이상 충족 | 실측 |

**Admin**: 워크스페이스 머리글(사이드바 상단 제목)에만 같은 대표 아이콘 20px, 글자색 상속(바탕 그린 위 골드). 하위 기능 메뉴·삭제/승인/설정 같은 기능 아이콘은 지금처럼 따로 둔다(서비스 아이콘과 섞인 곳 0 — 감사 확인).

**다른 화면의 서비스 그림**: HOME 서비스 카드·바로가기, MY 카테고리 카드, 알림함 분야 아이콘, 시작 화면, FAB 의 서비스 그림을 **같은 대표 아이콘으로 교체**한다. 단 MY 카테고리 카드(7색 배경)·알림함(분야별 색 원)은 지시의 「다색·배경 원형 금지」와 충돌하는 기존 디자인이라 **그림만 바꾸고 배경색은 Q4 결정 전까지 유지**.

---

## C. 실제 UI 시안 (`service-brand-icon-state-mockup-2026-11-13.html`)

| 절 | 내용 | 실측 결과 (브라우저, Pretendard Variable 적용 확인) |
|---|---|---|
| 1 | 대표 아이콘 현재 vs 제안 표 | — |
| 2 | 메인 하단 탭: 현재 / 제안(LOUNGE·LETARING·MY·HOME 선택), 360·390·1024px, 6탭 | 13개 화면 **잘림 0**. 360px 5탭: 탭 69×48, LETARING 45px. 360px 6탭: 탭 57×48, LETARING 47px. 1024px 탭 202×48 |
| 3 | 상태 6종 (DEFAULT·ACTIVE·PRESSED·FOCUS·DISABLED·BADGE) | 선택 아이콘 계산값 rgb(11,66,26)·26px, 비선택 `--sam-icon-soft`·26px (크기 변화 0) |
| 4 | LOUNGE 1단 제목 + 3단 FEED·MARKET·CREW (실제 클래스) | 360px 에서 전환 탭 198→235px, 시작 x=108px 로 줄 안에 들어감. **버튼 높이 32px < 44px (기존 결함, 아래 G-4)** |
| 5 | DIPICK·LETARING·MY 1단 제목 | 360px 제목 칸 218px 에 LETARING 77px — 넘침 0 |
| 6 | Admin 사이드바 4개 워크스페이스 현재/제안 | 머리글 DIPICK 73px, 넘침 0 |

시안 한계: 1단 머리글은 거래 허브 실제 렌더 마크업(이전 시안 원본)을 틀로 쓰고 제목만 바꿨다 — 서비스별 오른쪽 아이콘 구성은 다를 수 있음. 실기기 캡처 없음. iOS·Android 안전영역은 0 으로 그렸다.

---

## D. 전체 변경 매트릭스

이전 감사 표(A1~D33·C1~C14·E1~E10)의 문구 행은 그대로 유효하다. 아래는 **아이콘·선택 상태가 추가된 묶음**과 이전 행 번호 연결이다.

| # | 화면 | 파일 | 기존 명칭 | 확정 명칭 | 기존 아이콘 | 확정 아이콘 | 영향 범위 | 검증 |
|---|---|---|---|---|---|---|---|---|
| M1 | 하단 탭 5개(+데스크톱 세로 레일) | `app-shell-core.ts`(nav.*), `bottom-nav-config.ts`, `MainBottomNavTabIcons.tsx`, `BottomNav.tsx`, `app/app-bottom-nav.css:779-904` | 홈·커뮤니티·배달·채팅·내정보 | HOME·LOUNGE·DIPICK·LETARING·MY | Heroicons 선 5종 + 프로필 사진 | Pi*Fill 5종 | 모든 하단 탭 화면, 사장님 하단 탭(같은 CSS) | vitest(탭 판정·라벨), 시안 실측, 화면 NOT_PROVEN |
| M2 | 하단 탭 선택 상태 | `app-bottom-nav.css` v11 블록 교체 + 앞쪽 브라운 블록 삭제 | — | — | 검은 사각형 | 아이콘·글자 그린 | 같은 | chrome-s4 테스트를 실제 값으로 교체 |
| M3 | 관리자 하단 탭 아이콘 선택 창 | `admin-main-bottom-nav-icon-options.ts`, `lucide-bottom-nav-icon-registry.ts`, `MainBottomNavIconPickerModal.tsx` | 「chat (거래채팅)」 등 | 브랜드명 | 키 10개 | 브랜드 아이콘 우선 | Admin | 운영 DB `main_bottom_nav` 행 없음 확인(이전 조회) → 덮어쓰기 영향 0 |
| M4 | LOUNGE 3단 전환 탭 | `CommunityTradeTitleSwitch.tsx`, 카탈로그 3키 | 정보교환·거래·모임 | FEED·MARKET·CREW | 없음 | 없음(글자 탭 유지) | /philife·/market·/moim | 이전 A4~A7 |
| M5 | 허브·상세 1단 제목 | `navigation.ts`·`moim-core.ts`·`trade.ts`·`community-ui.ts` | 이전 A4~A16, B5~B16 | 브랜드 | — | — | 각 허브 | 이전 표 |
| M6 | HOME 서비스 카드·바로가기 | `HomeServiceCards.tsx:15-18`, `HomeScreen.tsx:39-44`, `home-hub.ts` | 거래·정보교환·배달·채팅 | MARKET·FEED·DIPICK·LETARING | Tag·Newspaper·Receipt·MessageCircle | 대표 아이콘 | HOME | 관리자 업로드 이미지(imageUrl)가 있으면 그것 우선 — 운영 값 확인 필요 |
| M7 | MY 카테고리 카드 | `mypage-ia.ts:78,114,139`, `MyInfoHomeCategoryHub.tsx` | 거래·커뮤니티·매장/배달 | MARKET·LOUNGE·DIPICK | MessagesSquare·Users·ShoppingBag | 대표 아이콘 | MY | Q4 배경색 |
| M8 | 알림함 분야 아이콘·탭 | `NotificationInboxCategoryIcon.tsx:21-25`, `notification-inbox-visual.ts`, `my.ts`(C1~C9) | 거래·커뮤니티·배달·채팅 | MARKET·LOUNGE·DIPICK·LETARING | MessageCircle(거래)·User·Package | 대표 아이콘 | 알림함 | Q4 |
| M9 | 시작 스켈레톤 | `lib/startup/startup-cache.ts:36-47`, `local-runtime-markup.ts:33-46`, 생성 HTML 3개 | 홈·커뮤니티·배달·채팅·마이 | 브랜드 | 직접 복사 경로 5종 | SSOT 경로 상수에서 생성 | 네이티브 첫 프레임 | **네이티브 빌드 필요** |
| M10 | FAB 배달 홈 | `resolve-main-bottom-nav-fab.ts:48-54`, `store-commerce-ui.ts`(B7) | 배달 홈 | DIPICK | Heroicons home | `PiMopedFill`? → Q5 (DIPICK 내부 홈은 HOME 과 구별) | DIPICK | — |
| M11 | Admin 워크스페이스·대시보드·도메인 칩 | 이전 D1~D33 | 이전 표 | 브랜드 | 없음 | 머리글에만 대표 아이콘 | Admin | 이전 표 |
| M12 | Android 알림 채널 이름 | `strings.xml`(C10~C13) | 이전 표 | 브랜드 | — | — | OS 설정 | **네이티브 빌드 필요** |
| M13 | 운영 DB `ad_products` 3행 | E4 | 필라이프 … | FEED … | — | — | 광고 | 운영 DB 쓰기 별도 승인 |

통화 관련(수신 통화 「DiBay 음성/영상 통화」·CallKit·통화 푸시)은 **어느 행에도 넣지 않는다**(통화 규정·Owner 11-12).

---

## E. 이전 20개 결정 처리표

| ID | 내용 | 권장안 | 근거 | 회귀 위험 | Owner 승인 필요 |
|---|---|---|---|---|---|
| L1 | 「커뮤니티」 알림·광고 라벨 LOUNGE/FEED | 알림 분야 탭·배지 = **LOUNGE**(글·모임 모두 포함하는 분야), 게시글 상위노출·FEED 광고 상품 = **FEED** | 지시 §3. 알림 `community` 분야는 모임 알림도 포함(코드 매핑 확인 필요 → 구현 전 1회 확인) | 낮음(문구) | 아니오(원칙으로 결정). 매핑 확인에서 다르면 REVIEW |
| L2 | 브랜드+기능 메뉴 앞머리 | **그대로**(LEVEL 2) | 지시 예시 「거래 신고: 기능명」 | 없음 | 아니오 |
| L3 | 통합 검색 placeholder | 「FEED, MARKET, DIPICK, LETARING 검색」 | 검색 대상이 실제로 게시글·거래·매장·채팅 단위 | 낮음 | 아니오 |
| L4 | 「동네생활」(DB 섹션·MY 부제) | 회원 화면 사용처가 없는 DB 값은 그대로, MY 부제 「커뮤니티·동네생활」은 「FEED」로 | 옛 이름, 사용처 미확인 값은 손대지 않음 | 낮음 | 아니오 |
| P1 | DIPICK 하단바 「배달 홈」(현재 `nav.home`) | 새 키로 분리, 표기 「DIPICK」 | 지시 「DIPICK 내부 홈은 HOME 과 구별」. 단 이 하단바는 **현재 렌더되지 않음**(감사: `composeDeliveryBottomNavDisplayTabs` 호출 0) → 키만 분리 | 없음 | 아니오 |
| P2 | 「주문」 계열이 DIPICK 인가 | 주문 기능 문구 = 한국어 유지. Android 「주문 알림」 채널 이름 = 「DIPICK 주문 알림」 | 지시 「주문 관련 기능명은 한국어 유지」, 채널은 서비스 구분 이름 | 낮음(네이티브) | 아니오 |
| P3 | 문장 속 「DIBAY 배달」 | 「DIPICK」으로 | 사실상 서비스명 자리 | 낮음 | 아니오 |
| P4 | 오너 광고 지면 「배달 홈 …」 | 「DIPICK 홈 …」 | 지면 = 화면 이름 | 낮음 | 아니오 |
| T1 | LETARING 허브 동적 제목 | **기존 동작 보존**: 첫 프레임만 LETARING, 이후 구역 이름(대화·친구·통화) | 지시 「동적 제목은 기존 동작 우선 보존」 | 없음 | 아니오 |
| T2 | 통화 화면·CallKit·통화 푸시 | **이번 범위 제외** | 지시·통화 규정 | — | 예 (별도, 통화 절차) |
| T3 | 문장 속 「메신저」 | 서비스로 가는 버튼·제목(「메신저 홈으로」「메신저로 이동」「메신저 검색」 aria) = LETARING. 오류·권한 안내 문장 속 「메신저」 = 「채팅」(LEVEL 2) | 옛 서비스명을 남기지 않되 기능 문장은 한국어 | 낮음 | 아니오 |
| M1 | 「내정보로」·경로 안내 | 버튼·경로 = MY(「MY로」「MY › 알림 설정」) | LEVEL 3 = 실제 메뉴명 | 낮음 | 아니오 |
| M2 | MY 섹션 「거래」「매장·주문」 | MARKET / DIPICK (코드 기본값 + DB `my_page_sections` 2행) | 서비스 묶음 이름 | DB 쓰기 | **예 (운영 DB)** |
| M3 | /mypage/account 「내 정보」 | 「계정 정보」(LEVEL 2, MY 브랜드와 구별) + en 「Account」 | 지시 「MY 계정정보와 MY 브랜드 구별」 | 낮음 | 아니오 |
| N1 | 법적 문서 속 서비스명 | **변경 안 함** | 지시 「법적 문서 변경 금지」 | — | 아니오 |
| N2 | iOS 권한 문구 | 「메신저에서」→「LETARING 에서」, 「배달·근처 서비스」→「DIPICK·근처 서비스」 | 사용자 노출 서비스명 | 네이티브·심사 문구 | 예 (네이티브 빌드 때) |
| N3 | 광고·포인트 상품 공개명 | 새로 쌓일 상품명만 브랜드로, **과거 장부 행 변경 안 함** | 지시 「과거 금융 기록 변경 금지」 | 금융 설명 문구 — 계산 로직 무관 | 예 (상품명은 DB·코드 상수) |
| N4 | 「피드 배너」의 피드 | **그대로** (지면 형태) | 지시 §3 마지막 문단 | 없음 | 아니오 |
| N5 | 옛 앱 이름(Kasama·사마켓) | 서비스명 아님 → 이번 범위 밖, 보고만 | 범위 고정 | — | 아니오 |
| N6 | 사용처 0 번역 키 | **삭제 안 함**(값도 안 바꿈) | 지시 「미사용 키 삭제 제외」 | 없음 | 아니오 |

DB REVIEW 4건: E5 `feed_ad_products` 「커뮤니티 피드 광고」→ FEED(L1, 운영 DB 승인 필요) · E6 동네생활(L4, 유지) · E7 `my_page_sections`(M2) · E8 `delivery_bottom_nav_items`(소비 화면 없음, 유지).

**새로 생긴 Owner 결정 (Q)**

| ID | 결정 | 권장 | 이유 |
|---|---|---|---|
| Q1 | MY 하단 탭: 프로필 사진(11-09) → 텔레그램형 사람 아이콘 | 아이콘 | 「텔레그램처럼 동일하게」, 사진은 색이 섞여 「단색」 규칙과 맞지 않음 |
| Q2 | CREW 아이콘: 깃발 vs 두 사람 | 깃발 | LOUNGE(세 사람)와 작은 크기에서 구분 |
| Q3 | 선택 글자 굵기 변화 없음(텔레그램) vs 700(현재) | 변화 없음 | 텔레그램과 동일. 아이콘·글자 색 두 곳이 함께 바뀌어 색 하나만의 구분은 아님 |
| Q4 | MY 카테고리 카드·알림함의 색 배경 원 | 그림만 교체, 배경 유지 | 지시의 「배경 원형 금지」는 내비 아이콘 규칙. 카드 디자인 변경은 범위 확대 |
| Q5 | FAB 「DIPICK」 진입 아이콘 | `PiMopedFill` | DIPICK 대표 그림과 같게 |

---

## F. 통합 구현 계획 (승인 후)

### F-1. 중앙 관리 구조 (새 체계 만들지 않음)
- `lib/i18n/catalog/service-brand.ts` 1개 파일: 브랜드 8개의 **표시명 + 아이콘 경로 데이터(Phosphor Fill, 256 viewBox) + 서비스 계층(parent)**.
  - 카탈로그 키들이 표시명 상수를 참조(이전 설계와 같음, 키·라우트 불변).
  - `components/brand/ServiceBrandIcon.tsx` 1개가 경로 데이터로 `<svg fill="currentColor">` 를 그린다. 하단 탭·HOME 카드·MY 카드·알림함·Admin 머리글이 이것만 쓴다.
  - `local-runtime-markup.ts`(시작 화면)도 같은 상수에서 SVG 문자열을 만든다.
- 크기·색은 **CSS 토큰**(`app/app-bottom-nav.css` 의 `--app-bottom-nav-*`)에 두고 TS 에는 두지 않는다. 화면별 예외(HOME 카드 36px, 알림 18px 등)는 각 화면 CSS 그대로.
- 기능 아이콘(lucide)은 그대로. 브랜드 아이콘과 합치지 않는다.
- 검사 `verify:service-brand-ssot`(CI): 브랜드 아이콘을 직접 import/복사한 곳, 금지 표현이 브랜드 자리에 다시 들어간 키, strings.xml·시작 화면 값 불일치를 잡는다.

### F-2. 단계 (한 작업 = PR 1개, 단계는 커밋 단위)

| 단계 | 내용 | 배포 구분 | 깨지지 않게 같은 단계에서 할 것 |
|---|---|---|---|
| W1 | SSOT 파일 + 사용자 앱 문구(이전 A·B·C1~C9·C14) + 하단 탭 아이콘·선택 상태(M1·M2) + HOME/MY/알림 그림(M6~M8) + 공유 키 분리 | 웹 | chrome-s4 테스트를 실제 값으로, e2e 기대 라벨 갱신, 360px·6탭 실측 |
| W2 | Admin 문구(D1~D33) + 코드 직접 ko/en 10개 파일 키 이전 + 머리글 아이콘 + 아이콘 선택 창 | 웹 | 계약 고정 파일(`…hard-lock.ts:274`)·대시보드 마크업 테스트 |
| N | 시작 스켈레톤 재생성(M9) + Android 채널 이름(M12) + iOS 권한 문구(N2) | **네이티브 — 빌드는 Owner 일괄** | 채널 ID 불변, versionCode 는 빌드 때 1회 |
| D | 운영 DB: `ad_products` 3행, `feed_ad_products` 2행, `my_page_sections` 2행 | **운영 DB — 별도 승인** | 시작 시 revision·백업, 끝나고 열 단위 대조(AGENTS 운영 시험 저장 규칙 8) |

W1·W2 는 같은 작업이라 PR 1개. **자동 병합 등록은 하지 않는다**(지시 「Owner 승인 없는 병합 금지」 — AGENTS 개발 프로세스 1번의 자동 병합 기본값과 다르므로 이번 작업은 Owner 병합).

### F-3. 반영 시점과 구버전 앱 차이
- 웹(W1·W2): main 병합 = Production. 설치된 앱은 **재시작하면** 새 이름·아이콘(웹 화면이므로).
- 그 사이 남는 것(구 바이너리, 새 빌드 설치 전까지):
  - 시작 스켈레톤 첫 프레임(0.x초)에 옛 하단 탭(홈·커뮤니티·배달·채팅·마이 + 선 아이콘)이 보였다가 바뀜.
  - Android OS 알림 설정의 채널 이름이 옛 이름.
  - iOS 권한 팝업 문구가 옛 문구.
- 이 차이는 N 단계 빌드 설치로만 사라진다 → 완료 판정은 N 설치 후.

### F-4. 회귀 테스트
- 코드: `typecheck:build`, `typecheck:test`, 관련 vitest(하단 탭 판정·라벨·i18n 품질·Admin 대시보드 마크업·marketplace 제목), `check:i18n-quality`, `verify:service-brand-ssot`, 변경 파일 eslint, `test:ci` 1회.
- 화면(각각 증거 첨부, 조건 명시): 로그인 Owner 계정 · ko/en · Android 세로(Samsung) · iPhone 세로 · 태블릿 가로 · Windows · 360px · 5탭/6탭(사장님) · 배지 있는 LETARING · Admin 사이드바·운영 홈 — **이번에는 시안 실측만, 실기 NOT_PROVEN**.
- 기능 회귀 확인: 하단 탭 이동·선택 판정(문구·그림만 바뀌고 `isMainBottomNavDisplayTabActive` 무변경), 알림 분야 필터 동작, 푸시 발송 로직 무변경(카탈로그 제목만), 통화 코드 diff 0 확인.

### F-5. 롤백
- 웹: Vercel Instant Rollback(재빌드 없음) → 원인 수정 PR → Promote.
- 네이티브: 이전 빌드 재설치(채널 ID 불변이라 설정 유실 없음).
- DB: 백업 값으로 UPDATE.

### F-6. 완료 기준
- 코드 PASS(위 검사) ≠ 완료. Production SHA 기준으로 화면 표에 있는 각 위치를 Owner 로그인·실기기에서 확인해 증거가 있는 것만 PASS, 나머지 NOT_PROVEN.
- 같은 브랜드 = 같은 그림: `verify:service-brand-ssot` 0건 + 화면 확인.

---

## G. 선택 상태 감사에서 찾은 기존 결함 (보고만 — 고치지 않음, 범위 밖)

| # | 결함 | 근거 | 성격 |
|---|---|---|---|
| G-1 | `/orders`·`/chats`·`/chat` 에서 하단 탭이 하나도 선택되지 않음. 화면 판정(`resolveMainSurface`)은 delivery·chat 으로 보는데 하단 탭 판정이 따르지 않음 — 판정 기준이 둘 | `lib/layout/resolve-main-surface.ts:31-32,52`, `main-bottom-nav-prefetch-pick.test.ts:43-73`(`/orders`→−1 잠금) | 기존 계약(테스트 잠금) — 바꾸려면 Owner 결정 |
| G-2 | LOUNGE 영역에서 LOUNGE 탭을 누르면 마지막 주제가 아닌 맨 `/philife` 로 감 — 계약 주석 「no bare /philife」와 어긋남 | `main-bottom-nav-tab-emphasis.ts:61-69`, `main-bottom-nav-interaction-contract.ts:9` | 계약 불일치 |
| G-3 | `/moim` 에서 LOUNGE 탭 선택을 잠그는 테스트 없음 | 감사 | 테스트 공백 |
| G-4 | LOUNGE 3단 전환 버튼 높이 32px < 44px, 포커스 링 없음 | `CommunityTradeTitleSwitch.tsx:59`, `design-tokens.css:257` | 접근성 |
| G-5 | 미리 표시(pending) 선택이 쿼리만 바뀌는 이동에서 남을 수 있음 | `BottomNav.tsx:800-827` | 잠재 |
| G-6 | 선택 색이 네 가지(하단 #111 · 3단·밑줄 #0B421A · 알약 도메인 accent #296044 등 · Admin 파랑/골드) | 감사 6절 | 이번 SSOT 로 하단 탭은 #0B421A 로 수렴, 나머지는 Q 로 남김 |
| G-7 | Admin 사이드바 링크에 `aria-current` 없음, 그룹 열림 = 색만 | `AdminSidebarItem.tsx:213-222` | 접근성 |

---

## H. 최종 판정

| 항목 | 판정 | 증거·조건 |
|---|---|---|
| 용어·아이콘·선택 상태 코드 감사 | 일부만 확인 (코드 검색) | origin/main fec8f2f61, 3개 영역 조사 + 핵심 값 직접 확인: v11 CSS 블록(`app-bottom-nav.css:779-843`), MY 사진(`BottomNav.tsx:226-239`), Lucide·Phosphor·Ionicons 설치 확인 |
| 시안 렌더·잘림 | PASS (브라우저 시안 범위) | 로컬 정적 서버, Chrome 계열 브라우저 창, 2026-11-13 PHT, 30개 화면 잘림 0, 글꼴 Pretendard Variable 계산값 확인 |
| 실제 앱 화면 (Android·iOS·태블릿·Windows·Admin, Owner 로그인) | NOT_PROVEN | 실기 작업 금지 지시 |
| 현재 상태 「같은 브랜드 = 같은 이름·그림」 | **FAIL** | 이름: 이전 감사 89행. 그림: DIPICK 6종·MARKET 5종·LOUNGE 4종·HOME 4종 |
| 구현 | 미착수 | 지시대로 |
