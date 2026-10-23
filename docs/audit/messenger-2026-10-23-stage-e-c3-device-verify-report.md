# E-C3 실기기 검증 보고 (2026-10-23 ~23:10 PHT)

- **코드 PASS ≠ 실기기 PASS** · main/Prod 미반영 · 앱 삭제·데이터 초기화·네이티브 재빌드 **없음**

## 1. 검증 대상 고정

| 항목 | 값 |
|---|---|
| git HEAD | `b055f77618ab0d98dbe91be7b328a1eaa1e8ad` (E-C2-B 보고 · **E-C3 미포함**) |
| E-C3 상태 | **worktree DIRTY 미커밋** |
| E-C3 번들 고정 | `EC3_WORKTREE_BUNDLE_SHA256=37287a90ca25cde8a9d5df07ad14c1b902e83d789f15845f7f14bc0ccaf074eb` |
| 배포 구분 | 웹만 |

## 2. WebView 접근 경로

| 경로 | 결과 |
|---|---|
| Cap `server.url` 기본 | `https://samarket.vercel.app` (Production) |
| Production에 E-C3 코드 | **없음** (main 미반영 · Owner 배포 금지) |
| 로컬 `CAPACITOR_SERVER_URL` + 재빌드 | **미실시** (네이티브 빌드·기기 보호 금지와 충돌) |

→ 실기기가 로드하는 WebView는 **구 Production 번들**이라 E-C3 중앙 팝업 UI를 **관측 불가**.

## 3. 기기 연결 (접근성만)

| 기기 | adb/USB | 앱 | 서명 메모 |
|---|---|---|---|
| Xiaomi `24076RP19G` (`8b37179f7d94`) | connected | `com.dibay.app` 1.2.4 (11) | `f1cdfabf…` |
| Samsung `SM-M156S` (`RFCY40PY2CA`) | connected | `com.dibay.app` 1.2.4 (11) | `b8584fc4…` (디버그와 구분) |
| iPhone | **미연결** | — | — |

앱 삭제·덮어쓰기·데이터 초기화 **하지 않음**.

## 4. 실기기 UI·동작 판정

| 항목 | 삼성 | Xiaomi | iPhone |
|---|---|---|---|
| 로고·색·아이콘·제목/본문·확인 CTA | **NOT_PROVEN** | **NOT_PROVEN** | **NOT_PROVEN** |
| 중앙 정렬·SIDE-08·safe area·ko/en | **NOT_PROVEN** | **NOT_PROVEN** | **NOT_PROVEN** |
| 종료 이벤트 1회·확인/뒤로/복귀 | **NOT_PROVEN** | **NOT_PROVEN** | **NOT_PROVEN** |
| 수락·거절·종료·재발신 회귀 | **NOT_PROVEN** | **NOT_PROVEN** | **NOT_PROVEN** |

원인: E-C3가 기기가 로드하는 origin에 없음. **실패(FAIL) 관측 없음** → UI 최소 수정 **없음**. 반복 시도 **안 함**.

## 5. 네이티브 안내

Android/iOS Activity·VC 상단 overlay는 웹 E-C3와 **별도 경로** · 이번 검증 대상 아님 · 미변경.

## 6. 배포 승인

**불가(보류).** 실기기 PASS 없음. main/Prod는 Owner가 E-C3를 반영·배포한 뒤 WebView에서 재검증할 때만 검토.
