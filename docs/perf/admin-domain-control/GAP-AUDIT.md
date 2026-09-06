# GAP AUDIT — current Admin vs Domain Control Matrix

Generated against contracts in DOMAIN-CONTROL-MATRIX.md. Presentation gaps only unless noted.

## 광고 / 노출

| Gap | Severity | Notes |
|---|---|---|
| MISSING_CONTROL — period/remaining on action cards | P0 | Loader often null amount/period |
| RAW_DATA_UI — hardcoded payment≠approval eligibility | P0 | load-ads-control-plane.ts |
| WRONG_CTA — generic 검토하기 without state CTAs on list | P1 | Detail has CTAs; queue weak |
| MISSING_HISTORY on plane | P1 | Detail has audits |
| NO_FILTER date/domain on plane | P1 | Hub filters exist below |
| MISSING_CONTROL — overlap/collision UI | P2 | Eligibility authority exists; no surface |
| DUPLICATE_UI — Exposure CP + Delivery hub | P1 | Both show work |

## 재무

| Gap | Severity | Notes |
|---|---|---|
| WRONG_PRIORITY — Coin→Cash looks like approval card | P0 | Must be history-only |
| MISSING_LIST — daily settlement date list | P0 | Settlements page exists but CP cards flatten |
| MISSING_CTA clarity — settlement vs charge | P0 | Partially fixed labels |
| NO_DETAIL money before/after on CP | P1 | Statement has more |

## 커뮤니티 / 채팅

| Gap | Severity | Notes |
|---|---|---|
| DUPLICATE_UI reports | Fixed in shell | Deduped |
| RAW frequency taxonomy | Fixed | Hidden |
| UUID primary recent | Mitigated | Human title fallback |

## 배달 / 거래 / 지원 / 알림 / 시스템 / 운영

| Gap | Severity | Notes |
|---|---|---|
| WRONG_PRIORITY config vs live ops | P1 | Domain shell structure |
| MISSING_CONTROL deep scenarios | P1–P2 | After Ads/Finance |

## Implementation focus this pass

1. Fix Ads loader + card contract fields (why/payment/period/exposure)
2. Enrich action queue with store name + schedule + funding
3. Finance section titles separating approval vs history
4. Ads detail remaining period + payment first-class
5. Then remaining domains shell/queues
