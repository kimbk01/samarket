# Slice 1 — App Customer Center Foundation

**SSOT:** `docs/customer-platform/app-customer-center-ssot.md` (**LOCKED**)  
**Date:** 2026-08-06

## A. Legacy measurement (updated)

| 앱 | 진입 | 표시 | 채택 |
|----|------|------|------|
| 당근 iOS | 나의 당근 → 고객지원 → 고객센터 | **풀스크린 허브** | **기본 골격** |
| 배민 iOS | 마이배민 하단 고객센터 블록 | 풀페이지 리스트 행 | 자산·섹션 통합 참고 |
| 배달K iOS | 내정보 → 고객센터 행 | 풀페이지 리스트 | 내정보 허브 참고 |
| 카카오 Samsung | 설정 → 고객센터 | Full WebView | full-page (sheet 폐기) |

**폐기:** 모바일 시트 고객센터 방향.

## B. First Break

고객센터 stub → 허브 미연결.

## C. Implementation map

| 항목 | 경로 |
|------|------|
| Hub | `/mypage/customer-center` · `CustomerCenterHubClient` |
| Support rows | `MYPAGE_HOME_SUPPORT_ITEMS` |
| Points strip | `MypagePointsAssetSummary` |
| Paths | `lib/mypage/customer-center-paths.ts` |
| Legacy support URL | `settings:support` → hub redirect |

## D. Out of scope

FAQ/Event fake · Admin CP · Baemin FAQ / DeliveryK CS inner UI.
