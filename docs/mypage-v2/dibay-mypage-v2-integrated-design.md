# DIBAY 내정보(/mypage) 통합 설계안 v2 — 상용 슈퍼앱 수준 UX·IA·기능·검증

- 작성: 2026-10-20 · 기준 main `5b43cf16` · Production SHA NOT_PROVEN(Vercel 조회 403)
- 상태: **설계안 — Owner 승인 전 구현·DB·배포 금지**
- **최종본: `docs/mypage-v2/dibay-mypage-v2.1-supplement.md`(v2.1 최종 설계안)가 우선한다.** 이 문서는 결함 D1~D22 원인·근거와 화면 상세 참고용
- 입력: 1차 감사(75 페이지 · 결함 D1~D22) · 운영 DB 읽기 전용 조회 · 공유 의존성 호출 그래프 · 상용 앱 벤치마킹
- 판정 표기: PASS / DEFECT / MISSING / NOT_PROVEN / OUT_OF_SCOPE. 측정하지 않은 것은 NOT_PROVEN.

---

## 0. 요약

| 구분 | 결론 |
|---|---|
| P0 (보안·개인정보·금액) | D1 사진 삭제 취약점 · D2 찜 화면 훅 오류 · D3/D20 공개 프로필 주소 노출 · D4 음수 잔액 0 표시 → **디자인 개편과 분리한 PR-1** 로 먼저 처리 |
| IA | 메뉴 100% 재배치. 프로필 헤더 아래 메뉴 그룹 8개(현행: 거래·매장주문·자산·계정·서비스·고객센터·정책·위험) → 8개(나의 거래 · 나의 커뮤니티 · 주문·배달 · 매장 운영 · 내 자산·혜택 · 계정·설정 · 고객지원·앱 정보 · 계정 관리) + 관리자(권한자). 메뉴 행 35개 → 32개. 숫자(판매중·안읽음·진행중 주문·잔액)를 행 오른쪽 값으로 표시 |
| 디자인 | 홈의 스타벅스 하드코딩 색(#00704A 등) 전면 제거 → `--sam-*` 토큰. 카드·테두리·그림자 제거한 **그룹 리스트**, 행 52px, 인셋 구분선. 내정보 전용 공통 컴포넌트 9종을 새로 만들어 **내정보 전 화면(실제 화면 49개)** 에 적용 |
| 기능 | 목업·빈 화면 제거: 최근 본 상품 실제 기록, 회원 혜택 실제 정책 연결(운영 DB 활성 정책 3건 존재), 구매 내역 실제 화면, 보낸 제안 철회, 주문 내역서, iOS 업데이트 확인. 효과 없는 설정 3종 제거 |
| DB | 마이그레이션 5건(M1~M5) — 전부 Owner 승인 항목 |
| PR | PR-1(P0, 소형) → PR-2(내정보 v2 통합) → PR-3(메신저 그룹 이름 D13, 타 도메인). 근거 §12 |
| 네이티브 | 변경 없음(iOS 업데이트도 기존 `@capacitor/app`·`@capacitor/browser` 로 웹 코드 구현). [배포 구분] 웹만 → 배포 후 앱 재시작 |

---

## 1. 상용 앱 벤치마킹

### 1.1 조사 방법과 한계 (정직 표기)

- 이 작업 환경의 프록시가 apps.apple.com · play.google.com · telegram.org · cs.kakao.com · daangn.com · baemin.com · yogiyo.co.kr · m3.material.io 를 차단했다. **앱 화면 스크린샷은 한 장도 확보하지 못했다.**
- 직접 열어 확인한 1차 근거: Telegram Android/iOS **공식 오픈소스 코드**, Apple HIG, developer.android.com.
- 한국 앱 4종은 **검색엔진이 요약한 공식 고객센터 FAQ 문구 + URL** 수준이다. 시각 항목(행 높이·아이콘·구분선)은 한국 앱에 대해 **미확인**.
- 따라서 아래 표의 "미확인"은 추측으로 채우지 않았다. 구현 전 Owner 실기기 캡처로 보강 가능(§13 결정 항목 아님 — 설계는 확인된 패턴만 사용).

### 1.2 비교표

| 비교 항목 | Telegram (1차: 소스코드) | 당근 (공식 FAQ, 검색 요약) | 카카오톡 (공식 cs.kakao.com, 검색 요약) | 배달의민족 | 요기요 |
|---|---|---|---|---|---|
| 1. 메뉴 그룹·순서 | 프로필 → (조건부 제안카드) → 계정 목록 → **Account / Chat Settings / Privacy & Security / Notifications / Data and Storage / Chat Folders / Devices / Power Saving / Language** → Premium·Stars(잔액)·Business·Gift → **Help**(질문·FAQ·Features·Privacy Policy) | 나의 당근 안에 내 동네 설정·키워드 알림·나의 거래(관심목록)·고객지원·맨 아래 설정 (순서 전체는 미확인) | 더보기 탭 → 톱니 → 알림·채팅·테마·앱 관리(버전)·개인/보안 (전체 순서 미확인) | 미확인 | 마이요기요 → 자주 묻는 질문 → 포인트 경로만 확인 |
| 2. 프로필 영역 | 아바타 90dp 가운데 + 카메라 배지 → 이름 22sp → "+전화 • @username" | 매너온도(36.5°C 시작, 최대 99°C) + 표정 아이콘 | 내 프로필 하단 [프로필 편집] 버튼, 사진 위 카메라 버튼 | 미확인 | 미확인 |
| 3. 터치 횟수 | 프로필 편집 1탭, 알림 1탭 | 키워드 알림 1탭(나의 당근 → 키워드 알림) | 알림 2탭(더보기 → 톱니 → 알림) | 쿠폰 등록 2탭(마이배민 → 선물함) (2차 출처) | 포인트 FAQ 2탭 |
| 4. 행 스타일 | 일반 **50dp**, 2줄 60dp, 아이콘 있을 때 **인셋 구분선(왼쪽 58dp)**, 섹션 사이 그림자 띠 | 미확인 | 미확인 | 미확인 | 미확인 |
| 5. 하위 헤더·내비 | 전체 화면 push + 뒤로가기. 태블릿 오른쪽 패널에서는 뒤로 → 닫기(X) | 미확인 | 미확인 | 미확인 | 미확인 |
| 6. 시트·모달 기준 | 질문하기 = 다이얼로그, 선물 = 바텀시트, FAQ·정책 = 브라우저 | 미확인 | 미확인 | 미확인 | 미확인 |
| 7. 저장·삭제 CTA | 편집 화면 상단 오른쪽 ✓ — **변경이 있을 때만 표시**, 저장 중 같은 자리 스피너. 로그아웃 = 목록 맨 아래 빨간 행 | 키워드 '설정'·'편집'·휴지통 | 상태메시지 연필 아이콘(60자) | 미확인 | 리뷰 7일 내 작성·수정 |
| 8. 로딩·빈·오류 | 미확인 | 미확인 | 미확인 | 미확인 | 미확인 |
| 9. 금액·상태 표시 | Stars·TON 잔액을 **행 오른쪽 값**으로(0이면 비움). iOS 정수/소수 크기 차등 | 매너온도 수치+아이콘 | — | 페이머니 결제 시 포인트 적립(표시 위치 미확인) | 미확인 |
| 10. 모바일·태블릿 | 태블릿 2분할(왼쪽 max(320dp, 35%)), 설정 하위는 오른쪽 패널 | 미확인 | iPad 1대 동시 접속(레이아웃 미확인) | 미확인 | 미확인 |

출처
- Telegram Android: `DrKLO/Telegram` master — `TMessagesProj/src/main/java/org/telegram/ui/SettingsActivity.java`(fillItems 618–760, 행 1100–1250, 헤더 396–548), `Cells/TextCell.java`(64·842), `UserInfoActivity.java`(262, 278–281, 449, 654–692), `LaunchActivity.java`(951–975)
- Telegram iOS: `TelegramMessenger/Telegram-iOS` — `submodules/TelegramUI/Components/PeerInfo/PeerInfoScreen/Sources/PeerInfoSettingsItems.swift`
- 당근: cs.kr.karrotmarket.com/wv/faqs/110 · /18 · /158 · /135 · /83, daangn.com/kr/trust/
- 카카오: cs.kakao.com/helps_html/1073188090 · 1073189021 · 1073189028 · 1073209347 · 1073184685 · 1073192198
- 배민: baemin.com/coupon/cpnReg, cocosyou.com/234(2차) · 요기요: partner.yogiyo.co.kr 포인트 공지, yogiyo.co.kr 이용약관(20231004)
- Apple HIG: Lists and tables · Accessibility · Buttons · Sheets (developer.apple.com/design/human-interface-guidelines/…)
- Android: developer.android.com/guide/topics/ui/accessibility/apps(48dp), /develop/ui/compose/components/snackbar, /bottom-sheets

### 1.3 확인된 패턴 → DIBAY 적용 여부

| # | 패턴 (근거) | 적용 | 이유 |
|---|---|---|---|
| P1 | 마이/설정 루트에서 하위 기능 **1탭** 도달 (Telegram·당근·카카오·요기요 4개) | 적용 | 홈 그룹 리스트에서 모든 기능 1탭. 2단계 허브는 「개인정보·보안」「약관 및 정책」「고객센터」 3개만 |
| P2 | 고객지원·도움말을 목록 **하단 그룹**에 둠 (4개 앱) | 적용 | 「고객지원·앱 정보」를 계정 관리 바로 위 |
| P3 | 잔액·지표를 **행 오른쪽 값**으로 (Telegram, 당근 매너온도) | 적용 | 포인트 잔액·쿠폰 수·판매중 수·안읽음·진행중 주문을 행 값으로. 0 은 비움(Telegram 동일) — 단 **포인트는 0P 도 표시**(금액은 0 과 미확인을 구분해야 함, §8 D4) |
| P4 | 행 50dp 전후 + 인셋 구분선 (Telegram) · 터치 44pt/48dp (HIG·Android) | 적용 | 행 최소 52px(토큰 `--sam-header-row-height` 52 와 일치, 48dp 이상), 아이콘 열 오른쪽부터 구분선 |
| P5 | 편집 화면 저장 버튼은 **변경 시에만 활성**, 저장 중 같은 자리 진행 표시 (Telegram) · Done 은 Cancel/Back 과 함께 (HIG Sheets) | 적용 | 프로필 편집: 상단 오른쪽 「저장」 + 하단 고정 저장 바 중 **하단 고정 바 단일**로(키보드 위 노출 보장, 기존 `ProfileEditBottomSaveBar` 재사용). 변경 없으면 비활성 |
| P6 | 파괴적 동작은 맨 아래 빨간 행 (Telegram) | 적용 | 로그아웃 = 맨 아래 빨간 텍스트 행 + 확인 시트. 탈퇴 = 그 아래 보조 링크 |
| P7 | 신뢰 지표는 프로필 옆 수치+시각 아이콘, 계산 규칙 공개 (당근 FAQ) | 적용 | 매너 배터리 % + 배터리 아이콘, 상세에 **실제 계산 규칙** 공개(§8 D15) |
| P8 | 언어 행은 현재 값 표시 (Telegram) | 적용 | 「언어  한국어 ›」 → 액션 시트 선택 |
| P9 | 저장 확인·삭제 취소에 Snackbar (Material) | 적용 | 내정보 전용 토스트(§7) — 삭제·저장 성공/실패 |
| P10 | 태블릿 2분할 (Telegram) | **미적용** | 저장소 계약 `lib/ui/mypage-responsive-breakpoints.ts` + `LEGACY-IA-PHASE1-CONTRACT.md` 가 "모든 폭 1열, 목록+상세 분할 FAIL" 로 고정. 태블릿은 가운데 1열(최대 폭 제한)로 유지 |
| P11 | 매너온도 반영 3–10일 지연 안내 (당근) | **미적용** | DIBAY 는 즉시 재계산(코드 확인). 안내 문구를 실제 동작(즉시)으로 맞춘다 |
| P12 | 상단 오른쪽 톱니로 설정 분리 (카카오) | **미적용** | DIBAY 는 설정 항목이 홈 그룹에 이미 있음. 톱니 추가는 진입 중복 |

---

## 2. 현행 내정보 메뉴 트리 (1차 감사 확정본 요약)

회원 홈 렌더 순서(`components/mypage/MyPageHomeDashboard.tsx:57-77`):

```
[헤더] 내정보 · 🔔
1 프로필 카드 (사진·이름·@ID·소개·매너배터리→/mypage/trust) — 탭 시 편집 시트
2 계정·인증 카드 (@ID 시트·전화 시트·대표 주소) — 완료 시 숨김
3 거래: 진행중 거래(/mypage/trade/sales→/mypage/products) · 채팅(/community-messenger/trade-chats) · 찜 · 내 가격 제안 · 최근 본 글(목업) · 거래 후기
4 매장·주문: [매장 신청|승인 진행|매장 입장] · 주문내역 · 배달K 라이더(빈 화면)
5 내 자산: 포인트 · 쿠폰 · 내 광고 · 충전 신청
6 계정: 계정 · 주소 · 결제정보(→매장 정산) · 개인/보안(→기기 권한) · 알림 · 언어 토글 · 지역/국가
7 서비스: 관심 사용자 · 차단 · 숨김 · 동영상 자동재생 · 지역 일괄변경 · 채팅 · 개인화 · 캐시 삭제 · 버전
8 [관리자] (권한자)
9 고객센터
10 정책: 약관 · 개인정보 · 사업자정보
11 위험: 탈퇴 · 로그아웃
```

- 비로그인: 통계 줄("—")·퀵메뉴(커뮤니티 포함) 노출, 거래·자산·관리자 그룹 없음, 로그아웃 행 노출(D21).
- 로그인: **커뮤니티 진입 없음**(D6).
- 페이지 75개 = 실제 화면 44 + 리다이렉트 31 (페이지 인벤토리 기준). 섹션 레지스트리(`section/[section]/[item]`)로 추가 화면 34종 디스패치.
- 홈 메뉴는 코드 하드코딩. CMS 테이블(`my_services`·`my_page_sections`)은 읽기만 하고 렌더하지 않음.

---

## 3. 최종 제안 메뉴 그룹 · 정확한 표시 순서

### 3.1 순서 결정 근거

| 근거 | 내용 |
|---|---|
| 운영 사용량 (운영 DB, 2026-10-20) | 거래 채팅 442건/**39명** · 거래글 200건/25명 · 매장 주문 836건/29명(1인 최대 83건) · 포인트 원장 511건/29명 · 주소 177건/67명 · 커뮤니티 글 122건/3명 · 댓글 12건/7명 · 찜 27건/15명 · 가격 제안 39건/16명 · 거래 후기 29건/12명 · 고객 문의 34건 |
| 해석 | 사용 **회원 수**가 가장 많은 축 = 거래(39명) > 주문(29명) = 자산(29명). 커뮤니티는 글쓴이 3명(운영자 위주)이지만 열람·댓글 7명. → 활동(거래·커뮤니티)을 주문보다 위, 단 거래와 커뮤니티를 **별도 그룹**으로 나눠 거래가 먼저 |
| 기존 계약 | `LEGACY-IA-PHASE1-CONTRACT.md` 순서: identity → trade → store_order → assets → account → service → support → policy → danger. v2 는 이 순서를 **보존**하면서 community 추가, service·policy 를 account·support 로 흡수 → 계약 개정 필요(§13-1) |
| 벤치마킹 | P1(1탭) · P2(지원 하단) · P3(값 표시) · P6(파괴적 하단) |
| 기기 | Android 46명 · iOS 6명 (`user_devices`) — Android 기준 터치 48dp 이상 필수 |

### 3.2 확정 제안 — 회원(로그인) 홈

| 순서 | 그룹 | 행 (표시 순서) | 오른쪽 값 | 이동 |
|---|---|---|---|---|
| A | **프로필** | 프로필 헤더: 사진 64 · 닉네임 · @DIBAY ID · 동네(공개 라벨) · 소개 1줄 · [프로필 편집] | — | `/mypage/profile/edit` |
| A-1 | | 매너 배터리 행 | `72%` + 막대 | `/mypage/trust` |
| A-2 | | (조건) 필수정보 안내 줄 — 미완료 항목만 1줄씩 | [인증하기] | `/mypage/required/phone` · `/dibay-id` |
| B | **자산 요약 바** | 포인트 · 쿠폰 2칸 | `1,250P` · `3장` | `/mypage/points` · `/mypage/coupons` |
| C | **나의 거래** | 1 판매 내역 | 판매중 n | `/mypage/trade/sales` |
| | | 2 구매 내역 | — | `/mypage/trade/purchases` |
| | | 3 거래 채팅 | 안읽음 n | `/community-messenger/trade-chats` |
| | | 4 찜 목록 | n | `/mypage/trade/favorites` |
| | | 5 가격 제안 | 받은 대기 n | `/mypage/offers` |
| | | 6 거래 후기 | — | `/mypage/trade/reviews` |
| | | 7 최근 본 상품 | — | `/mypage/recent-viewed` |
| D | **나의 커뮤니티** | 1 내가 쓴 글 | n | `/mypage/community-posts` |
| | | 2 댓글·반응 | — | `/mypage/community-activity` |
| | | 3 저장한 글 | — | `/mypage/community-activity?tab=saved` |
| | | 4 관심 사용자 | — | `/mypage/section/account/favorite-users` |
| E | **주문·배달** | 1 주문 내역 | 진행중 n | `/mypage/store-orders` |
| | | 2 매장 문의 내역 | — | `/mypage/store-inquiries` |
| F | **매장 운영** (항상 표시, 내용은 권한별) | 미신청: 매장 입점 신청 / 심사중: 입점 심사 진행 [상태 뱃지] / 승인: 내 매장 관리 | 뱃지 | `OwnerRoutes.apply()` / `hub()` / `hub(firstId)` |
| G | **내 자산·혜택** | 1 포인트 | 잔액 | `/mypage/points` |
| | | 2 쿠폰 | n장 | `/mypage/coupons` |
| | | 3 상품권 | n장 | `/mypage/gift-certificates` |
| | | 4 광고·홍보 | 진행 n | `/mypage/ads` |
| | | 5 회원 혜택 | — | `/mypage/benefits` |
| H | **계정·설정** | 1 계정 정보 | — | `/mypage/account` |
| | | 2 주소 관리 | 대표 주소 동네 | `/mypage/addresses` |
| | | 3 알림 | — | `/mypage/section/settings/notifications` |
| | | 4 채팅 | — | `/mypage/section/settings/chat-settings` |
| | | 5 개인정보·보안 | — | `/mypage/section/settings/privacy` (신규 허브) |
| | | 6 언어 | 한국어 | 액션 시트 |
| | | 7 캐시 삭제 | 사용량(가능 시) | `/mypage/section/settings/cache` |
| I | **고객지원·앱 정보** | 1 고객센터 | — | `/mypage/customer-center` |
| | | 2 공지사항 | 새 글 점 | `/mypage/customer-center/notice` |
| | | 3 앱 버전 | `1.2.3 (6)` · [업데이트] 뱃지 | `/mypage/section/settings/version` |
| | | 4 약관 및 정책 | — | `/mypage/section/settings/terms` (허브로 확장) |
| J | **[관리자]** (권한자만, 기존 컴포넌트 유지) | 관리자 콘솔 | — | `/admin` |
| K | **계정 관리** | 로그아웃 (빨간 텍스트 행 → 확인 시트) | — | — |
| | | 회원 탈퇴 (행 아래 보조 텍스트 링크) | — | `/mypage/section/settings/leave` |

- 메뉴 행 수: 32 (현행 35, 프로필·매너 배터리·관리자 행 제외). 2단계 허브: 개인정보·보안 · 약관 및 정책 · 고객센터.
- 오른쪽 숫자 SSOT: §10.2 `/api/me/mypage-summary` — **목적지 화면과 같은 서버 조회 함수**로 계산. 첫 화면은 숫자 없이 먼저 그리고(콜드부트 계약 유지), 숫자는 비동기로 채운다. 숫자를 모르면 비움(0 표시 금지), 포인트만 "—".

### 3.3 비로그인 홈

- 프로필 자리: 기본 아바타 + "로그인하고 내정보를 관리하세요" + [로그인/가입] 주 버튼.
- 그룹 C~I 를 **같은 순서**로 표시하되 오른쪽 값 없음, 행 탭 → 로그인 후 원래 목적지로 복귀(`requireAuth` 기존 훅).
- 자산 요약 바·매장 운영·관리자·**계정 관리(로그아웃·탈퇴) 숨김**.
- 기존 비로그인 전용 통계 줄·퀵메뉴는 폐기(값이 항상 "—" 인 장식).

### 3.4 권한별 차이

| 회원 유형 | 차이 |
|---|---|
| 일반 | 위 표 그대로 |
| 매장 신청/심사중/승인 | F 그룹 행 문구·뱃지·목적지만 바뀜 (기존 `resolveMypageHomeStoreOwnerEntry` 재사용) |
| 매장 사장님 | 고객센터 문의함 → 매장 운영 상담 강제 이동(현행 `MypageCsOwnerCareBridge`) 유지 |
| 관리자 | J 그룹 추가 (기존 `MyPageAdminMenuEntry`·`/api/admin/access-check` 재검증 로직 **변경 없음**) |
| 재로그인 필요 | 프로필 자리에 재로그인 카드, 자산 요약 숨김(현행 유지) |

---

## 4. 기존 메뉴 → 개선 메뉴 매핑

### 4.1 홈 행

| 현행 | v2 | 처리 근거 |
|---|---|---|
| 프로필 카드 탭 → 편집 시트 | A 프로필 헤더 [프로필 편집] → 전체 화면 | 편집 구현 2개(시트 `EditPublicProfileSheet` + 페이지 `ProfileEditForm`) 중복 → 페이지 하나로 통합 |
| 계정·인증 카드 | A-2 필수정보 안내 줄 + H-1 계정 정보 | 카드 제거, 미완료만 노출 |
| 진행중 거래 | C-1 판매 내역 | 라벨=실제 내용(판매글 목록) |
| 채팅 | C-3 거래 채팅 | 라벨 명확화 |
| 찜 · 내 가격 제안 · 거래 후기 | C-4 · C-5 · C-6 | 유지 |
| 최근 본 글(목업) | C-7 최근 본 상품(실제 기록) | D7 |
| (없음) | C-2 구매 내역 | 구매 이력 화면 신설(기존 구매 이력 컴포넌트 재사용) |
| (로그인 홈에 없음) | D 그룹 4행 | D6 |
| 매장 신청/입장 | F 매장 운영 | 그룹 분리 |
| 주문내역 | E-1 | 유지 |
| 배달K 라이더 | **제거** | 주문내역 링크 1개뿐인 빈 화면. 회원용 라이더 기능 없음. 대체 경로: 주문내역(E-1). 라이더 기능 출시 시 F 그룹에 권한 행으로 추가 |
| 포인트 · 쿠폰 · 내 광고 | G-1 · G-2 · G-4 | 유지 |
| 충전 신청 | G-1 포인트 화면 안 [충전] 버튼 | 행 중복 제거 (진입 1탭 유지: 자산 요약 바 → 포인트 → 충전 2탭) |
| (진입 없음) 상품권 · 혜택 · 매장 문의 | G-3 · G-5 · E-2 | D19 |
| 계정 · 주소 · 알림 | H-1 · H-2 · H-3 | 유지 |
| 결제정보 | **제거** | 실제 = 매장 정산 화면, 모든 회원에게 Coin·캐시 문구 노출(정산 SSOT §4 위반). 대체 경로: F 매장 운영 → 매장 관리 → 정산 |
| 개인/보안 | H-5 개인정보·보안(허브) | 기기 권한·차단·숨김·연동 로그인 묶음 |
| 언어 토글 | H-6 언어(값+시트) | P8 |
| 지역/국가 | **제거** | `preferred_country` 읽는 기능 0곳(코드 확인). DB 컬럼 유지 |
| 관심 사용자 | D-4 | 커뮤니티 관계 |
| 차단 · 숨김 | H-5 허브 안 | |
| 동영상 자동재생 | **제거** | `video_autoplay_mode` 읽는 기능 0곳. 앱 내 영상(`PostVideoEmbed`)은 원래 자동재생 없음 |
| 지역 일괄변경 | C-1 판매 내역 화면 상단 [지역 일괄변경] | 판매글 지역 일괄 수정 = 판매 관리 기능 |
| 채팅 | H-4 | 유지 |
| 개인화 | **제거** | `personalization_enabled` 읽는 기능 0곳 |
| 캐시 삭제 | H-7 (실제 동작 구현) | D16 |
| 버전 | I-3 | D17 |
| 고객센터 | I-1 | 유지 |
| 약관 · 개인정보 · 사업자정보 | I-4 약관 및 정책 허브 | 3행 → 1행 |
| (홈에 없음) 공지 | I-2 | 고객센터 안 공지로 1탭 |
| 탈퇴 · 로그아웃 | K | 순서: 로그아웃 → 탈퇴 |

### 4.2 리다이렉트 31개 최종 처리

| 경로 | 현행 | v2 |
|---|---|---|
| `/mypage/edit` · `/profile` · `/profile/edit` · `/required` | → `/mypage` | `/mypage/profile/edit` 는 **실제 편집 화면**으로 전환. `/mypage/edit`·`/mypage/profile` → `/mypage/profile/edit`. `/required` → `/mypage` 유지 |
| `/mypage/trade` · `/sales` · `/trade/sales` | 2~3회 연쇄 → `/mypage/products` | `/mypage/trade/sales` 가 **실제 판매 내역 화면**. `/mypage/trade`·`/sales`·`/mypage/products` → `/mypage/trade/sales` (1회, next.config HTTP 307) |
| `/mypage/purchases` · `/trade/purchases` | → 메신저 거래채팅 | `/mypage/trade/purchases` **실제 구매 내역 화면**. `/mypage/purchases` → 이곳 |
| `/mypage/purchases/[chatId]` · `/trade/chat` · `/trade/chat/[roomId]` | → 메신저 | 유지 (채팅 SSOT = 메신저) |
| `/mypage/reviews` | → `/trade/reviews` | 유지 |
| `/mypage/business/*` | → `/stores/owner/*` | 유지 |
| `/mypage/settings` · `/settings/[section]` | 매핑, 미지정 키 → chat-settings | 미지정 키 → `/mypage` (엉뚱한 화면 금지) |
| `/mypage/notifications` | → `/notifications` | 유지 |
| `/mypage/order-notifications` | 실제 화면(뒤로가기 → 리다이렉트 경로) | 알림 설정(H-3) 안 「주문」 섹션으로 통합, 경로는 → `…/settings/notifications#order` |
| `/mypage/notices/[noticeId]` | 별도 화면(중복) | → `/mypage/customer-center/notice/[id]` |
| `/mypage/points/ledger` · `/logout` · `section/settings/{notices,support}` · `store-orders/[id]/chat` | 리다이렉트 | 유지 |
| `section/store/order-chat` · `messenger/friends` · `messenger/chat-alerts` | **자기 자신으로 무한 리다이렉트(D5)** | → `/mypage/store-orders` · `/mypage/section/account/favorite-users` · `/mypage/section/settings/notifications` |
| `section/settings/{events,logout}` 분기 | 레지스트리 미등록 → 404 | 죽은 분기 삭제 |
| `/my/*` | 대부분 → `/mypage/*` | 유지, `/my` 자체도 → `/mypage` 로 통일(스크롤 복원 대상 1개) |

---

## 5. 내정보 홈 화면 구성안 (와이어프레임)

```
┌──────────────────────────────── 390pt (iPhone 14 Pro Max 430pt) ┐
│ 내정보                                               🔔(뱃지)   │ ← DetailHeader tier1, 52px
├─────────────────────────────────────────────────────────────────┤
│ (사진64)  닉네임                               [프로필 편집]     │ ← MyProfileHeader, bg-sam-surface
│           @dibay_id · 마카티 Poblacion                          │   16px 좌우, 20px 상하
│           자기소개 한 줄 …                                       │
│ 🔋 매너 배터리   ████████░░  72%                              › │ ← MyRow(value) 52px
│ ⚠ 전화 인증이 필요해요                              [인증하기]  │ ← 조건부, bg-sam-warning-soft
├─────────────────────────────────────────────────────────────────┤ ← 8px 그룹 간격 (bg-sam-app)
│  포인트  1,250P            │  쿠폰  3장                         │ ← MyAssetBar 64px, 세로 구분선
├─────────────────────────────────────────────────────────────────┤
│ 나의 거래                                                         │ ← MyGroup 제목 13/600 sam-muted, 좌 16
│ 📦 판매 내역                                       판매중 2   › │ ← MyRow 52px
│ ───── (인셋 구분선: 아이콘 열 이후 52px부터)                      │
│ 🛍 구매 내역                                                  › │
│ 💬 거래 채팅                                          ● 3     › │
│ ♡ 찜 목록                                              5      › │
│ 🏷 가격 제안                                       받은 대기 1 › │
│ ⭐ 거래 후기                                                  › │
│ 🕘 최근 본 상품                                               › │
├─────────────────────────────────────────────────────────────────┤
│ 나의 커뮤니티 (내가 쓴 글 · 댓글·반응 · 저장한 글 · 관심 사용자) │
│ 주문·배달 (주문 내역 진행중 1 · 매장 문의 내역)                 │
│ 매장 운영 (매장 입점 신청 | 입점 심사 진행 [심사중] | 내 매장 관리)│
│ 내 자산·혜택 (포인트 · 쿠폰 · 상품권 · 광고·홍보 · 회원 혜택)    │
│ 계정·설정 (계정 정보 · 주소 관리 · 알림 · 채팅 · 개인정보·보안 ·   │
│            언어 한국어 · 캐시 삭제)                              │
│ 고객지원·앱 정보 (고객센터 · 공지사항 · 앱 버전 1.2.3 (6) · 약관)│
│ [관리자] 관리자 콘솔                                              │
├─────────────────────────────────────────────────────────────────┤
│                 로그아웃 (sam-danger, 가운데)                    │ ← MyRow tone=danger
│                 회원 탈퇴 (13px sam-meta 링크)                   │
│                 (하단 탭바 여백 + safe-bottom)                    │
└─────────────────────────────────────────────────────────────────┘
```

- 태블릿(768–1199, Xiaomi 가로 포함): 같은 1열, 가운데 정렬, 본문 최대 폭 `max-w-[40rem]`(640px). 행 좌우 패딩 20px. 그룹 제목·행 높이 동일. 2분할 금지(계약).
- 스크롤 복원: 하위 화면에서 뒤로 오면 직전 위치(§7.8).

---

## 6. 하위 페이지별 UI·UX·CTA 명세

### 6.1 화면 템플릿 6종 (모든 화면은 이 중 하나)

| 템플릿 | 구조 | 헤더 | CTA 규칙 | 상태 |
|---|---|---|---|---|
| **T1 목록** | (선택) 탭/필터 칩 → 리스트 → 더 보기 | `MyScreen` 제목 + 뒤로(`backHref` 명시, 히스토리 우선) + 우측 액션 0~1 | 행 탭 = 상세 이동. 행별 조작은 행 오른쪽 ⋯ → `DibayActionSheet`. 파괴적 = `MobileConfirmBottomSheet`(danger) | 첫 로딩 스켈레톤 5행 · 빈 화면(아이콘+문구+주 CTA 1) · 오류(문구+[다시 시도]) · 추가 로딩 하단 스피너 · 끝 표시 없음 |
| **T2 상세** | 요약 헤더 → 섹션들(제목 + 행) → 하단 고정 CTA(있을 때) | 제목 + 뒤로 | 주 CTA 1개 하단 고정(`MyStickyCta`, 높이 56 + safe-bottom), 보조 CTA 최대 1(같은 바 왼쪽 secondary) | 로딩 스켈레톤 · 없음/권한없음(404 안내 + 목록으로) · 오류+재시도 |
| **T3 편집 폼** | 필드 행들 → 하단 고정 저장 바 | 제목 + 뒤로(미저장 변경 시 확인 시트) | 저장 = 변경 있을 때만 활성, 진행 중 버튼 내 스피너·중복 제출 차단, 키보드 위로 이동(`useFormKeyboardViewport`) | 저장 성공 → 토스트 + 이전 화면, 실패 → 필드 오류/토스트, 409 충돌 → 최신값 다시 불러오기 안내 |
| **T4 설정** | 그룹 제목 + 토글/값/링크 행 | 제목 + 뒤로 | 토글 즉시 저장(낙관) → 실패 시 **원래 값 복귀 + 토스트** | 로딩 시 토글 비활성 스켈레톤 |
| **T5 허브** | 요약 → 하위 링크 행 그룹 | 제목 + 뒤로 | 행 = 이동만 | 요약 로딩/오류는 요약 칸만 |
| **T6 게시판** | 검색 → 목록 → 상세(본문·댓글) | 제목 + 뒤로 | 댓글 작성 하단 입력 바 | T1/T2 동일 |

공통: 헤더 52px · 본문 좌우 16px(태블릿 20px) · 섹션 간 8px · 행 52px · 터치 영역 ≥ 48px · 금액·날짜·상태는 §7.9 포맷 함수만 사용 · 문구는 i18n 키만(하드코딩 한국어 0).

### 6.2 화면별 명세 (실제 화면 49개)

표기: **진입** = 홈 행 ID(§3.2) 또는 상위 화면. **데이터** = API → 원본 테이블. 태블릿 = 별도 기재 없으면 1열 최대 폭 40rem.

#### 프로필·계정 (9)

| # | 경로 | 템플릿 | 목적 · 진입 | 표시 순서 / 구조 | 주 CTA · 보조 CTA · 시트 | 빈·오류·피드백 | 데이터 |
|---|---|---|---|---|---|---|---|
| S01 | `/mypage/profile/edit` | T3 | 공개 프로필 편집 · A [프로필 편집] | 사진(96, 카메라 배지 → 액션시트: 사진 선택/촬영/기본 사진으로) → 닉네임(2–20자 실시간 검증) → 자기소개(최대 길이 카운터) → 동네(읽기 전용, 「주소 관리에서 변경」 링크) | 하단 고정 [저장](변경 시만) · 뒤로 시 미저장 확인 시트 | 저장 성공 토스트 → 홈 즉시 반영 · 닉네임 중복 필드 오류 · 409 → "다른 기기에서 바뀌었어요. 최신 내용을 불러왔어요" | PATCH `/api/me/profile` → `profiles`, 사진 POST `/api/me/profile/avatar` |
| S02 | `/mypage/trust` | T5 | 매너 배터리 이해 · A-1 | 큰 배터리 % + 아이콘 → 「이렇게 계산돼요」(실제 규칙 §8 D15) → 반영 내역(최근 이벤트: 거래 완료·후기, 날짜) | 없음 | 스냅샷 없음 → "아직 거래 기록이 없어요 · 기본 50%" | `/api/me/profile` 스냅샷 → `member_trust_snapshots`, 이벤트 목록 신규 GET `/api/me/trust/events` → `trust_events`(본인 RLS) |
| S03 | `/mypage/account` | T5 | 계정 정보 · H-1 | 아이디(@, 1회 변경 가능 여부) › · 전화번호(마스킹, 인증 상태 뱃지) › · 이메일 · 연동 로그인(제공자 아이콘) · 가입일 · 회원 상태 | 각 행 → S04/S05/연동 화면 | 로딩 행 스켈레톤 | `/api/me/profile` |
| S04 | `/mypage/required/dibay-id` | T3 | 아이디 확정/1회 변경 | 현재 아이디 → 입력(규칙 안내, 중복 확인 자동) | 하단 [확정] → 확인 시트("1회만 변경할 수 있어요") | taken/reserved 필드 오류 | `/api/me/dibay-id/*` → RPC `confirm_dibay_id` |
| S05 | `/mypage/required/phone` | T3 | 전화 인증 | 번호 입력 → [인증번호 받기] → 6자리 입력(재전송 타이머) | 하단 [인증 완료] | OTP 실패 횟수 안내 | `/api/me/phone-verification` |
| S06 | `/mypage/addresses` | T1 | 주소 관리 · H-2 | 대표 주소(뱃지) 맨 위 → 나머지 | 우측 상단 [추가] · 행 ⋯ → 대표로 설정/수정/삭제(확인 시트) | 빈: "등록된 주소가 없어요" [주소 추가] | `/api/me/addresses/*` → `user_addresses` |
| S07 | `/mypage/addresses/edit` | T3 | 주소 추가·수정 | 지도/검색 결과 → 상세 주소 → 라벨(집/회사/기타) → 대표 지정 토글 | 하단 [저장] | 필수 누락 필드 오류 | 동일 |
| S08 | `/mypage/addresses/search` | T1 | 주소 검색 | 검색창 → 결과 | 행 탭 = 선택 | 결과 없음 안내 | 주소 검색 API |
| S09 | `/mypage/section/settings/privacy` (신규) | T5 | 개인정보·보안 · H-5 | 차단 사용자 n › · 숨긴 사용자 n › · 기기 권한 › · 연동 로그인 › | 이동만 | — | 하위 화면 |

#### 나의 거래 (8)

| # | 경로 | 템플릿 | 목적 · 진입 | 구조 | CTA · 시트 | 빈·오류 | 데이터 |
|---|---|---|---|---|---|---|---|
| S10 | `/mypage/trade/sales` | T1 | 판매 내역 · C-1 | 상단 탭 [판매중 · 예약중 · 거래완료 · 숨김] (개수) → 판매글 행(썸네일 64·제목·가격·상태 뱃지·채팅 n·관심 n) | 헤더 우측 [글쓰기] · 행 ⋯ → 끌어올리기/수정/숨기기/삭제(확인 시트) · 상단 보조 [지역 일괄변경] | 탭별 빈 화면 + [첫 상품 올리기] · 오류+재시도 | `/api/my/posts?status&cursor` → `posts` + 판매자 상태 `seller-listing-state` |
| S11 | `/mypage/trade/purchases` (신규 화면) | T1 | 구매 내역 · C-2 | 탭 [진행중 · 거래완료] → 행(상품·판매자·상태·날짜) | 행 → 거래 채팅방, 거래완료 행 [후기 쓰기](미작성 시) | 빈 + [중고거래 둘러보기] | 기존 구매 이력 로더(`trade-history-load-server` purchases) → `product_chats` |
| S12 | `/mypage/trade/favorites` | T1 | 찜 · C-4 | 탭 [상품 · 매장] → 상품 탭 내부 칩 [전체·판매중·거래완료·삭제됨] | 행 ♡ 해제(토스트 + 되돌리기) | 빈 + [둘러보기] · 오류+재시도(로그인 이동 금지, 401만 로그인) | `/api/favorites/list?cursor` → `favorites`+`posts` |
| S13 | `/mypage/offers` | T1 | 가격 제안 · C-5 | 탭 [받은 제안 · 보낸 제안] (기본: 받은 대기 있으면 받은) → 행(상품·금액·상태·남은 시간) | 받은: [수락]/[거절](확인 시트) · 보낸: 대기 중 [제안 철회](확인 시트, M4) · 행 → 채팅 | 탭별 빈 · 오류+재시도(빈 문구와 동시 표시 금지) | `/api/offers/{received,mine}` → `price_offers` |
| S14 | `/mypage/trade/reviews` | T1 | 거래 후기 · C-6 | 탭 [받은 후기 · 보낸 후기] → 후기 카드(평가 아이콘·문구·상대·날짜) | 행 → 해당 거래(판매 → S10 상세 탭, 구매 → 채팅) | 빈 · 오류+재시도 | `/api/my/{received,written}-reviews?cursor` → `transaction_reviews` |
| S15 | `/mypage/recent-viewed` | T1 | 최근 본 상품 · C-7 | 날짜 묶음(오늘·어제·이번 주·이전) → 상품 행 | 헤더 우측 [전체 삭제](확인 시트) · 행 ⋯ 삭제 | 빈: "최근 본 상품이 없어요" · 삭제된 글은 "삭제된 상품" 회색 행 | 신규 `/api/me/recent-views` → `trade_post_recent_views`(M3) |
| S16 | `/mypage/trade/chat/compose` | 시스템 | 채팅 준비 | 기존 유지 | — | 오류 배너+재시도(기존 PASS) | 기존 |
| S17 | 지역 일괄변경 (S10 보조 액션 → `section/settings/region` 유지) | T3 | 판매글 지역 일괄 변경 | 대상 글 수 → 새 지역 선택 | 하단 [변경](확인 시트) | 결과 토스트 | `/api/me/posts/bulk-region` |

#### 나의 커뮤니티 (4)

| # | 경로 | 템플릿 | 목적 · 진입 | 구조 | CTA · 시트 | 빈·오류 | 데이터 |
|---|---|---|---|---|---|---|---|
| S20 | `/mypage/community-posts` | T1 | 내가 쓴 글 · D-1 | 탭 [게시중 · 숨김됨] → 글 행(제목·게시판·댓글 n·좋아요 n·날짜) | 행 → `/philife/[id]` · ⋯ → 수정/삭제(확인 시트) — 기존 커뮤니티 API | 빈 + [글쓰기] · 오류+재시도 | 신규 owner 목록(본인 숨김 포함) → `community_posts` |
| S21 | `/mypage/community-activity` | T1 | 댓글·반응 · D-2/D-3 | 탭 [댓글 · 좋아요 · 저장 · 신고] (`?tab=`) → 행 | 댓글: ⋯ 삭제(확인) · 좋아요/저장: 해제(토스트+되돌리기, 숨김·삭제된 글도 해제 가능) · 신고: 처리 상태 표시 | 탭별 빈 · 오류+재시도 | `/api/me/community-activity?tab&cursor` → 원본 5개 테이블(삭제·숨김 댓글 제외) |
| S22 | `/mypage/section/account/favorite-users` | T1 | 관심 사용자 · D-4 | 사용자 행(사진·닉네임·@ID) | ⋯ 관심 해제 | 빈 | `/api/me/relations/favorite` |
| S23 | 차단·숨긴 사용자 (`…/blocked-users` · `…/hidden-users`) | T1 | S09 하위 | 동일 | [차단 해제]/[숨김 해제] (확인 시트) | 빈 | `/api/me/relations/[type]` |

#### 주문·배달 (5)

| # | 경로 | 템플릿 | 목적 · 진입 | 구조 | CTA · 시트 | 빈·오류 | 데이터 |
|---|---|---|---|---|---|---|---|
| S30 | `/mypage/store-orders` | T1 | 주문 내역 · E-1 | 탭 [진행중 · 완료 · 취소·환불] → 주문 행(매장 사진·매장명·메뉴 요약·금액·**상태(프로세스 모델)**·날짜) → 더 보기 | 행 → S31 · 진행중 [주문 채팅] · 완료 [재주문] [후기 쓰기] · ⋯ 목록에서 숨기기(확인) | 빈 + [매장 둘러보기] · 오류+재시도(현행) | `/api/me/store-orders?cursor` → 스냅샷(`buyer_store_orders_list_snapshots`) — 상태 라벨 `store-order-process-model` |
| S31 | `/mypage/store-orders/[orderId]` | T2 | 주문 상세 | 상태 단계(프로세스 모델) → 매장 → 메뉴·옵션 → 결제 금액(할인·배달비·상품권) → 배달/픽업 정보 → 주문번호·시각 | 하단 고정: 진행중 [주문 채팅] / 취소 가능 [주문 취소](사유 시트) / 완료 [재주문] + [내역서] · 보조 [후기 쓰기] | 없음/권한없음 · 오류+재시도 | `/api/me/store-orders/[id]` → `get_store_order_detail_snapshot` |
| S32 | `/mypage/store-orders/[orderId]/review` | T3 | 주문 후기 작성 | 별점 → 메뉴별 좋아요 → 사진 → 내용 | 하단 [등록] | NOT_PROVEN → 구현 단계 첫 검증 | `/api/me/store-reviews` |
| S33 | `/mypage/store-inquiries` | T1 | 매장 문의 내역 · E-2 | 문의 행(매장·제목·답변 상태·날짜) | 행 → 매장 문의 상세(매장 화면) | 빈 + [매장 둘러보기] | `/api/me/store-inquiries` |
| S34 | 주문 내역서 (S31 [내역서] → 바텀시트) | 시트 | 주문 증빙 | 매장명·주소 → 주문번호·일시 → 메뉴×수량·금액 → 할인·배달비 → 결제 수단·결제 금액 | [닫기] · [이미지로 저장/공유] | — | S31 같은 응답(추가 조회 없음). **세금계산서·현금영수증 아님** 명시 |

#### 내 자산·혜택 (11)

| # | 경로 | 템플릿 | 목적 · 진입 | 구조 | CTA · 시트 | 빈·오류 | 데이터 |
|---|---|---|---|---|---|---|---|
| S40 | `/mypage/points` | T1 | 포인트 · G-1/B | 잔액 카드(**음수면 빨간 -38P + 차감 예정 안내**, 로딩·오류 "—") → 소멸 예정 줄(→S42) → 충전 요청 진행 줄(대기 n) → 탭 [전체·적립·사용·충전] 내역 → 더 보기 | 잔액 아래 [충전](주) · [홍보 이용](보조) · 충전 요청 행 [요청 취소](대기·확인중만, 확인 시트) | 내역 빈 · 오류+재시도 · 취소 실패 토스트 | `/api/me/points` → 잔액 `profiles.points`(원장 투영) + `point_ledger` + `point_charge_requests` |
| S41 | `/mypage/points/charge` | T3 | 충전 요청 | 플랜 선택 → 결제 방법 안내 → 요청 확인 | 하단 [충전 요청] (중복 제출 차단 + 멱등 키) | 성공 → S40 + 토스트 | `/api/me/point-plans`, POST `/api/me/points/charge` |
| S42 | `/mypage/points/expiring` | T1 | 소멸 예정 | 월별 소멸 예정 금액 | — | 빈 "소멸 예정 포인트가 없어요" | `/api/me/points` expiring |
| S43 | `/mypage/points/promotions` | T1 | 홍보 주문 | 잔액(로딩·오류 "—") → 주문 목록 | [홍보 신청] | 목록 오류+재시도(현행은 빈 목록으로 숨김) | `/api/me/points/promotion-orders` |
| S44 | `/mypage/coupons` | T1 | 쿠폰 · G-2 | 탭 [사용 가능 · 사용·만료] → 쿠폰(혜택·조건·만료일) | 행 → 사용 가능 매장 | 빈 | `/api/me/store-coupons` |
| S45 | `/mypage/gift-certificates` | T1 | 상품권 · G-3 | 탭 [보유 · 보낸 · 사용 완료] | 행 → S46 | 빈 | `/api/me/gift-certificates/wallet` |
| S46 | `/mypage/gift-certificates/[instanceId]` | T2 | 상품권 상세 | 금액(₱, 통화 포맷) → 번호(복사) → 유효기간 → 사용 내역 | 하단 [선물하기] · 보조 [번호 복사] | 오류+재시도 | `/api/me/gift-certificates/instances/[id]` |
| S47 | `/mypage/ads` | T1 | 광고·홍보 · G-4 | 탭 [진행중 · 대기 · 종료] → 광고 행 | 헤더 [광고 신청](→S48/S49 선택 시트) · 행 [연장]/[취소](확인) | 빈 + [광고 신청] | 기존 API |
| S48 | `/mypage/ads/apply` | T3 | 포인트 홍보 신청 | 기존 폼 | 하단 [신청] | 잔액 "—" 처리 | 기존 |
| S49 | `/mypage/ads/feed-request` | T3 | 피드 광고 요청 | 기존 폼(1218행 — 구조 유지, 공통 버튼·상태만 교체) | 하단 [요청] | 기존 | 기존 |
| S4A | `/mypage/benefits` | T1 | 회원 혜택 · G-5 | 내 등급 → 적용 중 혜택 목록 | 혜택 행 → 사용처 | 정책 0건이면 홈 행 숨김 | 신규 GET `/api/me/benefits` → `member_benefit_policies`(운영 활성 3건) |

#### 계정·설정 (8)

| # | 경로 | 템플릿 | 목적 · 진입 | 구조 | 저장 방식 | 데이터 |
|---|---|---|---|---|---|---|
| S50 | `…/settings/notifications` | T4 | 알림 · H-3 | 전체 푸시 → 채팅 → 거래 → **주문(구 order-notifications 통합)** → 커뮤니티 → 마케팅 → 알림 이메일 | 토글 낙관 저장, 실패 시 복귀+토스트 | `/api/me/notification-settings`, `user_settings` |
| S51 | `…/settings/chat-settings` | T4 | 채팅 · H-4 | 미리보기 표시 · 거래 접속 상태 | 동일 | `user_settings`, `/api/me/trade-presence` |
| S52 | `…/settings/device-permissions` | T4 | 기기 권한 (S09 하위) | 알림·카메라·사진·위치 상태 + [설정 열기] | 읽기 전용 | OS 권한 |
| S53 | 연동 로그인 (S09 하위, 현 device-permissions 안의 `LinkedLoginProvidersContent` 분리) | T4 | 소셜 연동 | 제공자별 연결 상태 | [연결]/[해제](확인) | 기존 API |
| S54 | 언어 (H-6 액션 시트) | 시트 | 언어 선택 | 한국어 · English | 즉시 적용, 서버 저장 실패해도 기기 값 유지(기기 설정 성격) | `setLanguage` |
| S55 | `…/settings/cache` | T4 | 캐시 삭제 · H-7 | 삭제 대상 설명 → [캐시 삭제] | 확인 시트 → 완료 토스트 | 클라이언트 캐시 레지스트리(§8 D16) |
| S56 | `…/settings/version` | T5 | 앱 버전 · I-3 | 플랫폼별 §8 D17 | [업데이트] | `/api/me/settings/version`, `App.getInfo` |
| S57 | `…/settings/leave` | T3 | 회원 탈퇴 · K | 탈퇴 시 사라지는 것 안내 → 사유 → 동의 체크 | 하단 [탈퇴 요청](danger, 확인 시트) | `/api/me/leave-request` |

#### 고객지원·앱 정보 (6)

| # | 경로 | 템플릿 | 목적 | 구조 · CTA | 데이터 |
|---|---|---|---|---|---|
| S60 | `/mypage/customer-center` | T5 | 고객센터 · I-1 | [문의하기](주) → 공지·이벤트·시스템 게시판 → 문의 내역 n → (포인트 바로가기 제거: 자산 그룹과 중복) | 기존 |
| S61 | `…/customer-center/{notice,marketing,system}` | T6 | 게시판 목록 · I-2 | 검색 → 고정글 → 목록 → 더 보기 | `/api/me/settings/notices` |
| S62 | `…/{board}/[id]` | T6 | 게시글 | 본문 → 댓글 + 하단 입력 바 | 동일 |
| S63 | `/mypage/support-history` | T1 | 문의 내역 | 상태 탭 [진행중·완료] → 문의 행 | `/api/support/cases` |
| S64 | `/mypage/inquiries`·`/inbox` (+thread) | T1/T2 | 이전 문의 보관함(읽기 전용) | 상단 "이전 문의 보관함 — 새 문의는 고객센터" 안내 | `/api/me/admin-notes` |
| S65 | `…/settings/terms` (허브로 확장) | T5 | 약관 및 정책 · I-4 | 이용약관 · 개인정보처리방침 · 사업자정보 · (위치기반 약관 등 `app_legal_documents` 에 있는 문서) | `app_legal_documents` |

> 명세 51항목 = S01–S09(9) + S10–S17(8) + S20–S23(4) + S30–S34(5) + S40–S4A(11) + S50–S57(8) + S60–S65(6). 이 중 바텀시트 2개(S34 내역서, S54 언어)를 빼면 **화면 49개**. 신규 경로는 S09(개인정보·보안 허브) 1개, S11·S15 는 기존 경로를 실제 화면으로 전환, S65 는 기존 약관 화면을 허브로 확장. 리다이렉트 31개는 §4.2.

### 6.3 공통 상호작용 규칙

| 상황 | 규칙 |
|---|---|
| 뒤로가기 | 헤더 ← 와 시스템 뒤로(Android)는 같은 동작: 히스토리 있으면 back, 직접 진입이면 `backHref`(상위 그룹 화면). 미저장 폼은 확인 시트 |
| 바텀시트 vs 모달 vs 전체 화면 | 선택지 2~6개 = 액션 시트 · 확인/파괴적 확인 = `MobileConfirmBottomSheet` · 짧은 입력(사유 등) = `DibayBottomSheet` · 필드 3개 이상 편집 = 전체 화면(T3). 화면 가운데 모달은 시스템 오류 알림(`dibayAlert`)만 |
| 저장·삭제 | 버튼 내부 스피너 + 비활성(중복 제출 차단: in-flight ref) · 성공 토스트 · 실패 토스트(서버 메시지 i18n) · 삭제는 확인 시트 후 실행, 되돌릴 수 있는 해제(찜·좋아요·저장)는 확인 없이 토스트 [되돌리기] |
| 목록 동기화 | 상세에서 변경 → 목록 항목 갱신(이벤트 버스 기존 `POST_FAVORITE_CHANGED_EVENT` 류 재사용, 없으면 화면 복귀 시 재조회 `useRefetchOnPageShowRestore`) |
| 세션 만료 | API 401 → 로그인 화면(복귀 경로 유지). 그 외 오류는 화면 내 오류 상태(로그인 이동 금지) |

---

## 7. 공통 디자인 시스템 적용 계획

### 7.1 기준 토큰 (변경 없음 — `app/design-tokens.css` 가 SSOT)

| 용도 | 토큰 / Tailwind |
|---|---|
| 브랜드 | `--sam-primary` = DIBAY 그린 `#0B421A` → `text-sam-primary` `bg-sam-primary` `bg-sam-primary-soft` |
| 배경 | 앱 `bg-sam-app`(크림) · 행/헤더 `bg-sam-surface` · 경고 줄 `bg-sam-warning-soft` |
| 글자 | 본문 `text-sam-fg` · 보조 `text-sam-muted` · 메타 `text-sam-meta` · 위험 `text-sam-danger` |
| 구분선 | `border-sam-border-soft` (1px, 인셋) |
| 간격 | 화면 좌우 16 · 그룹 간 8 · 행 내부 12 · 섹션 제목 상 16/하 8 |
| 글자 크기 | 화면 제목 17/600 · 그룹 제목 13/600 · 행 제목 15/500 · 값·보조 14 · 메타 12 · 금액 강조 20/700 |
| 반경 | `rounded-sam-sm` (CSS 실값 4px). AGENTS.md 의 "8px" 기재는 CSS 와 불일치 → §13-6 |
| 그림자 | 없음(`--sam-shadow-*` = none). 시트만 `shadow-sam-elevated` |

### 7.2 제거 대상 (카드·테두리·그림자·하드코딩 색)

- 홈 스타일 상수 `lib/ui/mypage-home-starbucks-styles.ts`(#00704A·#6F4E37·#1E3932·#D4E9E2·#F2F0EB) **전량 폐기**.
- 그룹을 감싼 `rounded-ui-rect border … bg-white shadow` 카드 → 테두리·그림자 없는 **그룹 리스트**(그룹 배경 surface, 그룹 사이 app 배경 8px).
- `MyPageItemScreen` 의 messenger/friends·region·manner·terms 박스 카드, `TradeHubSectionShell`(sam-card) → 그룹 리스트/헤더.
- 내정보 범위 하드코딩: 66개 파일 465곳(hex 281 · `text-red-600` 51 · `bg-white` 24 · amber ~40 · violet 1) → 토큰. 범위 = `app/(main)/mypage/**`, `components/mypage/**`, `components/my/**`, 내정보 전용 하위 컴포넌트(`components/points/**`, `components/addresses/**` 중 내정보 화면).
- 판정: `npm run verify:design-system-hard-lock` 를 내정보 경로에 적용(현재 CI 미포함 → 로컬 필수 + §12 CI 제안).

### 7.3 내정보 공통 컴포넌트 (신규 9 + 재사용)

위치: `components/mypage/ds/` (내정보 전용 — 관리자·타 도메인 import 금지, ESLint `no-restricted-imports` 규칙으로 강제)

| 컴포넌트 | 역할 | 내부 재사용 |
|---|---|---|
| `MyScreen` | 하위 화면 골격: 헤더 + 본문 폭/패딩 + 상태 슬롯 | `MySubpageHeader`(API 변경 없음 — 46곳 사용, 알림·필라이프 포함) |
| `MyGroup` | 그룹 제목 + 행 묶음(인셋 구분선) | — |
| `MyRow` | 링크/액션/토글/값 행 (`kind: link\|action\|toggle\|value`, `tone: default\|danger`, `value`, `badge`, 52px, 아이콘 20px 단색 `text-sam-icon`) | 현 `MyInfoMenuItem`·`MyPageMobileMenuRow`·`SettingsRow` 3종 **통합 대체** |
| `MyProfileHeader` | 홈 프로필 영역 | `MannerBatteryIcon` |
| `MyAssetBar` | 포인트·쿠폰 요약 2칸 | `CurrencyAmount` |
| `MyStateView` | loading(스켈레톤 n행)/empty(아이콘·문구·CTA)/error(문구·[다시 시도]) | `MainFeedRouteLoading` 스켈레톤 |
| `MyListPager` | 커서 기반 더 보기(하단 자동 로드 + 실패 시 [다시 시도]) | `runSingleFlight` |
| `MyStickyCta` | 하단 고정 주/보조 버튼, 키보드·safe-area | `useFormKeyboardViewport`, `Sam.btn.primaryCombo/secondaryCombo` |
| `MyToast` | 내정보 토스트(성공/실패/되돌리기), `app/(main)/mypage/layout.tsx` 에 호스트 1개 | (전역 토스트 없음 확인 — 내정보 범위로 한정) |

재사용(변경 없이): `MobileConfirmBottomSheet` · `DibayBottomSheet` · `DibayActionSheet` · `dibayConfirm/dibayAlert` · `CurrencyAmount`/`formatCurrencyAmount` · `processStatusLabel`(주문) · `Sam.btn.*` · `Sam.tabs.*` · `Sam.chip.*` · `useRefetchOnPageShowRestore`.

### 7.4 버튼

| 종류 | 클래스 | 크기 |
|---|---|---|
| 주 | `Sam.btn.primaryCombo` | 높이 46(토큰) · 하단 고정 시 블록 |
| 보조 | `Sam.btn.secondaryCombo` | 46 |
| 위험 | `Sam.btn.dangerCombo` | 46 |
| 행 안 작은 버튼 | `Sam.btn.sm` | 40 (터치 영역은 행 52) |
| 텍스트 링크 | `text-sam-primary` 14/500 | 터치 패딩으로 44 이상 |

### 7.5 탭·필터

- 화면 상단 탭 = `Sam.tabs` (높이 44, 활성 3px 밑줄), 개수는 탭 라벨 옆 숫자.
- 2차 필터 = `Sam.chip` 가로 스크롤.
- 탭 상태는 URL 쿼리(`?tab=`)로 유지 → 뒤로가기·공유 시 같은 탭.

### 7.6 시트·모달·토스트

- 시트 높이: 콘텐츠 높이, 최대 화면 85%, 핸들 + 아래로 스와이프 닫기 + 바깥 탭 닫기(파괴적 확인 시트는 바깥 탭 닫기 허용·실행 안 함).
- 토스트: 하단 탭바 위 16px, 3초, 액션 1개([되돌리기]).

### 7.7 로딩·빈·오류

- 첫 로딩만 스켈레톤, 재조회는 기존 내용 유지 + 상단 얇은 진행 표시.
- **오류를 빈 화면이나 0 으로 표시 금지**(D10). API 는 실패 시 오류 응답(빈 배열 성공 응답 금지).

### 7.8 스크롤·복귀

- 홈 스크롤 복원: 대상 `/mypage` (비로그인 포함, `/my` 는 리다이렉트로 일원화). popstate 시 **목적지가 `/mypage` 일 때만** 복원 대기 표시(현행 두 분기 동일 버그 수정). 앱 전역 `history.scrollRestoration` 은 변경하지 않음(타 도메인 영향).
- 목록: 탭·스크롤 위치를 `sessionStorage` 에 화면별 저장(기존 `mypage-hub-scroll-restore` 를 키별로 일반화).

### 7.9 포맷 SSOT

| 대상 | 함수 |
|---|---|
| 포인트·코인·캐시 | `CurrencyAmount` / `formatCurrencyAmount` (음수 부호 표시, `signed`) |
| 페소 금액(주문·상품권) | `formatMoneyPhp` (`lib/utils/format.ts`) — `₱` 직접 조합·`toLocaleString()` 단독 사용 금지 |
| 날짜 | 신규 `lib/mypage/format-mypage-date.ts` (회원 언어 locale, 상대시간은 `formatRelativeTimeAgo`) — `"ko-KR"` 하드코딩 금지 |
| 주문 상태 | `store-order-process-model` 의 `processStatusLabel`/`processStepLabel` 만 |
| 거래 상태 | `seller-listing-state` (판매중·예약중·거래완료·숨김) |

### 7.10 적용 범위 분리 (관리자·타 도메인 보호)

- `app/samarket-components.css`·`app/design-tokens.css`·`lib/ui/sam-component-classes.ts` **수정 없음** (관리자 515개 파일·4,290곳이 `.sam-*` 사용).
- 내정보 디자인은 `components/mypage/ds/*` 안 Tailwind `sam-*` 유틸 조합으로만 구현.
- 내정보 밖에서도 쓰는 컴포넌트(`MyStoreOrdersView` → 배달 도메인 `BuyerDeliveryOrdersBody`, `FavoriteProductsView` → 홈 거래내역 시트) 변경은 해당 화면 동작도 함께 검증(§12).

---

## 8. D1~D22 결함별 구현 계획

| ID | 원인 (근거) | 목표 동작 | 구현 방식 | SSOT | 영향 범위 | 검증 | 완료 기준 |
|---|---|---|---|---|---|---|---|
| **D1** P0 | `app/api/me/profile/route.ts:351-357` `avatar_url` 임의 문자열 허용 + `:1164-1181` 이전 사진을 service-role 로 삭제(경로 소유 확인 없음). `authenticated` 가 `avatar_url` 컬럼 UPDATE 권한 보유 | 회원은 **본인 폴더 사진만** 프로필로 지정, 삭제도 본인 폴더만 | ① 라우트 파서: null·기본 아바타·`post-images/{uid}/profile/*` 공개 URL만 허용, 그 외 400 ② 정리 단계: 이전 경로가 `{uid}/profile/` 로 시작할 때만 삭제 ③ M1: 회원 JWT 의 `avatar_url` 직접 UPDATE 회수 | `profiles.avatar_url` (쓰기 = `/api/me/profile` 만) | 프로필 편집만. 공유 lib `canonical-image-lifecycle` 은 **수정 안 함**(관리자 3곳·매장 3곳 호출) | 단위: 타인 경로·외부 URL·`..` 경로 → 400, 본인 경로 → 200, 정리 대상 필터 · 운영: 본인 폴더 밖 avatar 0명(현재 0) | 위 테스트 PASS + 운영 SQL 0건 |
| **D2** P0 | `components/favorites/FavoriteProductsView.tsx:130` 조건부 `return` 뒤 `useMemo` | 찜 1개 이상 회원도 정상 표시 | `emptyTabMsg` 를 모든 `return` 위로 이동 | — | 찜 화면 + 홈 거래내역 시트 + 거래내역 패널(같은 컴포넌트) | 렌더 테스트: 로딩→찜 3개 전환 시 오류 없음 | 테스트 PASS + 실기기(찜 보유 계정) |
| **D3** P0 | 공개 프로필 2개 API(`:71-72`, `:75-76`)와 `/u/[username]`(`:67-69`)가 `resolveUserAddressTitle`(건물명·도로명) 사용 | 타인에게는 **공개 허용 라벨(바랑가이·시) 만** | 3곳을 `formatUserAddressPublic` 으로 교체 (함수 자체는 변경 없음, 소비자 `address-defaults-snapshot-resolvers` 이미 사용 중) | `user_addresses` 대표 주소 → PUBLIC 모드 | 공개 프로필 3곳만 | 단위: 도로명·건물명 포함 주소 → 응답에 미포함 · 비로그인 호출 | 테스트 PASS |
| **D4** P0 | `points/page.tsx:105`, `hooks/useUserPointBalance.ts:38` `Math.max(0,…)` · `/api/me/points` DB 없음 → `balance:0` 성공 응답 · `readUserPointBalance` DB 오류 → 0 · 로딩/오류 중 0 렌더 | 실제 잔액 그대로(음수 포함), 모르면 "—", 오류는 오류 | ① 클램프 2곳 제거 ② API: 서비스 클라이언트 없음 → 503 ③ `readUserPointBalance` 를 `{ok:true,balance}\|{ok:false}` 로 변경하고 호출부 4곳(회원 promotion-orders 2, `project-point-financial-history`, **관리자 points 라우트 1**) 갱신 ④ 화면: `balance===null` → "—" ⑤ 음수 → `PointBalanceCard` 기존 음수 안내 노출 | `point_ledger` 합계 → `profiles.points` 투영 | 내정보 4화면 + 타 도메인 hook 소비자 2(필라이프 글쓰기·상품권 상세: 음수는 "부족"으로 동일 동작) + 관리자 라우트 1(오류 시 0 대신 오류) | 단위: 음수·0·null·오류 · 운영: -38 회원이 -38P 로 표시 | 테스트 PASS + 운영 계정 화면 확인(실기기) |
| D5 | `mypage-section-legacy-redirect.ts:26,38,39` 자기 자신으로 리다이렉트 | 각 경로가 정해진 화면으로 1회 이동 | 3개 대상 변경(§4.2) + 자기참조 금지 단위 테스트(모든 키 `target !== self`) | 레지스트리 | 섹션 경로 | 테스트 PASS | |
| D6 | 회원 홈에 커뮤니티 진입·숫자 없음, 숫자는 계산만 하고 미사용 | §3.2 대로 | 홈 재구성(`MyPageHomeDashboard`, `mypage-home-menu-config`), `/api/me/mypage-summary`(§10) | 각 도메인 원본 | 홈 | 홈 메뉴 순서 스냅샷 테스트 · 숫자 = 목적지 첫 탭 개수 | |
| D7 | 최근 본 = 메모리 목업, `recordRecentView` 호출 0 | 회원이 본 거래글이 기기와 무관하게 기록 | M3 테이블 + 상세 조회 시 기록(`/api/posts/[id]/increment-view` 서버에서 로그인 회원이면 upsert) + 목록/삭제 API + S15. 목업 파일 삭제 | `trade_post_recent_views` | 거래 상세 조회 경로(쓰기 1회 추가 — 성능: 같은 요청 내 비동기, 실패해도 조회수와 무관) | 단위: 중복 조회 시 최신 시각 갱신·100개 초과 정리·본인만 조회 | |
| D8 | 판매 = `/mypage/trade/sales`→`/mypage/products` 연쇄, 허브 이탈, 뒤로 `/market/sell`, 예약중 표시 누락 | S10 단일 화면 | `MyProductsView` 를 `/mypage/trade/sales` 로 이동(거래 허브 탭 안), `/mypage/products` → 307. 카드 상태 = `seller-listing-state` | `posts` | 판매 관련 링크 전부(홍보 화면 back 링크 포함) | 링크 전수 grep + 리다이렉트 1회 확인 | |
| D9 | `MyStoreOrdersView.tsx:408-413` 자체 상태표 `MemberOrderStatusBadge` | 목록·상세·채팅이 같은 상태 문구 | 배지·상태줄을 `processStatusLabel(status, fulfillment)` 로 교체. 사용처 없는 `MemberOrderCard`/`MemberOrderList`(import 0) 와 `MemberOrderStatusBadge` 삭제 | `store-order-process-model` | 내정보 주문 + **배달 도메인 주문 목록**(같은 컴포넌트) | 상태 10종 × 배달/픽업 라벨 테스트 | |
| D10 | 목록 오류 → 빈 목록/0 (내 상품·찜·후기·커뮤니티·포인트·프로모션·고객센터 잔액) | 오류는 오류 화면 + 재시도 | API: 실패 시 5xx. 화면: `MyStateView` | — | 해당 API의 다른 소비자: `/api/my/posts`(내정보만), `/api/favorites/list`(찜 화면만) — 확인 완료 | API 오류 주입 테스트 | |
| D11 | 찜 API 비정상 응답 전부 → 로그인 이동 | 401만 로그인 | `getFavoritedPosts` 상태코드 분기 | — | 찜 | 단위 | |
| D12 | 활동: 삭제·숨김 댓글 노출, 한국어 하드코딩, 20개 고정, 해제 불가(숨김 글 저장·좋아요) | S21 | 로더 필터(`is_deleted`·`is_hidden`·`status`), i18n 키, 커서. 저장·좋아요 **해제(DELETE)** 는 글 공개 여부와 무관하게 본인 행 삭제 허용(커뮤니티 save/like 라우트 DELETE 분기만) | 원본 5개 테이블 | 커뮤니티 save/like 라우트(DELETE 분기만, POST 규칙 불변) | 숨김 글 해제 · 차단 작성자 글 해제 | |
| D13 | 메신저 그룹이 없는 `profiles.full_name` 조회(운영 컬럼 없음 확인) | 그룹 참여자 이름 = 닉네임 | `group-room-read-service.ts:57`, `group-room-repository.ts:479` select 를 `MEMBER_IDENTITY_PROFILE_SELECT` 로 | `profiles.nickname` | **메신저 도메인** → PR-3 별도 | 단위 | OUT_OF_SCOPE(PR-2), PR-3 승인 시 |
| D14 | 본인 화면 `resolveDisplayName` 이 `display_name` 우선 + 회원이 `nickname` 직접 UPDATE 가능(2–20자 우회). 운영 불일치 10명 | 모든 화면 같은 이름 | M1: 회원 JWT 의 `nickname`·`display_name`·`bio` 직접 UPDATE 회수 + 트리거 `display_name := nickname` 동기 + 길이 CHECK. M2: 불일치 10명 `display_name` 을 `nickname` 으로 맞춤(빈 nickname 이면 반대). `resolveDisplayName` 순서 nickname 우선 | `profiles.nickname` | `resolveDisplayName` 소비자: 내정보 4 · 관리자 2(회원 목록·식별 — PR #94 에서 이미 nickname 기준) · 부트 경로(`profile-row-to-client-profile` 16곳). M2 후 두 컬럼이 같으므로 출력 변화 없음 | 운영 SQL 불일치 0 · 부트 테스트 | |
| D15 | 신뢰 화면 "7~10일 후 반영·분쟁 보류" ↔ 코드는 즉시·보류 없음. 365일 기간은 새 이벤트 때만 재계산. `section/settings/manner` 는 구 값(36.5) | 설명 = 실제 규칙, 표시 일관 | 문구 교체(ko/en): "거래 완료와 받은 후기로 계산 · 최근 365일 · 즉시 반영 · 시작 50% · 신고만으로는 바뀌지 않음". manner 섹션 → `/mypage/trust` 리다이렉트. `/u/[username]` 스냅샷 읽기. 365일 일일 재계산 크론은 §13-4 | `member_trust_snapshots` | 공개 프로필 페이지 | 문구 스냅샷 · 스냅샷=표시 값 | |
| D16 | 저장 실패 무음(`user-settings-store.ts:174-194`), 효과 없는 설정 3종, 캐시 삭제가 거의 무동작 | 실패 시 복귀+알림, 무효 설정 제거, 캐시 삭제 실제 동작 | `updateUserSettings(patch, {onFailure:"revert"\|"keepLocal"})` — 기본 revert, 언어만 keepLocal(기기 설정). 3종 행·화면 제거(DB 컬럼 유지). 캐시: 내정보·앱이 쓰는 클라이언트 캐시 키 레지스트리(sessionStorage 스냅샷·`dibay:` 캐시 키·Cache Storage) 삭제 + 로그인·동의 정보는 보존 | `user_settings` | `updateUserSettings` 소비자: 내정보 5 · 전역 언어 1 · **관리자 언어 토글 1**(keepLocal 로 현 동작 유지) | 실패 주입 복귀 · 캐시 삭제 후 로그인 유지 | |
| D17 | 버전: 빌드번호 미표시, 웹 SHA 없음, iOS 업데이트 확인·이동 없음 | 플랫폼별 정확한 버전 + 업데이트 CTA | Android: `1.2.3 (6)` + 기존 Play 인앱 업데이트. iOS: `1.2 (5)` + `app_meta` `ios_latest_version`·`ios_app_store_url`(M5) 비교 → [App Store에서 업데이트](`@capacitor/browser`). 웹: 배포 SHA 7자리(`next.config` 에 `NEXT_PUBLIC_WEB_DEPLOY_SHA` ← `VERCEL_GIT_COMMIT_SHA` 빌드 시 주입) | `App.getInfo` · `app_meta` · 빌드 env | 버전 화면만 | 플랫폼 분기 단위 · 실기기 3종 | |
| D18 | 라벨·아이콘 불일치(결제정보·개인/보안·최근 본 글, 방패 3중) | §3.2 라벨, 아이콘 1의미 1개 | 메뉴 config 재작성, 아이콘 매핑표(§7.3 `MyRow`) | — | 홈 | 아이콘 중복 0 테스트 | |
| D19 | 진입 없는 화면(혜택·매장 문의·광고 신청·소멸 예정), 혜택 빈 배열 하드코딩(운영 활성 정책 3건), 대기 수에 `on_hold` 포함 | 모두 진입 경로 + 실제 데이터 | 홈/허브 행 추가, `/api/me/benefits`, 대기 수 = 취소 가능 상태(`pending`·`waiting_confirm`)만 | 각 원본 | — | 운영 정책 3건 표시 | |
| D20 | 공개 프로필 `dibay_id` 미조회, 탈퇴·정지 회원 미필터 | @ID 표시, 탈퇴·정지 → 404 | select 에 `dibay_id`, `deleted_at is null and member_status = active` | `profiles` | 공개 프로필 3곳 | 단위 | PR-1 |
| D21 | 비로그인 로그아웃 노출, 스크롤 복원 popstate 분기 동일 | §3.3, §7.8 | 홈 재구성 + 훅 수정 | — | 홈 | 단위(`mypage-hub-scroll-restore.test.ts` 확장) | |
| D22 | 하드코딩 색 465곳, 버튼 공통화 7파일, 중복 제출 방지 누락 8파일, 공통 오류 컴포넌트 없음 | §7 | 49개 화면 `components/mypage/ds` 전환 | 토큰 | 내정보 전체 | `verify:design-system-hard-lock`(내정보 경로) 0 위반 · hex grep 0 | |

---

## 9. 누락 기능 — 필요성과 구현·보류 제안

| 기능 | 필요성 | 제안 | 근거 |
|---|---|---|---|
| 최근 본 상품 (실제 기록) | 중고거래 재방문 핵심 동선 | **구현**(DB 저장, 회원당 최근 100개·90일 보관, 개별/전체 삭제) | 기기 저장(localStorage)은 재설치·기기 변경 시 소실 → 상용 수준 불충분. 커뮤니티는 이미 `community_post_views` 존재(첫 조회 시각만 저장)라 범위는 거래글 |
| 구매 내역 화면 | 판매 내역과 짝. 현재 메신저 목록으로 우회 | **구현**(기존 구매 이력 로더 재사용) | 데이터 이미 있음(`product_chats`) |
| 보낸 가격 제안 철회 | 상대가 응답하기 전 실수 정정 | **구현**(M4: 상태 `withdrawn` + API + 판매자 알림 없음) | 운영 제약 `pending/accepted/rejected` 만 존재 확인 |
| 주문 내역서 | 지출 증빙·분쟁 대응 | **구현**(바텀시트, 이미지 저장/공유) — "세금계산서·현금영수증 아님" 명시 | 필요한 데이터 상세 응답에 모두 있음. 매장 사업자번호 컬럼 없음 → 법정 영수증 불가 |
| iOS 업데이트 확인 | iOS 회원 6명, 구버전 1.0 잔존 | **구현**(D17) | 네이티브 변경 불필요 |
| 회원 혜택 | 정책 테이블에 활성 3건 존재, 화면은 빈 배열 | **구현**(D19) | 데이터 있음 |
| 365일 일일 재계산 | 문서 규칙 준수 | **Owner 결정**(§13-4) | 신규 크론 |
| 판매자 매너 담합 방지·제재 연동 | 신뢰 지표 공정성 | **보류 → Owner 정책 결정**(§13-4) | 계산식 변경은 정책 |
| 라이더 | 회원용 기능 없음 | **보류**(행 제거) | 빈 화면 노출 금지 |
| 동영상 자동재생·개인화·국가 | 읽는 기능 없음 | **제거**(DB 유지) | 저장만 되는 설정은 회원 기만 |

---

## 10. DB·API·SSOT 변경 영향

### 10.1 마이그레이션 (전부 Owner 승인 필요, 운영 직접 적용·기록)

| ID | 내용 | 대상 | 호환성·위험 | 롤백 |
|---|---|---|---|---|
| **M1** (PR-1) | `REVOKE UPDATE (avatar_url, nickname, display_name, bio) ON profiles FROM authenticated, anon` · 트리거 `profiles_sync_display_name`(nickname 변경 시 display_name 동기) · `CHECK (nickname IS NULL OR char_length(btrim(nickname)) BETWEEN 2 AND 20)` `NOT VALID` → M2 후 `VALIDATE` | `profiles` | 회원 저장 경로 `/api/me/profile` = service-role(`route.ts:1102`) → 영향 없음. 클라이언트 직접 UPDATE 코드 0곳(`"use client"` 파일 grep 확인). 서버 중 회원 JWT 로 해당 컬럼을 쓰는 경로가 있는지 구현 첫 단계에서 전수 확인(가입 `ensure*ProfileRow` 포함) | GRANT 복구 SQL 첨부 |
| **M2** (PR-2) | 불일치 10명 `display_name` ↔ `nickname` 정렬(데이터 UPDATE 10행) → M1 CHECK VALIDATE | `profiles` | 화면 표시 이름이 nickname 으로 통일 | 변경 전 값 백업 테이블 |
| **M3** (PR-2) | `trade_post_recent_views(user_id, post_id, viewed_at, PK(user_id,post_id))` + RLS(본인 select/delete) + RPC `record_trade_post_recent_view`(upsert + 100개 초과 삭제) + 90일 정리(기존 크론 경로) | 신규 | 신규 테이블, 기존 영향 없음 | DROP |
| **M4** (PR-2) | `price_offers_status_check` 에 `withdrawn` 추가 + 철회 RPC(구매자 본인·pending 만, FOR UPDATE) | `price_offers` | 판매자 화면·채팅 카드가 `withdrawn` 을 모르면 "알 수 없음" → 표시 매핑 동시 추가(가격 제안 i18n 공유 카탈로그) | CHECK 원복(철회 행 존재 시 rejected 로) |
| **M5** (PR-2) | `app_meta` 데이터: `ios_latest_version`, `ios_app_store_url` | `app_meta` | 데이터만 | DELETE |

### 10.2 API

| API | 변경 |
|---|---|
| `PATCH /api/me/profile` | D1 소유권 검증 |
| `GET /api/users/[userId]/public-profile` · `/by-username/[username]/public-profile` · `/u/[username]` | D3·D20 |
| `GET /api/me/points` | 503/오류 분리, 음수 그대로 |
| `GET /api/me/mypage-summary` (신규) | 홈 숫자: 판매중·안읽음 거래채팅·찜·받은 대기 제안·내 글·진행중 주문·쿠폰·상품권·진행 광고. **각 목적지 API 와 같은 서버 함수 재사용**(중복 쿼리 작성 금지). 콜드부트 계약상 서버 렌더에서 await 금지, 클라이언트 단일 비행 |
| `GET /api/my/posts` · `/api/favorites/list` · `/api/my/{received,written}-reviews` · `/api/me/community-activity` · `/api/me/store-orders` | 커서 페이지네이션(현재 최대: 주문 1인 83건 → 한도 100 근접) |
| 신규 | `/api/me/recent-views`(GET/DELETE) · `/api/offers/[id]/withdraw` · `/api/me/benefits` · `/api/me/trust/events` · `/api/me/community-posts?scope=own`(숨김 포함) |
| 커뮤니티 `save`·`like` DELETE | 공개 여부와 무관하게 본인 해제 허용 |

### 10.3 SSOT 확정표

| 데이터 | 유일 기준 | 표시 경로 |
|---|---|---|
| 공개 이름 | `profiles.nickname` | 모든 화면 |
| 공개 아이디 | `profiles.dibay_id` | `@` 표시 |
| 공개 동네 | `user_addresses` 대표 → `formatUserAddressPublic` | 타인 노출 전부 |
| 매너 배터리 | `member_trust_snapshots.manner_battery_percent` | 내정보·공개 프로필·채팅 |
| 포인트 잔액 | `point_ledger` 합 → `profiles.points` 투영 | 내정보 전 화면 |
| 주문 상태 문구 | `store-order-process-model` | 목록·상세·채팅 |
| 판매 상태 | `seller-listing-state` | 판매 내역·홈 숫자 |
| 홈 숫자 | 목적지 API 와 같은 함수 | 홈 |

---

## 11. 관리자 병렬 작업 충돌 분석

열린 PR: [kimbk01/samarket#99](https://github.com/kimbk01/samarket/pull/99)(관리자 가로 고정 — **네이티브 android/ios**) · [kimbk01/samarket#42](https://github.com/kimbk01/samarket/pull/42)(Android 통화). v2 는 네이티브 파일을 건드리지 않으므로 파일 충돌 없음(버전 번호 증가도 하지 않음).

| 공유 지점 | 실제 의존 (호출 그래프) | v2 변경 | 관리자 영향 · 안전 방안 |
|---|---|---|---|
| `lib/users/user-label.ts` `resolveDisplayName` | 관리자 2(회원 목록 API, `admin-member-identity`) + 부트 경로 | 순서 nickname 우선 | PR #94 가 관리자 표시를 이미 nickname 으로 정함 → 의도 일치. M2 로 두 컬럼 동일화 후 적용해 출력 변화 0. 관리자 테스트 `admin-member-ops-ux-contract.test.ts` 함께 실행 |
| `lib/points/user-point-ledger.ts` `readUserPointBalance` | 관리자 `app/api/admin/users/[id]/points/route.ts` 1곳 | 반환형을 성공/실패 구분으로 | 관리자 라우트도 DB 오류 시 0 을 보여주는 같은 결함 → 같은 PR 에서 오류 응답으로 수정(1파일). 관리자 세션 작업 파일과 겹치는지 병합 직전 `git log origin/main -- <file>` 확인 |
| `lib/settings/user-settings-store.ts` | 관리자 언어 토글 1 | 옵션 인자 추가, 관리자 호출은 `keepLocal` | 동작 동일 |
| `lib/media/canonical-image-lifecycle.server.ts` | 관리자 일괄 삭제 3 · 매장 3 | **변경 없음**(소유권 검증은 회원 라우트에서) | 영향 없음 |
| `lib/addresses/*` | 관리자 주소 패널 | **변경 없음**(소비자만 교체) | 영향 없음 |
| `store-order-process-model.ts` | 관리자 2 · 매장 4 | **변경 없음**(읽기만) | 영향 없음 |
| `app/samarket-components.css` · `design-tokens.css` · `sam-component-classes.ts` | 관리자 4,290곳 | **변경 없음** | 영향 없음 |
| i18n | `messages.ts`·`message-key.ts`(관리자 커밋 4/6 이 수정한 핫스팟) | 키는 기존 내정보 카탈로그(`mypage-hub.ts`·`mypage-components.ts`·`settings-ui.ts`)에만 추가 → **집계 파일 수정 불필요**(새 카탈로그 파일 만들지 않음) | 충돌 원천 차단 |
| `lib/my/types.ts`·`mypage-tables-select.ts`(CMS) | 관리자 CMS 화면·API | **변경 없음** | 홈 메뉴 SSOT = 코드. 관리자 CMS 편집이 회원 홈에 반영되지 않는 현 상태는 §13-9 로 보고 |
| `MySubpageHeader` | 관리자 0 · 알림·필라이프 등 | API 변경 없음 | 영향 없음 |
| `MyStoreOrdersView` | 배달 도메인 주문 목록 | 상태 라벨 SSOT 교체 | 배달 목록 화면 함께 검증 |
| DB `profiles` 권한(M1) | 관리자 쓰기 = service-role | 회원 JWT 만 회수 | 영향 없음 |

절차: 각 PR 작성 직전 `git fetch origin main` → 위 파일의 main 변경 이력 확인 → 겹치면 main 병합 후 로컬 검증 1회. 다른 세션 변경을 덮어쓰는 force-push 금지.

---

## 12. 구현 순서 · CI · 실기기 검증 계획

### 12.1 PR 구성 결정

| PR | 범위 | 분리 근거 |
|---|---|---|
| **PR-1** P0 | D1 · D2 · D3 · D4 · D20 + M1 | 보안·개인정보·금액 결함은 디자인 개편(대형)을 기다리면 안 됨. 변경 파일 약 12개로 위험 낮음. 관리자 공유 파일 1개(`readUserPointBalance` 관리자 라우트) |
| **PR-2** 내정보 v2 | 디자인 시스템 + IA + 49개 화면 + D5–D12 · D14–D19 · D21 · D22 + M2–M5 | 한 작업 = 한 통합 PR(규정 8). 단계별 커밋은 PR 내부에서만, CI 는 최종 HEAD 1회 |
| **PR-3** 메신저 | D13 | 타 도메인 수정 혼합 금지(규정 8). Owner 승인 시 |

### 12.2 PR-2 작업 단위 (의존성 순)

| 단위 | 선행 | 수정 파일(주요) | 영향 | 테스트 | 병렬 |
|---|---|---|---|---|---|
| W1 디자인 기반 | 없음 | `components/mypage/ds/*`(신규 9), `lib/mypage/format-mypage-date.ts`, ESLint import 제한 | 신규만 | ds 컴포넌트 단위(상태·중복 제출·키보드 inset) | W3 와 병렬 |
| W2 IA·홈 | W1 | `MyPageHomeDashboard`, `MyPageGuestHomeDashboard`, `MyInfoHomeMenuSections`(→ `MyGroup/MyRow`), `mypage-home-menu-config`, `mypage-home-quick/stat-config`(폐기), `mypage-home-starbucks-styles`(폐기), `/api/me/mypage-summary`, `mypage-section-legacy-redirect`, `next.config.js` 리다이렉트, 스크롤 복원 | 홈·리다이렉트 | 메뉴 순서·권한별 스냅샷, 리다이렉트 1회·자기참조 0, `mypage-root-network-contract.test.ts`(콜드부트) | — |
| W3 DB·API | 승인된 M2–M5 | 마이그레이션, 신규·변경 API(§10.2) | 거래 상세 조회, 가격 제안, 커뮤니티 save/like DELETE | API 단위(성공·실패·경계·권한) | W1 과 병렬 |
| W4 거래·커뮤니티 화면 | W1 W3 | S10–S23 | 찜 컴포넌트 공유 화면(홈 시트·패널) | 화면 상태·탭 URL·해제/되돌리기 | W5·W6 과 병렬 |
| W5 주문·자산 화면 | W1 W3 | S30–S4A, `MyStoreOrdersView`, 주문 내역서 시트 | 배달 도메인 주문 목록 | 상태 라벨 10종×2, 음수·로딩·오류 금액 | 병렬 |
| W6 설정·지원·버전 | W1 W3 | S50–S65, `user-settings-store`, `VersionContent`, `next.config`(웹 SHA) | 관리자 언어 토글(동작 동일) | 실패 복귀, 캐시 삭제 후 로그인 유지, 플랫폼 분기 | 병렬 |
| W7 정리·통합 검증 | W2–W6 | 목업·죽은 코드 삭제, 문서 개정(IA 계약·AGENTS 반경 기재) | — | 아래 12.3 | — |

### 12.3 검증 (규정 2 준수 — 최종 트리 1회)

로컬(최종 HEAD 1회): `npm run typecheck:build` · 변경 관련 `vitest`(내정보·포인트·주소·프로필·주문 라벨·리다이렉트·관리자 회원 계약 테스트) · 변경 파일 `eslint` · `npm run verify:routes` · `npm run verify:design-system-hard-lock` · `node scripts/check-i18n-messages.mjs` · `node scripts/check-hardcoded-korean.mjs`(내정보 경로). 통과 트리 `git commit --no-verify`.
GitHub CI: 필수 `npm run ci` 전체 + `native-version-bump` — 생략·완화 없음. PR CI 1회 대기(규정 3).
푸시 전: `git show HEAD:<file>` 포함 확인, `"use client"` 파일의 서버 전용 import 0 확인(규정 4).

### 12.4 실기기 검증 매트릭스 (작업자 — 설치 버전 `user_devices.app_version` 먼저 기록)

| 항목 | Samsung Android APK (세로) | Xiaomi 태블릿 (가로) | iPhone 14 Pro Max | 일반 웹 |
|---|---|---|---|---|
| 홈 메뉴 순서 = §3.2 | ✔ | ✔ | ✔ | ✔ |
| 행 터치·눌림 피드백 | ✔ | ✔ | ✔ | — |
| Safe Area(노치·홈 인디케이터) | — | — | ✔ | — |
| 키보드 + 하단 저장 바(프로필 편집·주소·충전) | ✔ | ✔ | ✔ | — |
| 바텀시트 높이·스와이프 닫기·바깥 탭 | ✔ | ✔ | ✔ | ✔ |
| 시스템 뒤로가기 = 헤더 뒤로 | ✔ | ✔ | (스와이프 뒤로) ✔ | 브라우저 뒤로 ✔ |
| 홈 스크롤 복원 | ✔ | ✔ | ✔ | ✔ |
| 앱 재시작 후 설정 유지(알림·채팅·언어) | ✔ | ✔ | ✔ | — |
| 가로 레이아웃 1열·최대 폭 | — | ✔ | — | ✔(넓은 창) |
| 버전 화면 플랫폼별 값·업데이트 CTA | ✔(Play) | ✔ | ✔(App Store) | ✔(SHA) |
| 음수 포인트 계정 표시 | ✔ | — | ✔ | ✔ |

브라우저 반응형 결과로 APK·iOS 앱 PASS 를 대신하지 않는다. 미측정 칸은 NOT_PROVEN.

### 12.5 완료 판정 (Owner §11 조건과 1:1)

| 조건 | 증거 |
|---|---|
| 승인 메뉴 순서 = 실제 화면 | 홈 스냅샷 테스트 + 기기 3종 캡처 |
| 전체 진입·복귀 정상 | 메뉴 행 32개 + 프로필·매너 배터리·필수정보 행 × 진입·뒤로 체크리스트 |
| 하위 기능 정상 | 화면 49개 상태별 테스트 + 실기기 주요 흐름 |
| UI·UX·CTA 공통 규칙 | hard-lock 0 위반, hex grep 0, `components/mypage/ds` 사용률 49/49 |
| 회원 데이터·SSOT 일치 | 운영 읽기 전용 SQL: 홈 숫자 = 목록 수, 이름 불일치 0, 포인트 투영 불일치 0(현재 1 = 음수 회원, 표시로 해결 — 원장 미수정) |
| 보안·금융 결함 해결 | D1·D3·D4·D20 테스트 + 운영 SQL |
| 필수 CI | PR CI PASS + 배포 SHA |
| 기기별 결과 | §12.4 표 채움 (미측정 NOT_PROVEN) |
| 관리자 충돌 없음 | §11 파일 main 이력 대조 + 관리자 계약 테스트 PASS |

---

## 13. Owner 결정이 필요한 항목

| # | 항목 | 설계안의 제안 |
|---|---|---|
| 1 | §3.2 메뉴 그룹·순서 확정 + `LEGACY-IA-PHASE1-CONTRACT.md` 개정 | 제안대로 확정 |
| 2 | PR 3분할(§12.1) 및 PR-1 선행 | 승인 시 PR-1 즉시 착수 |
| 3 | 마이그레이션 M1~M5 각각 | M1(PR-1) 우선, M2–M5 PR-2 |
| 4 | 매너 배터리 정책: ① 365일 일일 재계산 크론 ② 같은 상대 반복 거래 가산 제한 ③ 제재 반영 | 이번 범위 = 문구를 실제 규칙에 맞춤만. ①은 규칙 문서 준수를 위해 추가 권고, ②③은 정책 결정 전 미적용 |
| 5 | 효과 없는 설정 3종(동영상 자동재생·개인화·국가) 제거 | 제거(DB 컬럼 유지) |
| 6 | 반경 토큰: CSS 실값 4px vs AGENTS.md "8px" | CSS(SSOT) 유지 + AGENTS.md 기재 정정 |
| 7 | 최근 본 상품 보관 정책 | 회원당 100개 · 90일 · 개별/전체 삭제 |
| 8 | 주문 내역서 범위 | 앱 내 내역서(법정 영수증 아님) |
| 9 | 관리자 CMS(`my_page_sections`·`my_services`)가 회원 홈에 반영되지 않는 현 상태 | 회원 홈 SSOT = 코드로 확정, 관리자 세션에 보고 |
| 10 | PR-3(메신저 그룹 이름) 착수 여부 | 승인 권고(이름 일관성) |

---

## 부록 A. 근거 데이터 (운영 DB 읽기 전용, 2026-10-20)

- 회원 121명(삭제 제외) · 포인트 투영 불일치 1명(원장 -38 / 표시 0) · 이름 불일치 10명 · `profiles.full_name` 컬럼 없음 · 매너 스냅샷 73건, 캐시 차이 0 · 본인 폴더 밖 아바타 0명
- 사용량: 거래 채팅 442/39명 · 주문 836/29명(1인 최대 83) · 원장 511/29명 · 주소 177/67명 · 커뮤니티 글 122/3명 · 찜 27/15명 · 가격 제안 39/16명 · 후기 29/12명 · 고객 문의 34
- 기기: Android 46명(1.0~1.2.3 (6)) · iOS 6명(1.0, 1.2 (5))
- `price_offers` 상태 제약 = pending/accepted/rejected · 주문 상태 값 10종 · 회원 혜택 정책 활성 3건
