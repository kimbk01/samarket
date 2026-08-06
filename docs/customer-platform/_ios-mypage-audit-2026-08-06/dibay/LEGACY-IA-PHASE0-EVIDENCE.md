# Phase 0 — Legacy IA blocking evidence (2026-08-06)

Reuse Slice 0 USB (`usb/guided/G*`) + Phase 0 IA (`usb/guided-phase0-ia/P0-*`). No indefinite re-measure.

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | 내정보 전체 세로 스크롤 맵 | **PROVEN** | P0-01 top · P0-11 mid(거래) · P0-02 bottom(설정/CS) |
| 2 | 프로필→활동→설정→CS→정책 순서 | **PROVEN** | P0-01→11→02; push P0-05/07/10/12 |
| 3 | Row press 상태 | **NOT_PROVEN** | HID N/A (iOS 26.6); mid-frame 미캡처 — **구현 비차단** (active: 토큰 유지) |
| 4 | Push 중간 프레임 | **NOT_PROVEN** | end-state only (G14, P0-05/07/10/12) — **비차단**; motion ms 기존 계약 유지 |
| 5 | Back 중간 프레임 | **NOT_PROVEN** | end-state (P0-06/09/11/13) — **비차단** |
| 6 | Profile edit sheet | **PROVEN** (end) | G07–G09 |
| 7 | Logout modal | **PROVEN** (end) | G02 |
| 8 | Scroll restoration | **PROVEN** | G01, G10, G10b |
| 9 | 내정보 탭 재선택 top reset | **PROVEN** | G13 |

```text
KARROT LARGE-SCREEN REFERENCE = NOT_AVAILABLE
```

→ DIBAY tablet/desktop = **단일 중앙 1열** (list+detail 미채택). 구현 중단 사유 아님.

```text
PHASE 0 BLOCKING GAPS = NONE
→ Phase 1 LOCK → Phase 2 implement (no re-ask)
```
