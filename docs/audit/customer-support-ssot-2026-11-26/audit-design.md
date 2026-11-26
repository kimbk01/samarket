# 내정보 › 고객지원 › 고객센터 — 뒤로가기 결함 · 고객지원 화면 구성 설계 (2026-11-26)

상태: **감사·설계만 (코드 변경 없음)** · Owner 승인 전 구현 금지

## 0. 확인 조건

| 항목 | 값 |
|---|---|
| 코드 기준 | 작업 트리 `48530aff3` (고객센터·뒤로 관련 파일은 `origin/main` `522f9ff79` 와 차이 없음) |
| 화면 재현 | 로컬 개발 서버 `localhost:3000`, **비로그인**, 모바일 375×812 에뮬레이션, 08:0x PHT |
| 운영 사이트 / 실기기 | 열지 않음 → **NOT_PROVEN** (Owner 화면 = 로그인·휴대폰 판정은 아직 없음) |
| 앱 실행 횟수 | 0 회 (운영 Supabase 요청 추가 0) |

## 1. 지금 들어가는 길 (경로)

```
내정보 홈 /mypage
 └ 「고객지원」 카드 → /mypage/section/support              (분류 화면: 고객센터·약관·개인정보·사업자정보 4줄)
     └ 「고객센터」 줄 → /mypage/customer-center             (허브: 문의하기 · 게시판 4타일 · 신고/문의/포인트 5줄)
         ├ 공지사항     → /mypage/customer-center/notice      ┐
         ├ 시스템 안내  → /mypage/customer-center/system      ├ 같은 목록 컴포넌트 (CustomerCenterBoardListClient)
         ├ 혜택·이벤트  → /mypage/customer-center/marketing   ┘   상단 탭 3개(공지·시스템·혜택) = replace 이동
         │   └ 글 → /mypage/customer-center/{type}/{id}        (CustomerCenterBoardDetailClient)
         └ 업데이트 내역 → /mypage/app-updates                 (다른 화면 · 탭 없음)
```

공지 하나 보려면 **4번 누름**(고객지원 → 고객센터 → 공지사항 → 글). 이 화면들에는 하단 탭이 없어 헤더 ← 와 기기 ◁ 외에는 나갈 길이 없다.

## 2. 결함

### D1 — FAIL (재현함): 게시판 ← 가 고객센터를 「새로 쌓아」 고객센터 ↔ 게시판이 끝없이 오간다

**원인 (코드)**
- 게시판 목록 헤더 ← = 고정 이동(push): `components/mypage/cs/CustomerCenterBoardListClient.tsx:349-350` `backHref=/mypage/customer-center` + `preferHistoryBack={false}` → `AppBackButton.tsx:120-148` 가 `<Link href>` 로 **새 기록을 추가**.
- 고객센터 허브 헤더 ← = 기록 뒤로(history back): `CustomerCenterHubClient.tsx` `MyScreen` 기본값 `preferHistoryBack=true` → `runHistoryBackWithFallback` 가 `router.back()`.
- 그래서 허브의 「바로 앞 기록」이 방금 나온 게시판이 된다.

**재현 기록 (localhost · 비로그인 · 375px, `navigation.entries()` 실측)**

| 동작 | 현재 주소 | 기록 |
|---|---|---|
| 고객센터 진입 | /mypage/customer-center | [/mypage, /mypage, **/customer-center**] |
| 공지사항 | …/notice | [… , /customer-center, **/notice**] |
| 공지 ← | /mypage/customer-center | [… , /customer-center, /notice, **/customer-center**] ← 새로 쌓임 |
| 고객센터 ← | …/notice | 앞 기록으로 되돌아감 = **공지사항** |
| 공지 ← → 고객센터 ← | …/notice | 같은 루프 반복 (2회 확인) |

→ 헤더 ← 만으로는 고객센터에서 내정보로 **절대 못 나간다**. 시스템 안내·혜택·이벤트도 같은 컴포넌트·같은 코드 → 같은 결함(코드 확인, 화면 재현은 공지만).

### D2 — FAIL (코드 확인, 화면 재현 안 함): 글 상세 ← 도 같은 방식

- `CustomerCenterBoardDetailClient.tsx:307` `preferHistoryBack={false}` → 목록을 새로 쌓음. 상세 → 목록 → 고객센터 → (뒤로) 목록 → … 2단 루프.
- 알림에서 들어온 글은 `resolveNotificationAwareDetailBackHref` 로 `/notifications` 를 새로 쌓는다(같은 방식).

### D3 — NOT_PROVEN (실기 안 함): Android ◁ 도 쌓인 기록을 그대로 되밟는다

- ◁ = `DibaySystemBackPlugin.java:47-48` `webView.goBack()` = 기록 뒤로. 헤더 ← 를 누를 때마다 기록이 하나씩 늘어 ◁ 가 공지 ↔ 고객센터를 그만큼 반복한다. iPhone 스와이프 뒤로도 같은 기록을 쓴다.

### D4 — 정보: 「업데이트 내역」만 다른 길

- 허브 타일은 `/mypage/app-updates` 로 간다(`customer-center-content-paths.ts:9`). 이 화면은 기록 뒤로(`AppUpdateHistoryClient.tsx:122`)라 **이 화면 단독으로는 루프가 없다**(코드 확인). 다만 D1 루프를 한 번 겪은 뒤라면 기록이 꼬여 있어 같이 막힌 것처럼 보인다.
- 기록이 없을 때(알림으로 바로 진입) ← 목적지는 설정 › 버전 — 고객센터가 아님.
- 게시판 상단 탭은 3개(공지·시스템·혜택)뿐, 허브 타일은 4개 — 업데이트 내역으로는 탭 이동이 안 된다.

### 범위 밖 (보고만, 고치지 않음)
- **비로그인** 공지사항 목록이 「공지사항을 불러오지 못했습니다」: 화면은 비로그인 공개(`isMypageGuestPublicPath`)인데 `GET /api/me/settings/notices?content_type=notice` 가 **401**(로컬 서버 로그). 로그인 상태는 확인 안 함.

## 3. 구성안 — 「고객지원」 누르면 바로 고객센터 항목

### 결정
1. **내정보 홈 「고객지원」 카드 → `/mypage/customer-center` 로 바로 이동.** 중간 분류 화면(`/mypage/section/support`)을 거치지 않는다. 공지까지 4번 → **3번**(고객지원 → 공지사항 → 글).
   - 홈 서비스 카드 「고객지원」은 **이미** `/mypage/customer-center` 로 간다(`lib/home/home-layout-contract.ts:122-126`) → 두 입구가 같은 화면이 된다.
   - 고객센터 주소를 바꾸지 않으므로 푸시·알림·캠페인 목적지(`/mypage/customer-center/**`)·비로그인 공개 경로가 그대로다.
2. **허브 화면 = 지금 고객센터 내용 + 분류 화면에 있던 3줄**
   ```
   [고객지원]                              ← 제목 = 사용자가 누른 이름
   ┌ 무엇이 궁금하신가요?  [문의하기] ┐
   [공지사항] [시스템 안내]                 ← 안 읽은 수 배지 유지
   [업데이트 내역] [혜택·이벤트]
   ─ 신고 내역 · 내 문의 · 이전 문의 기록 · 포인트 · 충전 신청   (지금 그대로, S60 LOCKED 항목)
   ─ 이용약관 · 개인정보처리방침 · 사업자 정보                   (분류 화면에서 옮김)
   ```
3. `/mypage/section/support` 는 **서버 redirect(replace) → `/mypage/customer-center`** — 예전 링크·기록으로 들어와도 빈 화면이나 중복 화면이 없다.
4. 고객센터 허브 ← = 기록 뒤로, 기록 없으면 **내정보 홈**(지금은 분류 화면 `/mypage/section/support`).

### 뒤로가기 규칙 (루프 제거)
기존 공용 도구 `fixedBackHistory="settle"`(`lib/navigation/fixed-destination-back.ts`, 거래·커뮤니티 상세에서 이미 사용)를 쓴다:
**바로 앞 기록이 목적지면 back(기록 하나 지움), 아니면 replace(현재 화면을 목적지로 바꿈)** — 기록이 늘지 않는다.

| 화면 | ← 목적지 | 방식 |
|---|---|---|
| 고객지원(허브) | 앞 화면, 없으면 /mypage | 기록 뒤로 (지금 그대로) |
| 공지·시스템·혜택 목록 | 고객지원 허브 | **settle** (지금 push) |
| 업데이트 내역 | 앞 화면, 없으면 **고객지원 허브** | 기록 뒤로 (fallback 만 변경) |
| 글 상세 | 목록 (알림에서 왔으면 알림함) | **settle** (지금 push) |
| 목록 상단 탭 이동 | — | replace (지금 그대로) |

결과 기록: `[/mypage, 허브, 공지]` → ← → `[/mypage, 허브]` → ← → `[/mypage]`. ◁·스와이프도 같은 기록이라 같은 순서.

### 바뀌는 파일 · 영향
| 파일 | 변경 | 영향받는 곳 · 같은 단계 처리 |
|---|---|---|
| `components/mypage/ds/MyScreen.tsx`, `components/my/MySubpageHeader.tsx` | 선택 prop `fixedBackHistory` 를 `AppBackButton` 까지 전달 | 기본값 없음 → 다른 내정보 화면 동작 불변 |
| `components/mypage/cs/CustomerCenterBoardListClient.tsx` | ← settle | 공지·시스템·혜택 3화면 |
| `components/mypage/cs/CustomerCenterBoardDetailClient.tsx` | ← settle (빈 글·오류 화면 「목록으로」 버튼도 replace) | 4종 상세 + 알림 진입 |
| `components/app-updates/AppUpdateHistoryClient.tsx` | 기록 없을 때 fallback → 고객지원 허브 | 설정 › 버전에서 들어온 경우는 기록 뒤로라 그대로 설정으로 |
| `components/mypage/cs/CustomerCenterHubClient.tsx` | 제목 `mypage_ia_cat_support`, 하단 약관·개인정보·사업자 3줄 | — |
| `lib/mypage/mypage-ia.ts` | support 카드 href → `/mypage/customer-center`, 허브 부모 → `/mypage`, `MYPAGE_IA_GUEST_PUBLIC_ROWS` 제목 동일화 | `MyInfoHomeCategoryHub.tsx:134` 카드 링크 · 분류 화면 `customer-center` 줄 제거 |
| `app/(main)/mypage/section/[...]` (support) | redirect → `/mypage/customer-center` | 알림·홈 어디에도 이 주소를 목적지로 쓰는 곳 없음(grep) |
| `lib/layout/resolve-main-tier1.ts` | 허브 1단 제목 = 고객지원, `/mypage/app-updates` 기본 back | 첫 프레임 제목과 페이지 제목 일치 |
| 테스트 | `mypage-tier1-title-coverage`, mypage-ia 테스트, 새 뒤로 순서 테스트 | — |

분류: **웹만** (네이티브·DB 변경 없음 → 배포 후 앱 재시작). 통화·메신저 코드 무관.

### 회귀 위험
- 알림 → 글 상세 → ← : settle 이므로 앞 기록이 알림함이면 back, 아니면 알림함으로 replace — 기존 목적지와 같음.
- 매장 사장님 경로(`from=owner-care`)는 `MypageCsOwnerCareBridge` 별도 — 이번 변경에 포함하지 않음.
- 「고객센터」 이름이 화면 제목에서 「고객지원」으로 바뀜(타일·게시판 이름 BOARD_LABEL 은 그대로, 어드민 1:1 유지).

## 4. 검증 계획 (승인 후)
1. 코드: `typecheck:build` · 관련 vitest · eslint · `check:i18n-quality`.
2. 로컬 화면: 헤더 ← 로 4게시판·상세 각각 허브 → 내정보까지 나가는지 기록 표로 확인.
3. 실기(Owner 계정·휴대폰, Production SHA 기록): Android ◁ / 헤더 ←, iPhone 스와이프 / 헤더 ← × (공지·시스템·업데이트·혜택·상세·알림 진입). 앱 실행 상한 10회 안.

## 5. 남은 것
- 실기·로그인 상태 재현: **NOT_PROVEN**.
- 비로그인 공지 목록 401: 범위 밖, 별도 지시 필요.
