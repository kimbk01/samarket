# U6 알림센터 스크롤 복원 FAIL — 원인·수정안 (2026-10-29 · 커밋 안 함 · Owner 승인 대기)

## 1. 재현 (S 삼성 · 앱 1.2.4 (15) · Production · CDP 측정 02:0x PHT)
1. `/notifications` 를 연다. 창 `scrollHeight=832 = innerHeight=832`라 창은 스크롤되지 않는다.
2. 실제로 스크롤되는 요소는 `<main class="main-hub-scroll-body">` 하나다(`scrollHeight=1343`, `clientHeight=738`).
3. main 을 500px 내린 뒤 알림 행을 누른다. sessionStorage 에는 `restore=1`, **`scroll-y="0"`** 이 저장된다.
4. 메신저 방으로 이동했다가 뒤로 오면 main `scrollTop=0`(맨 위)이다. 2026-10-28 실기(640·381 → 0)와 같은 결과다.

## 2. 원인 (main 코드 근거)
`lib/notifications/notification-center-scroll-restore.ts` 와 `app/(main)/notifications/page.tsx` 가 **창(`window.scrollY`·`window.scrollTo`)** 기준으로 저장·복원한다. 그런데 앱 셸에서는 본문이 `[data-main-hub-scroll-body]` 안에서 스크롤된다.
- 저장: `window.scrollY` 는 항상 0 → 「복원 위치 없음」으로 처리된다.
- 복원: `window.scrollTo` 는 아무것도 움직이지 않는다.
- 추가: 복원은 첫 프레임과 350ms 에만 시도한다. 목록을 늦게 받아 그 시점에 높이가 모자라면, 저장값이 맞아도 위치가 잘린다.

## 3. 수정안 (웹만 · 통화·네이티브 무관)
- 저장·복원 대상을 앱 본문 스크롤 요소로 바꾼다. 기존 공용 함수 `lib/ui/store-detail-scroll-root.ts` 의 `getStoreDetailAppScrollRoot` / `getStoreDetailScrollTop` / `setStoreDetailScrollTop` 를 쓴다(허브 main → `<main>` → 문서 순).
  - `markNotificationCenterScrollRestore()`: `getStoreDetailScrollTop()` 값을 저장한다.
  - 목록 페이지: 복원 값이 없으면 `setStoreDetailScrollTop(0)`, 있으면 복원한다.
- 복원 시점: 목록 행이 그려진 뒤(`visibleCount > 0`)에 한 번 적용한다. 스크롤 높이가 목표에 못 미치면 다음 프레임에 다시 시도하며, 최대 1초까지만 한다. 사용자가 그사이 직접 스크롤하면 중단한다.
- 바꾸는 파일
  - `lib/notifications/notification-center-scroll-restore.ts`
  - `app/(main)/notifications/page.tsx`
  - 테스트 1개 추가: 허브 스크롤 요소 기준 저장·복원
- 바뀌지 않는 것
  - 행을 눌러 떠난 경우에만 복원하고, 다른 경로로 들어오면 맨 위에서 시작하는 동작
  - 탭 전환·필터

## 4. 영향·호환
- 웹 배포만 하면 된다. 앱 재설치는 필요 없고 재시작만 하면 된다. iOS·Android 같은 코드다.
- 롤백: 커밋을 되돌린다.

## 5. 검증
- 로컬
  - `typecheck:build`
  - 관련 vitest
  - 변경 파일 eslint
- 실기(작업자 · CDP·adb)
  - S: main 500px → 행 탭 → 뒤로 → `scrollTop≈500`
  - X: 같은 절차를 adb 화면 캡처로 확인
  - 다른 경로로 들어오면 맨 위인지(회귀)
