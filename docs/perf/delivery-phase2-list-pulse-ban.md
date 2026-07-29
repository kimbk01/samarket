# Delivery Phase 2 — List pulse ban (cache-hit surfaces)

## 원인 1개

Phase 0 Production warm 재진입에서 **첫 카드 0ms**(캐시 페인트)인데도 `.animate-pulse` max **35–41** 이 관측됨.

원인: 피드 캐시 페인트 후에도 **메뉴/카테고리 pending 크롬이 `animate-pulse` 스켈레톤**으로 남아 리스트가 “다시 로딩”처럼 보임.

- `StoresHomeFoodCard` — featured hydrate 전 이미지 슬롯 pulse
- `StoresHomeCategoriesSkeleton` — taxonomy pending pulse
- `StoreBrowseFeaturedMenuSkeleton` — browse 메뉴 밴드 pulse

## 수정

pulse 제거 → **고정 크기 muted surface** (`data-*-pending`). 레이아웃 높이 유지 · 카드 제거→재삽입 없음.

## Verify

`verify:stores-home-hub-contract` — food/category/browse pending 에 `animate-pulse` 금지.

## 재측정

| 항목 | Phase 0 (prod) | Phase 2 후 |
| --- | --- | --- |
| warm first card | 0 / 0 / 0 | 코드상 불변(캐시 paint) |
| warm `.animate-pulse` on home list chrome | 35–41 | **소스 0** (food/category) · **Production 재실측은 deploy 후** |

로컬 Production URL은 아직 구번들 → 기기/Prod 런타임 재실측은 Phase 배포 후.

## H. 판정

```text
DELIVERY CODE PASS (Phase 2 scope)
RUNTIME UNVERIFIED until Production/APK match this HEAD
```
