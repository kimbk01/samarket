# Delivery device scenario lock (Xiaomi · Samsung)

Executable scenarios for final device QA. Platform matrix cells remain in
`docs/perf/delivery-phase0-audit-report.md` §G until device runs fill them.

## Devices

| Role | Model | Serial |
| --- | --- | --- |
| Xiaomi | `24076RP19G` | `8b37179f7d94` |
| Samsung | `SM-M156S` | `RFCY40PY2CA` |

Package: `com.dibay.app` · APK commit must equal Production / `git rev-parse HEAD`.

## Scenarios (each device · cold/warm/resume ≥ 3)

1. **Consumer:** 배달 홈 → 카테고리 → 매장 목록 → 상세 → 첫 메뉴 → 뒤로
2. **Owner:** 오너 홈 → 주문 → 상세 → 상품 → 복귀
3. **Resume:** background → foreground on `/stores` (silent feed refresh, no full pulse)
4. **Keyboard:** 검색 · 주소 · 주문 요청사항 · 어드민 입력 — focus ≥16px, no zoom, field not covered

## Record together

동일 URL 중복 · blank · pulse · CLS · stale 매장 · 리스트 중복 mount

## Closed in code before device QA

| P0 | Status |
| --- | --- |
| region vs region+district home-feed key | CLOSED (region-only SSOT) |
| store detail menus tap prewarm (food rail) | CLOSED (`StoresHomeFoodCard` force prewarm) |
| Capacitor resume visibility refetch | CLOSED (`enableVisibilityRefetch: true` + silent) |
| search / order-note &lt;16px inputs | CLOSED (16px) |
| Owner shell remount / products Suspense pulse | CLOSED (Phase 5) |

## Verdict

Keep **`DELIVERY RUNTIME PARTIAL`** until §G Xiaomi+Samsung cells are filled from APK-at-HEAD runs.
