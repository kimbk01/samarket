# LEGACY-OPERATION-AUDIT

**Date:** 2026-09-06  
**Purpose:** Recover real Admin work intent from prior Ads ops — not clone legacy UI.

## What operators historically managed

| Concern | Legacy / prior surface | Work purpose |
|---|---|---|
| Trade post boost | `post_ads` / `trade_post_ads` / promoted-items | Approve paid pin on trade lists |
| Community promote | community promotions / point_promotion_orders | Approve or auto Point pin |
| Image mid-feed banner | Feed ads (`feed_ad_requests` → campaigns) | Review creative + Point HOLD/CAPTURE |
| Delivery store card | store paid ads / insertions | Review store sponsored placements |
| Delivery banner | store banner ads | Creative studio + schedule |
| Platform popup | notification-campaign-like popup → platform-popup | Creative + surface + schedule |
| Ended inventory | promoted-items / ended campaigns | Look up past paid exposure |

## How they worked (intent to restore)

1. **See incoming applications** with store/member, product, placement, money, period  
2. **Open one review workspace** — approve / request change / reject with reason  
3. **Upload/replace creative** with size guidance and visible save result  
4. **Choose placement** in human language (not raw inventory keys)  
5. **Manage period** — schedule, extend with money semantics  
6. **See ended ads** in searchable history  
7. **Customer status** moves with the same lifecycle language  

## What current Production screenshots show as FAIL vs that intent

| Intent | Current FAIL evidence |
|---|---|
| One flow per ad | Control plane cards + Delivery list + separate Feed/Popup menus |
| Visible Approve | `bg-sam-brand` (undefined token) white text on pink box |
| Save feedback | Popup/Banner save → silent `load()` only |
| Product language | Sidebar 「피드 광고」 vs customer 「배너 광고」 |
| Test noise | `currency-prod-e2e` / `PROD_*` dominate 「지금 처리할 광고」 |
| Product ≠ placement | Placement table mixes SSOT/geometry jargon |

## Do NOT restore

- Unified ads table  
- Member DETAIL → `trade-ads/apply` (CUT F)  
- Partner as AdProduct  
- Hollow redirect of `/admin/community/promotions`  

## Evidence used for recovery

- Customer inventory (code): trade/community promote, feed banner, delivery store+banner, popup, partner membership  
- Production screenshots 2026-09-06 Admin Ads surfaces  
- Pre-MERGE `AdminAdApplicationsPage` ARO-IA markers (restored in `c1ded394e`)
