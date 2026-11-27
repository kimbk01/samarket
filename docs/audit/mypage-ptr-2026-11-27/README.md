# 내정보 당겨서 새로고침 — 감사·설계안 (2026-11-27 PHT)

Owner 지시 원문: 「내정보 부분의 새로 고침도 동일한 새로 고침 부분이 필요 한 부분이다」 · 「배포 규정을 준수 하고 임의로 배포 병합 하지 마라」

범위: 감사·설계 → Owner 「설계안대로 구현」(2026-11-27) → PR `feat/mypage-ptr`. 구현은 홈 머리줄 PR(#645)과는 **별도 PR**(도메인이 다름)로 낸다. 병합은 Owner 지시 뒤에 한다. 줄 번호는 main `2203d008d` 기준.

## 1. 현재 (확인 결과)

| 항목 | 판정 | 증거 |
|---|---|---|
| 내정보 `/mypage` 당겨서 새로고침 | **없음 (FAIL — 홈과 다름)** | `lib/layout/resolve-main-hub-ptr-domain.ts` 도메인 목록 = home·trade·philife·stores·messenger, `/mypage` 없음. 운영 DOM(비로그인, 390×844): 스크롤 본문 표식 `mainHubScrollBody` 하나뿐, 당김 표식 없음. `components/mypage`·`components/my`·`app/(main)/my*` 에 당김 코드 0개 |
| 내정보 머리줄 | 고정 (PASS) | 셸 헤더 자리(스크롤 밖) — 홈 감사 문서 1절 |
| 어드민 띠 광고 대상 「내정보」 | 고를 수 있는데 앱에 나올 자리가 없음 (**FAIL**) | `lib/platform-popup/types.ts:91` 광고 화면 목록에 `MYPAGE` 있음 · `resolve-dibay-surface.ts:141` `/mypage`→`MYPAGE`. 당김 슬롯이 없어 「내정보」·「전체(GLOBAL)」 대상 띠 광고가 내정보에서 안 보임 |
| 운영 띠 광고 현황 | 진행 중 0건 | 운영 DB 읽기 전용 조회: `ptr_reveal` 캠페인 5건 모두 `status=ended` (GLOBAL 4 · TRADE 1) → 구현해도 당장 새로 나오는 광고 없음 |

### 숨은 결함 — 기존 새로고침 함수를 그대로 쓰면 「가짜 새로고침」이 된다

`useMypageHomeModel().refresh()` (`hooks/use-mypage-home-model.ts:92`) → `resolveMypageHomeProfileResult()` (`lib/mypage/resolve-mypage-home-profile.ts:60`) 는 **기기 캐시(앱 시작 프로필)를 먼저 돌려주고 네트워크를 안 탄다** (`peekMypageHomeProfileRow` = 캐시 ?? 앱 시작 프로필). 앱이 켜져 있으면 늘 캐시가 있다. 그래서 이 함수를 당김에 연결하면 스피너는 돌지만 서버 값은 안 바뀐다. 당김은 **모든 캐시를 건너뛰는** `fetchMeProfileFresh` (`lib/profile/fetch-me-profile-deduped.ts:221`, 편집 화면이 쓰는 것)를 써야 한다.

## 2. 내정보 화면 데이터 — 당김으로 새로 받을 것

| 화면 부분 | 데이터 출처 | 당김에서 |
|---|---|---|
| 프로필 카드 · 필수 정보 안내 · 주소 | 프로필(`/api/me/profile?mode=full`) + 주소 | **새로 받음** — `fetchMeProfileFresh` + 주소 `force` |
| 오른쪽 숫자(신뢰·찜 등) · 내정보 배너 | `GET /api/me/mypage-summary` (`hooks/use-mypage-home-summary.ts`) | **새로 받음** — `loadMypageHomeSummary(uid, { force: true })` |
| 고객센터 안 읽음 점 | `GET /api/me/settings/notices?unread_counts=1` (`MyInfoHomeMenuSections.tsx:181`, 지금은 처음 그릴 때 1번만) | **새로 받음** — 같은 호출을 다시 부를 수 있게 바꿈 |
| 거래 채팅 안 읽음 | 공용 배지 저장소(하단 탭과 공유, 실시간 갱신) | 안 건드림 — 이미 실시간이고, 메신저 배지 계약(다른 도메인) |
| 매장·관리자 메뉴 줄 | 서버 시드 — 홈 화면에서는 안 씀(`MyPageHomeDashboard.tsx:28`) | 해당 없음 |

결과 판정(SSOT `DibayPtrOutcome`): 셋 다 성공 = 「새로고침 완료」, 일부 실패 = 「일부만 새로고침」, 모두 실패 = 「새로고침 실패」 — 실패를 성공으로 표시하지 않는다.

## 3. 설계 — 홈·거래와 같은 공통 엔진 그대로

동작 규칙(당김 거리·놓는 기준·스피너 최소 시간·결과 표시 시간·띠 광고·문구)은 공통 SSOT(`lib/ui/ptr/dibay-ptr-ssot.ts`, `useDibayPtrGesture`, `DibayPtrSlot`)를 그대로 쓴다. 새 값은 만들지 않는다.

| # | 파일 | 바꾸는 것 |
|---|---|---|
| 1 | `lib/layout/resolve-main-hub-ptr-domain.ts` | 도메인에 `mypage` 추가 — **`/mypage`·`/my` 루트만**(하위 화면 제외). 한 번에 한 도메인만 리스너를 붙이는 기존 규칙 유지 |
| 2 | `lib/mypage/mypage-pull-refresh-store.ts` (새) | `createDibayPtrStore({ preflight: preflightMainHubPtrRefresh })` — 홈 저장소와 같은 모양 |
| 3 | `components/mypage/MypagePullRefreshHost.tsx` (새) | `useDibayPtrGesture({ enabled: 도메인=mypage, rootDatasetKey: "mypagePtrRoot", bindStickyHeader: true, resetRefreshingOnCleanup: true })` — 머리줄이 스크롤 밖이라 **머리줄 위에서 당겨도** 되게 셸 헤더에도 리스너를 붙인다(배달 홈과 같은 방식) |
| 4 | 슬롯 자리 | 내정보 머리줄(1단) **바로 아래**, 홈·거래와 같은 시그니처 그린 슬롯: `MyPageHeader` → `MySubpageHeader` 의 기존 `stickyBelow` 자리에 `<DibayPtrSlot store={mypagePtrStore} tone="onBrand" className="bg-signature" dataAttribute="data-mypage-ptr-hint" />` (셸 `AppStickyHeader` 가 1단 아래에 그림 — 거래 슬롯과 같은 위치) |
| 5 | `hooks/use-mypage-home-model.ts` | `refresh({ fresh: true })` 추가 — 프로필은 `fetchMeProfileFresh`, 주소는 `force`, 결과를 `"success" \| "error"` 로 돌려준다. 기존 호출(첫 진입·프로필/주소 변경 이벤트)은 지금 그대로(캐시 우선 — 진입 비용 계약 유지) |
| 6 | `components/mypage/myinfo/MyInfoHomeMenuSections.tsx` | `useCustomerCenterUnreadTotal` 에 다시 읽기 함수 추가(처음 1번 읽는 동작은 그대로) |
| 7 | `app/(main)/my/MyContent.tsx` | **회원 화면에만** Host·슬롯·핸들러(프로필·요약·고객센터 3개 병렬) 연결 |
| 8 | 테스트 | 도메인 판정(`/mypage`·`/my` 만), 당김 → 3개 호출이 **캐시를 건너뛰는지**, 결과 판정(전부 성공·일부 실패·전부 실패), 비회원 화면에 슬롯·리스너 없음 |

### 정한 것 (근거)

- **비회원 내정보는 당김 없음** — 비회원 화면(`MyPageGuestHomeDashboard`)은 서버 데이터가 없는 로그인 안내라 새로 받을 것이 없다. 당김을 붙이면 아무것도 안 받고 「완료」를 띄우는 가짜 새로고침이 된다.
- **하위 화면(`/mypage/*`) 제외** — 지시 대상은 내정보 홈. 하위 화면은 각자 목록·저장 계약이 있다.
- **거래 채팅 배지 제외** — 실시간 공용 배지라 다시 읽을 필요가 없다.

## 4. 영향 (바뀌는 것 / 안 바뀌는 것)

| 대상 | 결과 |
|---|---|
| 내정보 스크롤 | 안 바뀜 — 스크롤 0 에서 아래로 당길 때만 시작(세로 판정 뒤에만 기본 동작 막음) |
| 내정보 탭 전환(헤더 고정·본문 슬라이드) · 프로필 시트 | 안 바뀜 — 시트는 문서 바깥 층이라 리스너 밖 |
| 첫 진입 비용 | 안 바뀜 — 첫 진입은 지금처럼 캐시 우선. 당김할 때만 네트워크 |
| 당김 1회 비용 | API **4건**(프로필 예산 2.3 · 주소 기본값 · 요약 · 고객센터) — 사용자가 당길 때만. *정정: 처음 보고에 「3건」이라 썼으나 주소 force 조회를 빠뜨림* |
| 띠 광고 조회 | 내정보 진입 때 `/api/platform-popup/ptr-reveal` 최대 1건 / 5분 (예산 2.1, 홈·거래와 같은 규칙). 지금 진행 중 광고 0건 |
| 홈·거래·라운지·배달·메신저 당김 | 안 바뀜 — 도메인 판정에 `mypage` 만 추가, 다른 경로 결과 동일(테스트로 고정) |
| 비회원 내정보 | 안 바뀜 |
| 문구 | 새 문구 없음 — 공통 `ptr_*` 키 그대로 |

## 5. 구현 뒤 확인 (완료 판정 기준)

로컬: `typecheck:build`·`typecheck:test`·`test:ci`·변경 파일 eslint. Owner 병합 지시 → 병합 → 운영 반영 SHA 확인 뒤, Owner 화면 조건(로그인 계정·휴대폰)으로 Android·iPhone 각 1회:
- 맨 위에서 당김(본문·머리줄 둘 다) → 스피너 → 「새로고침 완료」 → 접힘
- 다른 기기·어드민에서 바꾼 값(예: 프로필 이름·고객센터 새 답변)이 당김 한 번에 바뀜 — 운영 DB 값과 대조
- 비행기 모드 당김 → 「새로고침 실패」, 화면 값 유지
- 스크롤 중간에서 아래로 끌면 당김 안 시작 · 프로필 시트·메뉴 탭 정상 · 하위 화면에는 당김 없음
- 비회원 내정보: 당김 없음

## 6. 구현 (2026-11-27)

| 파일 | 내용 |
|---|---|
| `lib/layout/resolve-main-hub-ptr-domain.ts` | `mypage` 도메인 — `/mypage`·`/my` 루트만 |
| `lib/mypage/mypage-pull-refresh-store.ts` (새) | 공통 엔진 저장소 |
| `components/mypage/MypagePullRefreshHost.tsx` (새) | 제스처 · `bindStickyHeader` |
| `hooks/use-mypage-home-model.ts` | `refreshFresh()` — 프로필 `fetchMeProfileFresh("mypage_ptr")` · 주소 force · 실패 시 화면 값·상태 유지(주소만 실패면 프로필만 갱신, 주소는 이전 값) |
| `components/mypage/myinfo/MyInfoHomeMenuSections.tsx` · `MyPageHomeDashboard.tsx` | 고객센터 안 읽음 다시 읽기(내정보 홈에서만 당김 등록) |
| `components/my/MyPageHeader.tsx` · `app/(main)/my/MyContent.tsx` | 회원 화면에만 Host·슬롯(`stickyBelow`)·핸들러(프로필·요약) |
| 테스트 | `hooks/__tests__/use-mypage-home-model-ptr-fresh.test.tsx` · `lib/mypage/__tests__/mypage-ptr-wiring.test.tsx` · `lib/layout/__tests__/resolve-main-hub-ptr-domain.test.ts` |
