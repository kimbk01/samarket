# Support FAB Visibility — Owner Lock

Support FAB is **not** a global customer-center button. Each screen must explicitly publish `supportContext.enabled === true` via `SupportContextProvider` (or owner bridge shells). The global `SupportFabHost` in `ConditionalAppShell` only renders when that context is enabled.

## SSOT

| Layer | Module |
|-------|--------|
| Context types | `lib/support/support-context.ts` |
| Entry | `lib/support/open-support-center.ts` → `openSupportCenter(context)` |
| Page opt-in | `components/support/SupportContextProvider.tsx` |
| Global host | `components/support/SupportFabHost.tsx` |
| Route registry (CUT 1) | `lib/support/support-fab-route-registry.ts` |

## Non-negotiable rules

1. **`enabled !== true` → SupportFabHost renders nothing** (unmount, not CSS hide).
2. **No `resolveSupportContextFromPathname()`** or prefix tables (`/mypage/* → ON`).
3. **Role alone does not enable FAB** — store owner on `/mypage` stays OFF unless the page sets context.
4. **`openSupportCenter(ctx)`** is the only FAB entry; do not open `/mypage/inquiries` directly from the FAB.

## MEMBER — enabled candidates (CUT 1)

| Route | category | sourceSurface |
|-------|----------|---------------|
| `/mypage/points/charge` | `PAYMENT_RECHARGE` | `mypage_points_charge` |
| `/mypage/gift-certificates/[instanceId]` | `GIFT_CERTIFICATE` | `mypage_gift_instance` |
| `/mypage/store-orders/[orderId]` | `ORDER` | `mypage_store_order_detail` (state-gated) |
| `/mypage/ads/feed-request` | `AD` | `mypage_feed_ad_request` |
| `/mypage/coupons` | `COUPON` | `mypage_coupons` |

**Explicit OFF:** `/`, `/market`, `/stores/*` consumer browse, `/mypage`, `/mypage/settings*`, `/notifications`, messenger/trade/order-chat paths, `/mypage/customer-center/*`.

## OWNER — enabled candidates (CUT 1)

| Route | category | sourceSurface |
|-------|----------|---------------|
| `/stores/owner/apply` | `STORE_APPROVAL` | `owner_store_apply` |
| `/stores/owner/finance` | `CASH_COIN` | `owner_finance` |
| `/stores/owner/settlements` | `SETTLEMENT` | `owner_settlements` |
| `/stores/owner/ads/[campaignId]` | `DELIVERY_AD` | `owner_delivery_ad_detail` |
| `/stores/owner/ads/new/*` | `DELIVERY_AD` | `owner_delivery_ad_compose` |
| `/stores/owner/products/[productId]/edit` | `PRODUCT_MENU` | `owner_product_edit` |
| `/stores/owner/coupons` | `COUPON` | `owner_coupons` |
| `/stores/owner/gift-certificates` | `GIFT_CERTIFICATE` | `owner_gift_certificates` |
| `/stores/owner/basic-info` | `BANK_ACCOUNT` | `owner_basic_info` |
| `/stores/owner/ops-status` | `STORE` | `owner_ops_status` |

**Explicit OFF:** `/stores/owner` hub, orders list, products list, inquiries, `customer-care/*`, order-chat paths.

## Adding a new candidate screen

1. Wrap page content with `SupportContextProvider` or `OwnerSupportContextBridge` / `OwnerStoreSupportShell`.
2. Add route file to `SUPPORT_FAB_ENABLED_ROUTE_FILES` (or view file to `SUPPORT_FAB_ENABLED_VIEW_FILES`).
3. Run `npm run verify:support-fab-visibility-contract`.

## Verification

```bash
npm run verify:support-fab-visibility-contract
```

Contract: `lib/support/__tests__/support-fab-visibility-contract.test.ts`
