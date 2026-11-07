# 계획 완료 후 처리 목록 (후속 감사 대상) · 2026-11-08 PHT

- **작업 방식 (Owner 2026-11-08):**
  1. 이전 구현 계획을 먼저 끝낸다.
  2. 중간에 끼어든 일과 추가로 발견된 항목(「보고만 · 범위 밖」)은 **이 목록에 적는다.**
  3. 계획이 끝난 뒤 **추가 감사 → 원인·계획 보고 → 승인 → 처리**한다.
- 이 목록에 적은 항목은 계획 진행 중에 고치지 않는다(실기 중 땜빵 금지).
- 상태 표기:
  - **확인됨** — 근거가 있다.
  - **NOT_PROVEN** — 조사 보고만 있고, 직접 확인하지 않았다.
  - **Owner 결정** — Owner 가 정해야 한다.

## A. 계획 진행 상태 (이 목록을 열기 전에 끝낼 것)

| 계획 | 상태 |
|---|---|
| Windows 순서표 3번 작업자 몫 | C-1·C-2, 레일(U-1), 정렬(U-2·U-3), PC 메신저, 방 진입 깜빡임, 셸 설계서, W0, W1, Google 로그인(W2 Google 한정), PC QR 로그인, U-6 **완료** |
| W3 Windows 알림(WNS) | **막힘** — Store 계정·이름 예약(순서 4번) 후 |
| W5 업데이트 화면·Store 링크(U-5) | **막힘** — Store 식별자 후 |
| W4 통화 | **동결** — Owner 해제 필요 |
| 도메인 이전 설계 | **막힘** — 회사 도메인 확정(순서 1번) 후 |
| 순서 1·2·4번 (사업자·도메인·D-U-N-S·앱 이름·Partner Center) | **Owner** |

→ 지금 작업자가 더 진행할 수 있는 계획 항목은 없다. 다음은 이 목록의 **추가 감사**다(Owner 승인 후 시작).

## B. 후속 처리 목록

| # | 항목 | 상태 | 근거 | 영향 |
|---|---|---|---|---|
| B-1 | 「브라우저 알림」 줄이 휴대폰 앱(Android·iOS) 알림 설정에도 그려짐 — 서버 웹 푸시를 켜면 앱 안에서 「지원 안 함」으로 보일 수 있음 | 확인됨(코드) | `components/my/settings/NotificationsSettingsContent.tsx:400` 무조건 렌더, `WebPushSettingsRow` 지원 판정 | 지금은 U-6 로 숨겨짐(서버 꺼짐). 웹 푸시를 켜는 시점 전에 처리 |
| B-2 | 공용 개발 폴더 `samarket/node_modules` 에 `qrcode`·`jsqr` 미설치 — 그 폴더에서 타입 검사 시 모듈 없음 오류 | 확인됨(로컬) | U-6 작업 중 `typecheck:build` TS2307 | 운영 빌드 무관(잠금 파일). 로컬 세션 혼선. `npm install` 1회 |
| B-3 | `app/api/auth/native/exchange/route.ts` — 93줄 임시 응답에 넣은 활성 세션 쿠키(`samarket_active_session_id`)가 123줄 새 응답으로 옮겨지지 않을 수 있음 | **NOT_PROVEN** (조사 보고만) | 보조 조사 보고, 작업자 미실행 | 앱 로그인 직후 세션 기록 쿠키 누락 가능성 — 사실 확인부터 |
| B-4 | Google 계정 im2\*\*\*@gmail.com 이 디바이 회원 2개로 나뉨 (A `5a22455c…` Android 네이티브 / B `c741c5b6…` 이메일+Google 연결) — 웹 방식 Google 로그인 거절 | 확인됨(운영 로그·DB 읽기) | `[auth/web-oauth-policy]` ESTABLISHED_MEMBER_REBIND_FORBIDDEN 03:08 PHT, DB 조회 | 이 계정만(Google 57건 중 1건). 정리 방법 **Owner 결정** · 운영 데이터 정리 정식 경로 |
| B-5 | 메신저 분할 화면 「칸 안 좌→우 진입」 계약(`messenger-list-room-slide.ts`·`messenger-view-transitions.css` 2026-07-30)과 실제 코드(분할은 진입 애니메이션 없음, `MessengerRoomSwipeBackShell` `splitPaneMode`) 불일치 — 해당 CSS 미사용 | 확인됨(코드) | 방 진입 깜빡임 조사 | 어느 쪽에 맞출지 **Owner 결정** |
| B-6 | 분할 진입 틀 → 방 열릴 때 이름이 7px 위로 이동(틀에 「1:1 대화 · …」 줄 없음) | 확인됨(운영 측정) | 설계서 §5·§11 측정 13→6 | 작은 위치 이동 |
| B-7 | 분할 진입 틀(P1·P2·F1) 태블릿(iPad·Xiaomi) 분할·휴대폰 무변화 실기 | NOT_PROVEN | 측정은 PC(Mac 크롬)만 | 회귀 확인 필요 |
| B-8 | PC `/mypage/products`(진행중 거래) — 헤더는 가운데, 탭 줄은 화면 왼쪽 끝 | 확인됨(화면) | 2026-11-07 레일 확인 중 | PC 정렬 |
| B-9 | `lib/stores/__tests__/store-discovery-eligibility.test.ts` — 실제 시계 사용, 23:59 PHT 1분 동안 CI 실패 | 확인됨(재현) | 23:58:30 정상 · 23:59:30 closed · 00:00:30 정상 | CI 간헐 실패(제품 무관). 테스트 시각 고정 |
| B-10 | `lib/auth/native/__tests__/apple-siwa-token.test.ts` 로컬 실패 1건 (변경 전 코드도 동일, 이후 실행에선 통과 기록도 있음) | 확인됨(로컬, 간헐) | W2 작업 중 | 원인 미조사 |
| B-11 | Windows 앱 로그인 화면 첫 표시 때 기존 버튼이 한 순간 보였다가 QR 로 바뀌는지(서버 렌더 Windows 판정 false) | NOT_PROVEN | 노트북 미확인 | 깜빡임 가능성 |
| B-12 | Windows 앱 Apple 로그인(같은 창), iPhone 에서 PC 로그인 카메라 스캔 | NOT_PROVEN | 시험 기록 없음 / 시뮬레이터 카메라 없음 | 실기 필요 |
| B-13 | 앱 이름 표기 4가지(`dibaY`·`DIBAY`·`DIBAY MARKET`·`DiBaY - 디바이`) | **Owner 결정** | Store 감사 U-4 | Store 이름 예약 전 확정 |
| B-14 | PC 배달 탭 768px 폭 | **Owner 결정** | 2026-11-07 PC 레일 작업 | PC 배달 화면 |

| B-15 | 태블릿 설정 → 채팅 탭 이동 때 흰 화면(3초 시점), 4~7초 뒤 표시 — 재시도에서는 재현 안 됨 | 재현 안 됨(1회) | Xiaomi 04:39 PHT 캡처 · 재시도 녹화 | 새 웹 배포 직후 1회 — 관찰 |
| B-16 | 다른 「헤더 아래 탭」(`MarketplaceSellHubPills`·`HomePurchaseSalesHubTabs`)의 PC 정렬 | 미조사 | B-8 감사 중 발견 | PC 정렬 |

**감사 결과:** `docs/audit/post-plan-backlog-audit-2026-11-08.md` (2026-11-08)

## D. 묶음 2 처리 결과 (Owner 「남은 항목은 계약사항을 확인 하고 권장 사항을 …」 2026-11-08)

| # | 계약 근거 | 처리 | 상태 |
|---|---|---|---|
| B-2 | 잠금 파일(`package-lock.json`)에 이미 포함 — 로컬 폴더만 누락 | 공용 폴더에 같은 버전 설치(`npm install --no-save`) | 아래 보고 참조 |
| B-4 | 운영 데이터 정리 정식 경로(백업 → 1행 → 전후 대조) | 실행 안 함 — 운영 DB 변경은 Owner 별도 승인 | **Owner 승인 대기** |
| B-5 | 분할은 진입 모션 없음(셸 `splitPaneMode`·P1·P2·F1 승인 작업의 전제). 「칸 안 좌→우」 CSS 는 2026-07-31 이후 쓰이지 않는 코드 | 권장안 ② — 쓰이지 않는 CSS 삭제, 계약 문구·테스트를 「모션 없음」으로 정정 | 코드 PASS |
| B-6 | 틀 계약 「방이 열릴 때 위치 이동 없음」(`messenger-split-room-entry-frame.contract.test.ts`) | 틀 상단바에 실제 상태 줄과 같은 클래스의 빈 줄(문구 없음) | 코드 PASS · 화면 측정은 배포 후 |
| B-11 | Windows 앱 로그인 「처음은 무조건 QR」(Owner 2026-11-08) | `<head>` 인라인 스크립트가 그리기 전 `html[data-dibay-host-shell-boot]` 표시 → CSS 가 일반 로그인 숨김·QR 자리 표시 | 코드 PASS · 노트북 확인 Owner |
| B-12 | — | 실기기 확인 항목 (Windows Apple 로그인 · iPhone QR 스캔) | **Owner 실기** |
| B-13 | 표시명 단일 소스 `lib/brand/app-display-name.ts` | 매니페스트가 단일 소스를 가져다 씀(값 동일, 화면 무변화). 이름 하나 확정은 Owner | 코드 PASS · **이름 Owner 결정** |
| B-14 | 배달 768px 단일 상수(광고 위치 계약·S3-07 테스트), 레일 설계 R8 「바꾸지 않는다」 / 내정보 본문 40rem(내정보 설계 §1.8) | 변경 없음(계약대로 유지). U-2 「완료」 기록을 「배달 제외」로 정정 | 계약 일치 · 넓히려면 Owner 결정 |
| B-15 | 새 배포 직후 버전 불일치 → 전체 다시 불러오기(Next.js) | 권장: Vercel Skew Protection 켜기 — 설정 변경은 Owner 승인 | **Owner 승인 대기** |
| B-16 | D2 「헤더 아래 줄 = 헤더 제목 열」, B-8 선례 | 탭 줄은 모두 이미 맞음. 남은 검색 입력 줄 2곳(`SearchView`·`GlobalSearchView`)을 본문 열로 | 코드 PASS |

## C. 운영 방식

- 새 「보고만」 항목이 생기면 이 표에 한 줄 추가하고, 보고 끝에 「후속 목록 B-n 추가」로 적는다.
- 계획(A)이 모두 끝났거나 막혔을 때, Owner 승인을 받아 B 전체 **추가 감사**를 시작한다.
- 감사 결과는 원인별 설계안 → 승인 → 처리다. 항목별로 main 에 올리지 않고 묶음 1회로 반영한다.
