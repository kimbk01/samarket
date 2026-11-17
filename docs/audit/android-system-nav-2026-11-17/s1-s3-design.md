# S1·S3 구현 설계 (계획만 · 구현 안 함) — 2026-11-17 PHT

원칙: ◁ 는 Android 기능이다. DIBAY 는 받을 일이 있을 때만 받고, 없으면 Android 가 처리하게 둔다. 새 동작은 만들지 않는다.
범위: S1·S3 만. 통화 뒤로 처리(S2)는 범위가 아니다.

## 코드 확인 결과 (설계 근거)

| 확인 | 위치 | 내용 |
|---|---|---|
| Capacitor 뒤로 처리 | `@capacitor/app` `AppPlugin.java:50-63` | 항상 켜져 있음. 이전 페이지가 없으면 아무것도 안 하고 ◁ 를 소비. 켜짐 여부는 비공개 필드라 네이티브에서 직접 못 바꿈 |
| 공개 끄기 방법 | `AppPlugin.java:34` | 설정 `plugins.App.disableBackButtonHandler: true` 로 시작부터 꺼 둘 수 있음(Android 전용 키) |
| 네이티브에서 JS 메서드 호출 | `PluginCall`·`MessageHandler.java:121` | 콜백 없는 호출은 `fireRestoredResult` 를 일으켜 부작용 → **사용 안 함**. 비공개 필드 리플렉션도 R8 압축 때문에 깨지기 쉬움 → **사용 안 함** |
| 웹의 ◁ 사용처 | 저장소 전체 검색 | `App.addListener("backButton")` 는 `lib/ui/overlay-back-stack.ts:42` **한 곳뿐**. 창이 열렸을 때나 알림 이동 직후 화면에서만 리스너가 있음 |
| 통화 뒤로 처리 | `MainActivity.java:1472-1498` | 통화가 없으면 스스로 끄고 다음 처리로 넘김. 다음 처리가 없으면 Android 기본(첫 화면이면 앱이 뒤로 감)으로 감 |
| 문의 시트 | `SupportModalHost.tsx:341` → `SupportSheetShell` → `DibayUsableAreaSheet` → `DibayOverlayRoot.tsx:81` | `dismissible={false}` + `onClose` 를 넘겨서 ◁ 「삼킴」으로 등록됨. `dismissible` 은 바깥 탭 닫기·Esc 도 정함(`DibayOverlayRoot.tsx:114·167`) |
| 문의 시트 자체 기록 | `SupportModalHost.tsx:157-178` | 열 때 기록 1개를 넣고, 뒤로(popstate)가 오면 닫음 — 「기기 뒤로 = 닫기」로 이미 설계돼 있음 |

## S3 — 문의 시트 ◁ 삼킴 제거 (웹만)

- 변경: `SupportSheetShell.tsx` 가 `dismissible` 이 false 일 때 `onClose` 를 시트에 넘기지 않는다. `DibayUsableAreaSheet.tsx` 의 `onClose` 를 선택 값으로 바꾼다(`DibayOverlayRoot` 는 이미 선택 값).
- 결과: 문의 시트가 ◁ 에 등록되지 않음 → ◁ 가 WebView 이전 기록(시트가 넣은 1개)으로 감 → popstate → 시트 닫힘. 작성 중 내용은 기존처럼 저장되어 다시 열면 이어 씀.
- `dismissible={false}` 는 그대로 → 바깥 탭·Esc 로 닫히지 않음(지금과 같음). 새 동작 없음.
- 다른 `DibayUsableAreaSheet` 사용처는 `onClose` 를 계속 넘기므로 영향 없음. 「처리 중」 대화 상자 등 다른 삼킴(N4)은 승인 범위 밖이라 손대지 않음.
- 현재 설치본(빌드 68)에서도 동작한다. 리스너가 없으면 Capacitor 가 이전 페이지로 가기 때문이다. 네이티브 빌드는 필요 없다.

## S1 — 받을 일이 있을 때만 DIBAY 가 ◁ 를 받음 (네이티브 + 웹)

| 순서 | 파일 | 변경 |
|---|---|---|
| 1 | `capacitor.config.ts` | `plugins.App.disableBackButtonHandler: true` 로 Capacitor 뒤로 처리를 끈다(Android 전용, iOS 영향 없음) |
| 2 | 새 플러그인 `DibaySystemBackPlugin.java` + `MainActivity.java` 등록 | DIBAY 뒤로 처리를 **하나만** 둔다. 켜짐 = `webView.canGoBack()` **또는** 웹이 「◁ 를 받겠다」고 알린 상태. 누르면 웹이 받겠다고 한 상태에서는 웹에 `backButton` 이벤트를 보내고, 아니면 `webView.goBack()` 한다(Capacitor 원래 동작과 같음). 꺼져 있으면 Android 가 처리한다 |
| 3 | `DibayBridgeWebViewClient.java` | `doUpdateVisitedHistory`(공식 WebView 방식)와 `onPageFinished` 에서 켜짐 상태를 다시 계산한다 |
| 4 | `lib/ui/overlay-back-stack.ts` 의 driver 만 | 리스너를 붙이고 뗄 때 새 플러그인에 받기 켜기·끄기를 알린다. 새 플러그인이 없는 구 설치본에서는 지금처럼 `App.addListener("backButton")` 를 쓴다. `handleNativeBack`·스택 규칙은 바꾸지 않는다 |
| 5 | 시험 | driver 선택(새 플러그인 / 구 설치본), 켜기·끄기 알림 순서 |

등록 위치: DIBAY 뒤로 처리는 Capacitor 처리가 있던 자리(브리지 로드 시점)에 등록한다.

### 바뀌는 동작

| 화면 | 지금 | S1 뒤 |
|---|---|---|
| 탭 첫 화면(HOME·LOUNGE·DIPICK·telRING·MY) | 반응 없음 | Android 기본 처리 — 앱이 뒤로 감. 버튼 기기와 제스처 기기가 같다 |
| 하위 화면 | 이전 화면으로 | 같음 |
| 창이 열렸을 때 | 창 닫힘 | 같음 |
| 알림 이동 직후(N6) | `history.back()` | 같음 — 같은 리스너 규칙 |
| 통화 연결 중(웹 통화) | 통화 처리(PiP) | 같음 — 통화 처리가 먼저 동작하고, 통화가 없으면 다음 처리로 넘긴다 |

예측 뒤로 애니메이션: 통화 뒤로 처리(C2)가 항상 켜져 있어서 S1 만으로는 나오지 않는다. 이것은 S2 의 범위이며 통화 규정을 따른다.

### 위험 · 실기 확인 항목

1. `doUpdateVisitedHistory` 가 SPA 이동(pushState·replaceState·뒤로)마다 불리는지는 문서상으로만 확인했고, 실기는 NOT_PROVEN 이다. 만약 불리지 않아 켜짐이 늦게 바뀌면 하위 화면 ◁ 에서 앱이 나갈 수 있다. 그래서 실기에서 화면 이동마다 로그로 확인한다. 불리지 않으면 웹이 화면 이동 때 「다시 계산」을 알리는 방식을 더한다.
2. 구 설치본 호환: 웹이 먼저 배포되어도 구 설치본은 driver 가 지금 방식을 써서 동작이 같다. 새 설치본 + 구 웹 조합은 없다(웹은 항상 최신).
3. 외부 페이지(로그인 등)에서 돌아온 뒤 기록 상태: 실기 확인.
4. 분류: **네이티브**(capacitor.config + Java) — 설치본 빌드 필요, 빌드 때 versionCode 와 iOS 빌드 번호 1회 증가(`native:prepare`). iOS 파일 변경 없음.
5. 롤백: PR 되돌림 + 설치본 재빌드.

### 실기 행렬 (Samsung 3버튼 · Xiaomi 3버튼 · Xiaomi 제스처, 실제 버튼·가장자리 밀기)

탭 첫 화면 5개 ◁(→ 런처, 아이콘 재실행 시 같은 화면) · 하위 화면 ◁ · 상품 ⋮ 시트·QR 시트·문의 시트 ◁ · 알림으로 연 화면 ◁ · 키보드 ◁ · ○·||| 회귀 · 웹 통화 연결 중 ◁(통화 규정상 회귀만 확인).

## 진행 순서 (승인 시)

S3 와 S1 은 같은 작업이므로 PR 하나로 만든다 → 로컬 검증 → PR·자동 병합 등록 → main 반영 후 `native:prepare` → 설치본 빌드 → 위 행렬로 실기 측정 → 보고.
