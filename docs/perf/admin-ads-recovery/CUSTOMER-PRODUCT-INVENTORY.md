# CUSTOMER-PRODUCT-INVENTORY

**Source:** customer/owner/member code paths — not Admin menu.  
**HEAD baseline for recovery start:** `c1ded394e`

## Products (canonical)

| ID | CUSTOMER NAME | WHO | TARGET | DOMAIN | CURRENCY | DURATION | APPLICATION | PAYMENT | PLACEMENT | RENDERER | ADMIN |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P1 | 더 알리기 (7/14일) | member | trade post | trade | Point | 7/14d | `point_promotion_orders` | HOLD→CAPTURE | trade list pin ≤3 | feed-promotion-projection | ad-applications?domain=trade |
| P2 | 게시물 홍보 (3/7일 상위) | member | community post | community | Point | 3/7d | `point_promotion_orders` | immediate spend | community top pin | community-paid-exposure-feed | community/promotions |
| P3 | 배너 광고 | member | image banner | trade/community | Point | 3/7d | `feed_ad_requests` | HOLD→CAPTURE | TRADE_*/COMMUNITY_* | FeedAdBannerCarousel | ad-applications?domain=feed + feed-ads |
| P4 | 매장 홍보 | owner | store card | delivery | Cash | package 7/15/30 | `store_paid_ad_campaigns` | Cash | HOME/CATEGORY FEED | stores discovery | delivery-ads |
| P5 | 배너 광고 (배달) | owner | image banner | delivery | Cash | package | `store_banner_ad_campaigns` | Cash | HOME_HERO (sellable) | DeliveryAdBanner | delivery-ads + studio |
| P6 | 글로벌 팝업 광고 | owner | popup | platform | Cash | package window | `platform_popup_owner_requests` | Cash | popup surfaces | GlobalPopupHost | platform-popup |
| P7 | Partner 멤버십 | owner | membership | delivery | Cash | ~30d | `delivery_ad_partner_memberships` | Cash | **no ad slot** — discount only | n/a | delivery-ads/partner |

## FEED ADS (disassembly)

```
FEED ADS IS: Independent Point-paid image banner product (mid-feed slots)
CUSTOMER PRODUCT: 배너 광고 (NOT "피드 광고")
TARGET: banner creative (1–3 images)
PLACEMENT: TRADE_HOME / TRADE_CATEGORY / COMMUNITY_HOME / COMMUNITY_TOPIC
PAYMENT: Point HOLD/CAPTURE
ADMIN REVIEW: feed_ad_requests PATCH
RENDERER: FeedAdBannerCarousel via /api/feed-ads/active
MERGED WITH: none (≠ 더 알리기 / ≠ Delivery banner)
PRIMARY UI NAME: 배너 광고 (거래·커뮤니티)
ADMIN MENU: rename away from 「피드 광고」; keep separate leaf under 신청/집행
```

## DELIVERY relation

| Name | Verdict |
|---|---|
| 매장 홍보 | Product P4 |
| 매장 「상위 노출」 as third SKU | **Not a separate product** — wording for P4 placement |
| 배너 광고 | Product P5 |
| Partner | **Not AdProduct** — membership discount (P7) |

## PRODUCT ≠ RENDER SURFACE

Placement map shows where inventory lives. Selling names stay P1–P6 only.
