# 내정보 전체 설계안 — 분류 진입 · 하위 화면 공통 틀 · 진입/뒤로 지도 · 기기별 폭 (승인 요청)

2026-11-02 PHT · 코드·DB·배포 변경 없음 · 시안: `docs/audit/mypage-ia-category-tabs-mockup-2026-11-02.html` (분류 → 하위 화면 → 뒤로, 기기 폭 전환 동작)

## 0. 확인 조건
| 항목 | 조건 | 판정 |
|---|---|---|
| 실화면 | Production `samarket.vercel.app` · 앱 안 브라우저 · `@aaaa` 로그인 · 버전 `460281f` · **81개 경로 × 360/390/768/1024px** 자동 측정(앱 내부 이동, 화면별 2.6초 대기) | 확인 |
| 코드 | `main` c90b03276 — 하위 화면 전수(셸·헤더·뒤로·폭·CTA·탭·상태·탭바) | 확인 |
| 실기기 APK·iOS 안전영역(노치·홈 표시줄·가로모드) | 브라우저 측정은 안전영역 0 | **NOT_PROVEN** (코드 근거만) |
| 상세(`[id]`) 화면 | 주문·게시글·상품권·신고 상세 | 코드만 확인, 실화면 NOT_PROVEN |

## 1. 감사 결과
**PASS (측정)**: 가로 넘침 0건(81×4) · 하단 고정 버튼이 탭바에 가려짐 0건 · 모든 하위 화면에 ‹ 뒤로 있음 · 헤더 높이 52px 통일.

| # | 결함 | 증거 | 판정 |
|---|---|---|---|
| D1 | **하위 화면 틀 7종 혼재** — `MyScreen`(약 30) · 헤더 직접(16: 광고·혜택·포인트 4·댓글·글·최근 본·주문알림 등) · 잠금 헤더(주소 3·후기) · 커머스 허브(쿠폰·상품권) · 섹션 스택(`MyPageStackShell`) · 매물(`MypageSubpageShell`) · 프로필 편집 고정 헤더 · 거래 허브 레이아웃(찜) | 코드 전수 | FAIL |
| D2 | **메뉴 이름 ≠ 화면 제목 16곳** — 계정 관리→「내 정보」 · 진행중 거래→「내 매물」 · 내가 쓴 글→「내 활동」 · 댓글·반응→「댓글·활동」 · 쿠폰/상품권→「주문·혜택」 · 찜→「찜 목록」 · 최근 본 상품→「최근 본 글」 · 주소관리→「주소 설정」 · 개인/보안→「기기 권한」 · 모아보는 사용자→「친구 / 관심 사용자」 · 판매 글 동네 일괄 변경→「지역 설정」 · 배달K 라이더→「라이더 관련」 · 알림→「알림 설정」 · 결제정보→「결제 정보」 · 매장 문의(확인 필요) | 실측 헤더 글자 | FAIL |
| D3 | **뒤로 목적지 제각각** — 쿠폰·상품권 직접 진입 시 `/stores`(내정보 밖) · 주문 알림 설정 → `/notifications` · 고객센터 계열은 히스토리 무시(`preferHistoryBack=false`) · 거래 채팅·DM 은 표시 없이 채팅 탭으로 나감(탭바 「채팅」 활성) | `resolve-main-tier1.ts:371-389`, 실측 | FAIL |
| D4 | **헤더 오른쪽 규칙 없음** — 대부분 알림 종, 고객센터 게시판은 없음, 일부는 기능 버튼(추가·광고 신청·전체 삭제) | 실측 | FAIL |
| D5 | **화면 안 탭 7종** — `Sam.tabs.bar` · `DIBAY_STATUS_TABS` · `CommerceHubSegmentTabs` · 포인트 손수 만든 탭 · `MemberOrderTabs` · `TradeHubTopTabs`+`TradeManagementTabBar` · `DibaySecondaryTabRow`. 쿠폰 화면 탭에 「주문 내역·매장 신청」이 섞임 | 코드·실측 | FAIL |
| D6 | **태블릿 폭 불일치** — 본문은 640px(1024px 화면에서 212–812)인데 쿠폰 탭은 32–992(960px) · 찜 탭 `APP_MAIN_COLUMN`+10/8px · 언어 카드 420px · 후기 하단바 앱 폭 | 1024px 실측·코드 | FAIL |
| D7 | **하단 고정 바 5종** — `MyStickyCta` · 프로필 편집 저장바(탭 인식 없음) · 주소 편집 하단 · 후기 하단 · 고객센터 댓글바. **가로모드 좌우 안전영역 미적용**(고정 바·탭바 `left/right:0`) | 코드 `app-bottom-nav.css:15-16` 등 | FAIL(실기 NOT_PROVEN) |
| D8 | **폼 화면에도 하단 탭 표시** — 충전 신청·광고 신청·탈퇴·캐시 삭제·매물: 버튼 바(67px)+탭바(60px+안전영역)가 겹쳐 쌓임. 360×780 에서 본문 가용 601px, iPhone 홈 표시줄 포함 시 약 127+34px 하단 점유 | 실측 CTA 653–720 / 탭 720– | FAIL |
| D9 | **고아 화면** — 공감한 글·저장한 글·관심이웃·커뮤니티 신고 내역, 섹션 목록 6개(`/mypage/section/*`)는 홈에서 들어갈 길 없음(옛 주소로만) | 실측·registry | FAIL |
| D10 | 로딩 모양 제각각 — 맞춤 스켈레톤 10여 개 + `MyStateView` | 코드 | PARTIAL |
| D11 | 죽은 코드 — `MyPageLayout`·`MyPageSidebar`(미사용), `MyPageItemScreen` 미도달 분기 | 코드 | 정리 대상 |

## 2. 설계

### 2.1 화면 단계 · 이동 규칙 (SSOT = `lib/mypage/mypage-ia.ts`)
| 단계 | 예 | 하단 탭바 | 헤더 | 들어오는 법 | 뒤로(‹·Android 뒤로·iOS 밀기 동일) |
|---|---|---|---|---|---|
| L0 홈 | `/mypage` | 보임 | 「내정보」 + 종 | 하단탭 | 없음 |
| L1 분류 | `/mypage/section/{trade·community·store·asset·account·settings}` | 보임 | ‹ + 분류명 | 홈 분류 카드 | 홈 |
| L2 기능 | 포인트·주문내역·알림 설정 … | **숨김** | ‹ + **메뉴 이름 그대로** + (기능 버튼 0~1) | 분류 화면 행 | 직전 화면, 직접 진입이면 그 분류(L1) |
| L3 상세·폼 | 주문 상세·충전 신청·주소 편집 … | 숨김 | 동일 | L2 행/버튼 | 직전 화면, 직접 진입이면 부모 L2 |
| 외부(↗) | 거래 채팅·사장님 화면·관리자·개인정보처리방침 | 그 도메인 규칙 | 그 도메인 | 행에 ↗ 표시 | 들어온 내정보 화면으로 |
- 전환: 들어갈 때 오른쪽→왼쪽 300ms, 뒤로 반대(기존 §1.3 그대로). 화면 안 탭 전환은 전환 없음.
- 뒤로 목적지는 registry 의 `parent` 한 곳에서만 계산 — 화면별 `backHref` 하드코딩 금지.

### 2.2 하위 화면 공통 틀 — `MyScreen` 하나 (L1~L3 전부)
```
┌ 헤더 52px + 위 안전영역 ──────────────┐  ‹(44×44) · 제목(17px 굵게 1줄, 가운데) · 오른쪽 0~1개(그 화면 기능: +추가 / 검색 / 전체 삭제)
├ 화면 안 탭(선택) 44px · 헤더 아래 고정 ┤  MyTabs 1종: 밑줄형, 2~4개 균등, 5개↑ 가로 스크롤, ?tab= 유지
├ 요약 영역(선택) ───────────────────────┤  숫자 카드 2~3칸 (포인트 잔액·진행 건수)
├ 본문 1열 ──────────────────────────────┤  목록=MyRow 54px / 설정=MyToggle / 폼=라벨+46px 입력
│ 빈·오류·로딩 = MyStateView 만           │  스켈레톤은 실제 모양과 같은 높이
└ 하단 버튼(선택) MyStickyCta ───────────┘  주 1개(+보조 1개 왼쪽), 48px, 아래 안전영역 포함, 키보드 위로
```
- 헤더 오른쪽 알림 종은 **홈(L0)에만**. 하위 화면은 그 화면 기능 버튼만.
- 제목 = registry 의 메뉴 이름(D2 해소). 탭 이름도 registry.
- 이 틀 밖 예외 없음: 쿠폰·상품권·찜·매물·주소·후기·프로필 편집 모두 `MyScreen` 으로 이관(기능·데이터 불변, 틀만 교체).

### 2.3 기기별 폭 · 안전영역 (한 토큰)
| 기기(폭) | 본문 | 좌우 여백 | 위 | 아래 |
|---|---|---|---|---|
| 작은 폰 320–359 (Galaxy Z Flip 덮개 제외) | 전체 폭 | **max(16px, 왼/오른 안전영역)** | 52px + `--safe-top` | 탭(60)+`--safe-bottom` 또는 버튼 바+`--safe-bottom` |
| 폰 360–430 (Galaxy·Pixel·iPhone SE~Pro Max) | 전체 폭 | 동일 16px | iPhone 노치 47–59px / Android 상태바 24–48px = `--safe-top` | iPhone 홈 표시줄 34px / Android 제스처 0–48px = `--safe-bottom` |
| 폰 가로 · 폴더블 펼침 600–767 | 가운데 최대 640px | max(16px, 안전영역) — 노치 쪽 47–59px | 동일 | 동일 |
| 태블릿 세로 768–1023 (iPad·Galaxy Tab) | 가운데 640px | 20px | 동일 | 동일 |
| 태블릿 가로 1024–1366 | 가운데 640px — **헤더 줄·탭·하단 버튼 줄도 같은 640px 안에** | 20px | 동일 | 동일 |
- 바탕색·헤더 배경·하단 바 배경만 전체 폭, **글자·카드·탭·버튼은 전부 같은 640px 열**(D6 해소).
- 고정 요소(헤더·탭바·하단 버튼 바·토스트)에 `--safe-left/right` 적용(D7 해소). 토큰은 이미 있음(`app/app-shell.css:48-72`).
- 최소 지원 폭 320px: 제목 1줄 말줄임, 행 제목 2줄 허용, 버튼 글자 1줄 고정(넘치면 버튼이 2줄 높이로 커짐 — 글자 자르지 않음).

### 2.4 전체 진입 지도 (메뉴 → 화면 → 하위 → 뒤로)
| 분류(L1) | 메뉴 = 화면 제목 | 경로(L2) | 하위(L3) | 하단 버튼 | 비고 |
|---|---|---|---|---|---|
| **거래** | 진행중 거래 | `/mypage/products` | 상품 상세 ↗ `/post/[id]` | 판매하기 | 제목 「내 매물」→변경 |
| | 거래 채팅 ↗ | `/community-messenger/trade-chats` | 채팅방 | — | 외부 표시 |
| | 가격 제안 | `/mypage/offers` 탭: 받은·보낸 | — | — | |
| | 찜 | `/mypage/trade/favorites` | 상품 ↗ | — | 거래 허브 틀 → MyScreen |
| | 최근 본 상품 | `/mypage/recent-viewed` | 상품 ↗ | — | 오른쪽: 전체 삭제 |
| | 판매 글 동네 일괄 변경 | `/mypage/section/settings/region` | — | 변경하기 | 부모를 거래로 |
| **커뮤니티** | 내가 쓴 글 | `/mypage/community-posts` | 글 ↗ | — | |
| | 댓글·반응 | `/mypage/community-activity` 탭 4 | 글 ↗ | — | |
| | 공감한 글 · 저장한 글 · 관심이웃 | `/mypage/section/community/{liked-posts,favorite-posts,community-friends}` | 글 ↗ / 프로필 ↗ | — | **고아 → 연결**(D9) |
| **주문·배달** | 주문내역 | `/mypage/store-orders` 탭: 진행·완료·취소 | 주문 상세 `/mypage/store-orders/[id]` → 후기 `/review`, 주문 채팅 ↗ | 상세: 다시 주문 / 후기 쓰기 | |
| | 매장 문의 | `/mypage/store-inquiries` | — | — | |
| | 매장 신청·입점 진행·매장 들어가기 ↗ | `/stores/owner/*` | — | — | 권한별 1행 |
| | 배달K 라이더 | `/mypage/section/store/rider` | — | — | 제목 변경 |
| **자산·혜택** (신규 L1 `asset`) | 포인트 | `/mypage/points` 탭: 전체·적립·사용·충전 | 만료 예정 `/points/expiring` · 포인트 노출 신청 `/points/promotions` | 충전하기 | |
| | 충전 신청 | `/mypage/points/charge` | — | 신청하기 | |
| | 쿠폰 | `/mypage/coupons` 탭: 보유·사용/만료 | — | — | 뒤로 `/stores`→자산, 탭에서 주문 내역·매장 신청 제거 |
| | 상품권 | `/mypage/gift-certificates` | 상세 `/[instanceId]` | 상세: 사용하기 | 동일 |
| | 내 홍보/광고 | `/mypage/ads` | 광고 신청 `/ads/apply`, 피드 요청 `/ads/feed-request` | 신청하기 | |
| | 회원 혜택 | `/mypage/benefits` | — | — | |
| **계정·보안** | (필수정보 카드) | 아이디·전화 시트 / `/mypage/addresses` | 주소 편집·검색 | 저장 | 홈과 같은 카드 |
| | 계정 관리 | `/mypage/account` | 로그인 연동 | — | 제목 「내 정보」→변경 |
| | 주소관리 | `/mypage/addresses` | `/edit`·`/search` | 저장 | 잠금 헤더 → MyScreen |
| | 결제정보 | `/mypage/section/store/payment` | — | — | 부모를 계정으로 |
| | 기기 권한 | `/mypage/section/settings/device-permissions` | — | — | 메뉴명 「개인/보안」→「기기 권한」 |
| | 모아보는·차단한·숨긴 사용자 | `/mypage/section/account/{favorite,blocked,hidden}-users` | 프로필 ↗ | — | |
| | 나의 배터리·신뢰 | `/mypage/trust` | — | — | 프로필 카드에서도 진입 |
| **설정·지원** | 알림 | `/mypage/section/settings/notifications` | 주문 알림 `/mypage/order-notifications` | — | 주문 알림 뒤로 → 알림 |
| | 채팅 설정 · 언어 · 캐시 삭제 | `/mypage/section/settings/{chat-settings,language,cache}` | — | 캐시: 삭제하기 | |
| | 버전 정보 | `/mypage/section/settings/version` | 업데이트 내역 `/mypage/app-updates` | — | |
| | 고객센터 | `/mypage/customer-center` | 공지·시스템·혜택 게시판 → 글 상세 · 상담 내역 `/support-history` · 이전 문의 `/inbox`·`/inquiries` → 글 · 신고 내역 `/reports` → 상세 | 상세: 댓글 입력 | 히스토리 뒤로 사용 |
| | 이용약관 | `/mypage/section/settings/terms` | 약관 본문 | — | |
| | 개인정보처리방침 ↗ · 사업자 정보 ↗ | `/privacy` · `/business-info` | — | — | 공용 화면 |
| | 로그아웃 | (확인 창) | — | — | |
| | 탈퇴하기 | `/mypage/section/settings/leave` | — | 탈퇴 신청(빨강) | 입력 후 뒤로 = 확인 |
| | 관리자 접속 ↗ | `/admin` | — | — | 관리자만 |
- 기존 옛 주소(`/my/*` 70개, `/mypage/section/*` 옛 항목, `messenger` 섹션)는 위 경로로 서버 리다이렉트 유지·갱신.
- C-4 로 숨긴 국가·맞춤·동영상 자동재생은 계속 숨김(경로 유지).

## 3. 구현 단계 (승인 후 · 웹만 · 단계마다 화면 깨짐 없이)
| 단계 | 내용 | 영향 | 완료 확인 |
|---|---|---|---|
| P1 | `mypage-ia.ts`(분류·제목·부모·탭바·외부 표시) + 홈 분류 카드 + L1 분류 화면 6개 + 비로그인 로그인 화면 + 로고 4회 | 홈·섹션·로그인 3곳·리다이렉트 표 | 메뉴 순서·권한 스냅샷(비로그인·회원·사장님·관리자) |
| P2 | 헤더 규칙(제목=메뉴명, 오른쪽 0~1, 종은 홈만) · 뒤로 = registry 부모 · L2+ 탭바 숨김 | `resolve-main-tier1.ts`, `bottom-nav-route-policy.ts`, 16개 직접 헤더 화면 | 81경로 제목·뒤로 목적지 표 자동 검사 |
| P3 | 틀 통일: 직접 헤더 16 + 쿠폰·상품권·찜·매물·주소 3·후기·프로필 편집 → `MyScreen` · 탭 7종 → `MyTabs` · 하단 바 5종 → `MyStickyCta` · 상태 → `MyStateView` | 해당 화면 | 화면별 기능 회귀 테스트 |
| P4 | 폭·안전영역 토큰(본문·탭·하단 바·토스트 같은 640px 열, `--safe-left/right`) | 고정 요소 | 81경로 × 320/360/390/430/768/1024/1366 넘침 0·열 정렬 오차 0 자동 측정 |
| P5 | 죽은 코드 정리(`MyPageLayout`·`MyPageSidebar`·미도달 분기) · 계약 문서 개정 | — | typecheck·eslint |
- 변경 분류: **웹**(네이티브·DB·통화 무관). 주소 HARD LOCK·거래 UI-6 HARD LOCK·판매자 허브 전환 규칙 유지.
- 회귀 위험: 탭바 숨김으로 하위 화면 높이 변화 → 스크롤 복원 위치 · 쿠폰/상품권이 매장 화면에서도 쓰이는 경우(진입 경로별 뒤로) · 프로필 편집 시트 흐름.

## 4. Owner 결정 필요
1. **L2 이하 하단 탭바 숨김** (D8 해소 · 당근·쿠팡·Shopee 상세 화면 방식) — 시안은 숨김.
2. 메뉴명 「개인/보안」→「기기 권한」 (화면 내용이 기기 권한뿐).
3. 고아 화면(공감한 글·저장한 글·관심이웃)을 커뮤니티에 연결 — 시안은 연결.

## 5. 검증 계획
- 코드: typecheck · 관련 vitest · eslint · `verify:routes` · registry 기반 제목/뒤로/탭바 자동 테스트.
- 화면: 위 P4 자동 측정 결과표 + 대표 화면 캡처(폰·태블릿 세로/가로).
- 실기: Android APK·iPhone(노치·홈 표시줄·가로)·태블릿 — Owner 기기 확인 전까지 NOT_PROVEN.
