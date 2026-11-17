# 모임 참여 미리보기가 「모임 찾기」 시트 아래에 그려지는 결함 — 수정 계획 (구현 안 함 · Owner 승인 대기) — 2026-11-18 PHT

- 기준 코드: origin/main `845daf0`. 이 결함과 관련된 파일은 `ea39ab3`(측정 기준) 이후 바뀌지 않았다.
- 분류: 웹(`components/`). 통화·네이티브·DB 변경 없음. 설치본 빌드 불필요.

## 1. 결함 (FAIL)

| 항목 | 내용 |
|---|---|
| 재현 | 06:23 PHT, Samsung 3버튼, 디버그 1.2.7 (76), q테스트1 로그인 |
| 순서 | telRING → 「모임 찾기」 시트 → 모임 「참여」 |
| 기대 | 참여 미리보기(전체 화면)가 시트 **위**에 보인다 |
| 실제 | 미리보기가 시트 **아래**에 그려져 가려진다. 위쪽에 초록 배경만 비친다(`v4-24-joinpreview-open.png`). 사용자는 미리보기의 「참여」 버튼을 볼 수 없다 |
| ◁ 동작 | 정상: 마지막에 연 미리보기가 먼저 닫히고, 다음 ◁ 에 시트가 닫힌다(S4 등록 순서) |

결과적으로 ◁ 순서와 화면에 보이는 순서가 서로 다르다. 보이는 맨 위는 시트인데, ◁ 는 보이지 않는 미리보기를 닫는다.

## 2. 원인 (코드 확인)

| 화면 | 그려지는 위치 | 층(z-index) |
|---|---|---|
| 「모임 찾기」 시트 `MessengerHomeBottomSheetShell` (`components/community-messenger/MessengerSheetUi.tsx`) | `createPortal` → `document.body` | `MAIN_BOTTOM_NAV_SHEET_Z_CLASS` = **1300** |
| 참여 미리보기 `OpenGroupJoinPreviewFullScreen` (`components/community-messenger/home/OpenGroupJoinPreviewFullScreen.tsx:64`) | 메신저 홈 트리 안(포털 없음) | `z-[55]` |

- 미리보기는 시트가 열린 상태에서 열린다(`CommunityMessengerHome.tsx` `openJoinModal`). 그래서 1300 시트 아래에 깔린다.
- 앱의 층 정의(`lib/main-menu/bottom-nav-config.ts`)는 다음과 같다.
  - 하단 탭 1200, 시트 1300
  - **시트 위 중첩 창 1305** (`MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS`)
  - Auth gate 1310, 토스트 1320
- 미리보기는 이 정의를 따르지 않고 55 를 쓴다.

## 3. 진입 경로와 영향

| 경로 | 지금 | 수정 후 |
|---|---|---|
| A. 「모임 찾기」 시트 → 참여 (`?open=public-group-find`. 앱 안 링크는 코드 검색 0건 — 아래 「확인 필요」) | 가려짐(FAIL) | 시트 위에 보임 |
| B. 메신저 검색 화면(`MessengerChatSearchScreen`, 페이지 안 화면) → 오픈채팅 결과 선택 | 검색 화면 위에 보임. 하단 탭(1200)이 미리보기(55) 아래쪽을 덮는지는 **측정 안 함(NOT_PROVEN)** | 1305 라서 하단 탭 위. 미리보기가 전체 화면을 덮음 |
| 참여 성공 | 미리보기·시트 둘 다 닫고 방으로 이동(`joinOpenGroup`) | 같음 |
| ◁ | 미리보기 → 시트 순 | 같음(이제 보이는 순서와 일치) |

## 4. 수정 (1개 파일)

`components/community-messenger/home/OpenGroupJoinPreviewFullScreen.tsx`
1. 바깥 `<div>` 를 `createPortal(…, document.body)` 로 그린다. 시트와 같은 방식이다.
2. `z-[55]` 를 `MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS`(1305)로 바꾼다. 같은 상수를 쓰는 기존 예: `MessageReactionRosterSheet.tsx:118`, `OwnerOrderAcceptSheet.tsx:55`, `PhilifeNeighborhoodWriteForm.tsx:1352`.
3. 그 밖의 내용·문구·닫기·참여·◁ 등록(`useOverlayHardwareBack`)은 바꾸지 않는다.

새 층 값·새 동작·문구는 넣지 않는다. 기존 층 정의의 값만 쓴다.

## 5. 바꾼 뒤 깨질 수 있는 것과 처리

| 위험 | 확인·처리 |
|---|---|
| 포털로 옮기면 서버 렌더 시 `document` 가 없다 | 부모가 `joinTargetGroup` 이 있을 때만(사용자 동작 뒤, 클라이언트) 그리므로 서버 렌더에는 나오지 않는다. 그래도 시트와 같이 `mounted` 확인 뒤 포털을 쓴다 |
| 키보드(비밀번호·별명 입력) 보정 `useFormKeyboardViewport` | 미리보기 안 ref 기준이라 포털과 무관하다. 실기로 입력란 가림 여부를 확인한다 |
| 오류 표시 `actionError` 가 메신저 홈 본문에 그려져 미리보기에 가려짐 | 지금도 미리보기(전체 화면)에 가려진다 — 바뀌지 않는다(범위 밖 기록만) |
| 토스트(1320)·Auth gate(1310) | 미리보기(1305)보다 위에 남는다. 층 정의 그대로다 |
| 미리보기 안에 열리는 다른 창 | 없음(코드 확인: 시트·대화상자·선택기 없음) |

## 6. 검증

- **코드**
  - `typecheck:build`
  - 관련 vitest: `floating-overlay-back-contract`, `chat-v4-part3-screens`, 메신저 홈 시험
  - 변경 파일 eslint
  - `check:i18n-quality`(문구 변경 없음 확인)
- **계약 시험 추가**: 미리보기가 시트 층(1300) 위 상수를 쓰고 포털로 그려지는지 확인한다.
- **실기 (Samsung 3버튼·Xiaomi 제스처, 운영 SHA 확인 후)**
  1. 경로 A: 시트 → 참여 → 미리보기가 맨 위에 보이는지
  2. ◁1 → 미리보기만 닫히고 시트가 보이는지
  3. ◁2 → 시트 닫힘
  4. 경로 B: 검색 → 오픈채팅 → 미리보기 맨 위, 하단 탭에 가리지 않는지
  5. 별명·비밀번호 입력 시 키보드가 입력란을 가리지 않는지
- **가입 안 함**: 실기 중 「참여」 확정은 누르지 않는다. 운영 데이터 변경이 없다.

## 7. 반영·롤백

- 작업 브랜치 → PR 1개 → 자동 병합 등록(개발 프로세스 1번). 웹만이므로 배포 후 앱을 다시 시작하면 반영된다.
- 롤백: 해당 PR 되돌림 PR.

## 8. 확인 필요 (Owner)

- 「모임 찾기」 시트(경로 A)를 여는 앱 안 링크가 코드에 없다. `?open=public-group-find` 주소로만 열린다. 이 시트가 지금 쓰이는 화면인지 모른다. 쓰이지 않는 화면이라도 경로 B 와 같은 미리보기를 쓰므로 수정은 같다.
