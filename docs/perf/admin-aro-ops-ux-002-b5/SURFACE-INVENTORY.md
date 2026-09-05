# ARO-OPS-UX-002-B5 — Ads surface inventory

| ROUTE | DOMAIN | BILLING | ROLE |
|---|---|---|---|
| `/admin/delivery-ads` (+ B5 Control Plane) | delivery+compose | Cash | **Canonical root** |
| `/admin/delivery-ads/[id]` | delivery | Cash | Execution detail |
| `/admin/delivery-ads/inventory#placement-map` | multi | n/a | Placement Map |
| `/admin/feed-ads` | feed | Point | Feed ops |
| `/admin/ad-applications?domain=feed` | feed | Point | Feed applications |
| `/admin/platform-popup` | popup | Cash | Popup hub |
| `/admin/ad-applications?domain=trade` | trade promote | Point | ≠ AdProduct |
| `/admin/delivery-ads/partner` | partner | n/a | ≠ AdProduct |

NEW DB / SSOT / mutation: NONE  
Read model: `lib/admin/ads-control-plane/load-ads-control-plane.ts`
