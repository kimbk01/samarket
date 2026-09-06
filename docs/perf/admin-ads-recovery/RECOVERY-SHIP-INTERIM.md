# DIBAY ADS / EXPOSURE — FROM-SCRATCH RECOVERY FINAL (interim ship)

**HEAD BEFORE:** `c1ded394e`  
**THIS SHA:** (pending commit)  
**AUTH:** Production Admin session NOT used this agent turn (screenshot-driven FAIL already proven)

## Binary (honest)

```
ADS OPERATOR READY = FAIL
CUSTOMER ADS READY = PARTIAL
DUPLICATE AUTHORITY = still >0 (trade-post-ads leaf outside Ads; dual Delivery stack)
ADS SSOT = NOT LOCKED
REAL-WORLD ADS ADMIN = NOT READY
```

Fresh Production screenshots invalidated “product gaps closed / only P1–P24 left”.

## Shipped this recovery slice

| Change | Evidence |
|---|---|
| Customer inventory + legacy audit docs | `docs/perf/admin-ads-recovery/*` |
| FEED ADS = Point **배너 광고** (rename menu) | i18n + menu groups |
| Menu axes: 관제 / 신청 / 집행 / 지면 / 상품 / 이력 | `admin-menu.ts` |
| Approve CTA contrast | `bg-sam-primary text-sam-on-primary`; review box no pink wash |
| Popup save SUCCESS notice after persist+reload | `data-admin-popup-save-notice` |
| Banner studio save SUCCESS notice | `data-admin-banner-save-notice` |
| Ops vs test data filter (default ops) | Control plane select |
| PROD_ / [테스트] fixture detection | `isAdsTestFixtureLabel` |

## FEED ADS

```
ACTUAL MEANING: Independent Point image-banner product
CUSTOMER PRODUCT: 배너 광고
PLACEMENT: TRADE_* / COMMUNITY_*
PAYMENT: Point HOLD/CAPTURE
FINAL UI NAME: 배너 광고 (신청/집행/상품)
MERGED/KEPT/REMOVED: KEPT as product; 「피드 광고」 primary label REMOVED
```

## DELIVERY

| | |
|---|---|
| STORE PROMOTION | P4 Cash product |
| TOP EXPOSURE | Not separate SKU — P4 placement language |
| BANNER | P5 Cash product |
| PARTNER | Membership discount ≠ AdProduct |

## REMAINING P0/P1 (NOT done this slice)

- Full review workspace redesign (still dual CTA strips)
- Dual Control Plane + Delivery hub stack on `/admin/delivery-ads`
- Popup create list/reload proof on Production
- Placement human selector end-to-end
- Full history search surface
- Authenticated Production visual QA A–Z

## Tests

`ads-from-scratch-recovery` + B7 menu + ads-operator occupancy: PASS
