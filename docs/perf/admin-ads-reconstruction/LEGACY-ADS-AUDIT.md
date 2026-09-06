# LEGACY-ADS-AUDIT

## Cluster: ads-legacy

| Leaf | Mutates? | Disposition |
|---|---|---|
| promoted-items | No (GET) | READ-ONLY HISTORY — rename 이전 Point 노출 기록 |
| ad-products | Yes PATCH | FREEZE UI writes + REMOVE from Ads ops; catalogs live in feed-ad-products / trade-ad-policies / delivery commercial |
| post-ads | Yes PATCH | FREEZE from Ads nav; historical only unless trade-post-ads still live SKU |
| member-benefits | Yes | REMOVE from Ads (not ad commerce) |
| exposure-policies | Yes | REMOVE from Ads |
| home-feed | Yes | REMOVE from Ads |
| personalized-feed | Yes | REMOVE from Ads |
| banners | Yes | REMOVE from Ads nav — CMS ≠ Delivery/Popup |

Parent label: **이전 광고 기록** only for true read-only leaves. Writable leaves must not remain operable under that label (P0 if they do).

## Already dead writers

- store-insertions → redirect delivery-ads  
- store-banner-ads → redirect / API 410  

## KEEP CONCEPT from legacy

- Entitlement list view for past Point promotes  
- CMS banners as App content (not Ads ops)  
- Exposure/home-feed as specialist config outside Ads commerce
