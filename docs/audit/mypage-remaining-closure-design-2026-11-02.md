# 내정보 잔여 0 설계안 — 실측 감사 결과 + 남은 항목 전부 처리 계획 (승인 요청)

2026-11-02 15:10 PHT · 기준 Production `94794a2a4` (Vercel `dpl_Dcryq2mHYTR5eVEFvUsqahrp4ffE` READY) · 코드 변경 없음(이 문서는 설계만)

## 0. 이번 감사의 확인 조건 (모두 직접 측정)

| 조건 | 방법 | 대상 |
|---|---|---|
| 로그인 · 폰 | samarket.vercel.app · 앱 안 브라우저 · `@aaaa` · 375·393px | 홈·분류 6·메뉴 38 |
| 로그인 · 태블릿 | 같은 세션 · 1024px | 같음 |
| **비로그인 · Production 같은 빌드** | 배포 전용 주소 `samarket-h3sg1zqu4-…vercel.app`(로그인 쿠키 없음, SHA 94794a2a4) | 로그인 화면·공개 행·회원 주소 직접 진입 |
| **iPhone 안전영역(앱과 같은 경로)** | 앱이 쓰는 `--dibay-safe-top/bottom/left/right` 변수를 웹에 그대로 넣음: 세로 59/34/0/0, 가로 0/21/59/59 | 홈·분류·충전 신청·주문내역·주소관리·탈퇴 |
| iOS Safari 실렌더 | Xcode iPhone 17 Pro 시뮬레이터 Safari 기동 확인(측정은 구현 후) | — |
| 스크롤 복원 | 실제 이동(카드 탭 → 행 탭 → 뒤로 ×2) | 홈·설정·지원 |
| 코드 | 전 하위 화면 틀·탭·하단 바·죽은 코드 전수 (file:line 부록) | /mypage 전체 |

## 1. 감사 결과 — 이미 PASS (Production 실측)

- 메뉴 38개 = 화면 제목 일치 (375·1024). 외부 화면 2개(사장님 입점 신청·관리자)는 그 화면 제목.
- 가로 넘침 0 · 하위 화면 하단 탭 없음 · 하위 화면 알림 종 없음(수정 후 재확인).
- 직접 진입 뒤로: 쿠폰 → 자산·혜택 · 만료 예정 → 포인트 · 진행중 거래 → 거래 · 판매 글 동네 일괄 변경 → 거래.
- 비로그인 Production: `/mypage` = 로그인 화면 · 알림 종 없음 · 로고 3번 = 안 열림 / 4번 = 열림 · `/login` 에도 운영자 입구 없음 · 약관·버전·고객센터 로그인 없이 열림.
- iPhone 세로(59/34): 헤더 제목 74px(노치 아래) · 하단 버튼 바닥 808 ≤ 818(홈 표시줄 위) · 탭 항목 정상.
- iPhone 가로(좌우 59): 본문 글자 70px부터 · 하단 버튼 좌우 138px · 탭 항목 126px — 노치 침범 없음.

## 2. 감사 결과 — FAIL (남은 결함, 전부 이번 설계로 처리)

| # | 결함 | 증거 |
|---|---|---|
| F1 | **탈퇴하기 화면**: ① 본문이 작은 회색 묶음 제목 「삭제 시 사라지는 정보」로 바로 시작 — 화면 목적·결과를 말하는 첫 문단 없음 ② 헤더 「탈퇴하기」 ↔ 버튼 「계정 삭제 요청」 용어 불일치 ③ 뒤로 버튼 이름 「내정보로」인데 실제로는 「설정·지원」으로 감 | 375px 캡처, 헤더 DOM `aria-label="내정보로"` |
| F2 | 모든 하위 화면 뒤로 버튼 이름이 「내정보로」 (목적지와 다름 — 화면 낭독기·접근성) | `MySubpageHeader` 기본 `common_back_to_mypage` |
| F3 | **비로그인으로 회원 주소 진입이 제각각**: 포인트 = 「—」 회원 화면 그대로 · 쿠폰 = 화면 안 「로그인하면…」 · 주문내역 = 하단 탭 없는 `/login` 전체 페이지 · 분류/설정 = 내정보 로그인 화면 | 배포 주소 실측 |
| F4 | **스크롤 복원 실패**: 홈 381px → 분류 → 뒤로 = 0 / 설정·지원 220px → 이용약관 → 뒤로 = 0. 홈은 저장(y=350)은 되는데 복원이 안 됨, 분류 화면은 저장·복원 코드 자체가 없음 | 실측 + `MyInfoIaCategoryScreen.tsx`(복원 없음), `mypage-hub-scroll-restore.ts:28` |
| F5 | **주소관리 마지막 요소가 홈 표시줄에 걸림**: 세로 836 > 818, 가로 377 > 372 | 안전영역 실측 |
| F6 | 화면 안 탭 모양 5종 잔존: 쿠폰·상품권(상자형 `CommerceHubSegmentTabs`) · 진행중 거래(알약형 `MyProductFilter`) · 찜(알약형 `TradeManagementTabBar`) · 내가 쓴 글(알약형) · 내 광고(손수 만든 밑줄) · 고객센터 게시판(칩) | 감사 부록 §1 |
| F7 | 화면 틀 비통일: 헤더 직접 그리는 화면 16개(포인트 4·광고 3·혜택·댓글·글·최근 본·매물·주문 상세·문의함 등) — 로딩·빈·오류·하단 여백이 화면마다 다름 | 부록 §3 |
| F8 | 하단 버튼 바 비통일: 주소 편집·주문 후기(화면 고정형 안쪽 바) · 프로필 편집 저장 바(탭 인식 없음) | 부록 §2 |
| F9 | 죽은 코드: `MyPageLayout`·`MyPageSidebar`·`MyPageSectionMenuClient`·`MyPageStackShell`·`MyInfo*MenuSection` 8개·`MypagePointsAssetSummary`·`MyInfoGuestProfileCard`·`MyInfoStatGrid`·`MyInfoQuickAccessSection`·`useMypageGuestMenuNav`·옛 홈 메뉴 배열·`buildMypageHomeMenuOrder`·`MyPageItemScreen` 도달 불가 분기·`FavoriteFilterBar` 등 | 부록 §4 |
| F10 | **iOS 심사 위험(실재)**: 심사용 계정은 관리자가 만든 아이디·비밀번호 계정(`docs/store-review-auth-setup-checklist.md:27-29`) → 이제 로고 4회 탭 없이는 심사자가 로그인 못 함 | 문서 |

## 3. 처리 설계 (승인 후 한 번에 구현 · 웹만)

### S1 탈퇴하기 (F1) — 「설정·지원 › 탈퇴하기」
- 용어 통일: 헤더 「탈퇴하기」 · 버튼 「탈퇴 신청하기」(빨강) · 완료 문구 「탈퇴 신청이 접수됐습니다」 — `ui_account_delete_*` 의 「계정 삭제」 표기를 「탈퇴」로.
- 본문 첫 블록(신규): 경고 아이콘 + 「탈퇴하면 되돌릴 수 없어요」 + 1줄 설명(처리 기간·재가입 안내 — **문구 값은 현재 계약 문구 그대로**, 새 정책 숫자 넣지 않음).
- 순서: 첫 블록 → 사라지는 정보 → 보관되는 기록 → 사유 → 동의 체크 → 하단 [취소] [탈퇴 신청하기].
- 뒤로 = 설정·지원(입력 있으면 기존 확인 창 유지).

### S2 뒤로 버튼 이름 (F2)
- 하위 화면 뒤로 `aria-label` = 「뒤로」 하나로 (`MySubpageHeader`·`MyScreen`). 화면 낭독기는 목적지 제목을 따로 읽음.

### S3 비로그인 통일 (F3) — 규칙 1개
- 비로그인 + 공개 아닌 `/mypage/**` → **`/mypage?next=<원래 주소>`** 로 교체(로그인 화면) → 로그인 성공 시 `next` 로 이동.
- 공개 = `/mypage`, `/mypage/customer-center/**`, `/mypage/section/settings/{terms,version,language}` (`mypage-ia.ts` 한 곳).
- 구현: `app/(main)/mypage/layout.tsx` 에 `MypageGuestGate`(회원 확정 전 대기 · 게스트 확정 시 교체) / 서버 차단 경로(`/mypage/store-orders`, `/mypage/trade/chat`, `/mypage/business`, `…/edit` — `lib/auth/guest-browse-access-policy.ts:123-134`)의 이동 목적지를 `/login` → `/mypage?next=` 로 / `AuthLoginPanel next` = 검증된 `next` 파라미터 / `MypageGuestSubrouteRedirect` 3곳 → 게이트로 대체.
- 결과: 포인트·쿠폰·주문내역 등 어떤 회원 주소로 들어와도 같은 로그인 화면, 하단 탭 있음.

### S4 스크롤 복원 (F4)
- 분류 화면 6개에 기존 목록 복원 훅 `useMypageListRestore` 연결(키 = 경로).
- 홈: 저장은 되므로 **복원 시점** 결함 — 구현 첫 단계에서 `restoreMypageHubScrollY` 가 내정보 홈 탭 유지(keep-alive) 화면의 스크롤 영역을 다시 잡는지 계측해 원인을 확정하고 고친다. 원인 확정 전 다른 우회(타이머 연장 등) 금지.
- 완료 기준(실측): 홈·분류·목록 3단계 왕복 복원 오차 ≤ 8px, 375·1024px.

### S5 주소관리 하단 (F5)
- 주소 화면(화면 고정형)의 하단 묶음에 `padding-bottom: max(12px, --safe-bottom)` — 주소 HARD LOCK 의 구조·동작은 불변, 여백만.
- 완료 기준: 세로 59/34·가로 0/21/59/59 에서 마지막 요소 ≤ 화면높이−아래안전영역.

### S6 탭 1종 (F6)
- 내정보 화면 탭은 전부 `MyTabs`(밑줄형). 다른 도메인과 공유하는 부품은 **바꾸지 않고 내정보에서만 교체**:
  - 쿠폰·상품권: 지갑 본문에 `tabsVariant` 를 넣어 `/mypage/*` 경로면 `MyTabs`, `/orders/*` 는 기존 상자형 유지(링크 이동 → `MyTabs` + 같은 URL 파라미터 `couponTab`·`giftTab`).
  - 진행중 거래: `MyProductFilter` → `MyTabs` + 「포인트 홍보만」은 탭 아래 토글 칩 1개(거래 공용 `DibaySecondaryTabRow` 불변).
  - 찜: `FavoritesHubView`·`FavoriteProductsView` 에 내정보 경로일 때 `MyTabs`(판매내역 화면·홈 거래 이력 시트는 기존 유지).
  - 내가 쓴 글·내 광고 → `MyTabs`. 고객센터 게시판 칩 → `MyTabs`(링크형 지원 추가).
  - 숫자 표기 1종: 탭 이름 오른쪽 작은 숫자.

### S7 화면 틀 1종 (F7)
- 헤더 직접 그리는 16개 → `MyScreen`(제목·뒤로·오른쪽 기능·본문 640px·`MyStateView`·하단 여백 자동).
- 예외(화면 고정형 3종: 주소 목록·편집·검색, 주문 후기)는 `MyScreen` 에 `layout="locked"` 변형을 추가해 같은 부품으로(전역 헤더 대신 화면 안 헤더 — 기존 고정 구조 유지).

### S8 하단 바 1종 (F8)
- `MyStickyCta` 에 `layout="inline"`(화면 고정형 안쪽 하단) · `submitFormId`(form submit) 추가 → 주소 편집·주문 후기·프로필 편집 저장 바를 모두 `MyStickyCta` 로. 키보드 위 고정·안전영역은 기존 `useFormKeyboardViewport` 그대로.
- 주문 후기는 `/orders/store/[id]/review` 와 같은 폼을 공유 → 내정보 경로일 때만 `MyStickyCta`, 주문 도메인 경로는 기존 유지.

### S9 죽은 코드 (F9)
- 부록 §4 의 0 사용처 파일·함수 삭제, 관련 테스트·검증 스크립트·i18n 키 정리. `messenger` 섹션 삭제 + `/mypage/section/messenger` → `/mypage` 서버 리다이렉트 추가(404 방지).

### S10 iOS 심사 (F10) — 코드 아닌 절차, 이번에 확정
- `docs/store-review-auth-setup-checklist.md` 에 심사 메모 문안 추가(제출 때 App Store Connect 「App Review Information › Notes」에 그대로 붙임):
  > Demo account sign-in: on the login screen, tap the dibaY logo 4 times within 3 seconds to show the ID/password form, then sign in with the credentials above.
- 같은 문안을 Play Console 심사 안내에도. 이 절차가 들어가야 F10 이 닫힘(제출 시 Owner 확인 1회).

## 4. 영향 · 회귀 방지

| 영역 | 공유 사용처 | 처리 |
|---|---|---|
| 쿠폰·상품권 지갑 | `/orders`, `/orders/activity` | 경로 분기 — 주문 도메인 화면 불변 테스트 |
| 찜·판매내역 탭 | `/philife/sales`, 홈 거래 이력 시트 | 내정보 경로만 교체 |
| 주문 후기 폼 | `/orders/store/[id]/review`, 주문 목록 슬라이드 | 내정보 경로만 교체 |
| 주소 화면 | 온보딩 주소 | 여백만, 구조 불변(주소 HARD LOCK) |
| 서버 비로그인 차단 | 프록시 | `/mypage/**` 만 목적지 변경, 다른 도메인 `/login` 불변 |

## 5. 완료 기준 · 검증 (모두 직접 측정, 결과표로 보고)

1. 코드: typecheck(build·test) · 관련 vitest · eslint · 내정보 검증 스크립트 3종 · `verify:routes`.
2. Production 로그인(앱 안 브라우저 `@aaaa`): 메뉴 38 제목 일치 · 뒤로(새 탭 직접 진입) 전 L2/L3 · 탭 모양 1종(전 화면 `[data-my-tabs]` 존재) · 하단 바 1종 · 스크롤 복원 ≤8px — 360·393·768·1024px.
3. Production 비로그인(배포 전용 주소): 회원 주소 15개 직접 진입 → 전부 `/mypage?next=` 로그인 화면 · 공개 행 열림 · 로그인 후 원래 주소(로그인은 실행하지 않고 `next` 값만 확인).
4. 안전영역: iPhone 세로/가로 · Android 제스처(위 24·아래 16)·3버튼(아래 48) · iPad 가로 — 변수 주입 측정 + iOS 시뮬레이터 Safari 캡처(세로·가로).
5. 탈퇴 화면: 캡처 + 문구 대조표.
6. Owner 휴대폰: 위 결과 보고 후 Owner 확인 — 이 항목만 제가 대신할 수 없음(실기 NOT_PROVEN 으로 표기).

## 부록 — 코드 감사 근거
조사 결과 원문(file:line 표): 탭 9종 · 하단 바 4종 · 비-MyScreen 화면 22개 · 죽은 코드 25건 · 스크롤 복원 구조 · 심사 계정 문서. (세션 감사 기록, 필요 시 이 문서 하단에 첨부)
