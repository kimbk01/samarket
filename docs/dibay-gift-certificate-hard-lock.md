# DIBAY Paid Gift Certificate HARD LOCK

**Status:** G0 DESIGN_LOCKED · G1 contract · G2 migration · G3–G12 application layer  
**Companion module:** `lib/gift-certificate/gift-certificate-hard-lock.ts`  
**Gate:** `npm run verify:gift-certificate-hard-lock`

Paid Gift Certificate is a **store-scoped stored-value payment asset**. It is **not** a Free Coupon discount entitlement.

---

## Authority chain

| Layer | Owner |
|---|---|
| G0 product design | DESIGN_LOCKED (Gift ≠ Coupon · redemption-only revenue · D-Point mall rail) |
| G1 | `lib/gift-certificate/gift-certificate-domain-contract.ts` |
| G2 | `supabase/migrations/20261127120000_gift_certificate_domain_g2.sql` |
| G3+ | `lib/gift-certificate/*` · `/api/me/gift-certificates/*` · admin/owner routes |

---

## Non-negotiables

1. **GIFT_IS_NOT_COUPON** — never merge with `store-coupon-ssot` / coupon tables.
2. **No instance value expiry** — migration must not add `expires_at` on `gift_certificate_instances`.
3. **Delivery checkout D-Point remains false** — `STORE_ORDER_FINANCIAL_CONTRACT.customerDPointSupported === false`.
4. **Money RPCs** — `SECURITY DEFINER` + `service_role` EXECUTE only (`GIFT_RPCS`).
5. **Owner revenue at sale = 0** — recognition on redemption only.
6. **G7_PARTIAL_ATOMICITY** — order create then gift redeem is intentionally partial until a later atomic cut.

---

## Forbidden

- Treating Gift as Coupon campaign / `discount_amount`
- Issuing sellable products from Owner without Admin create/approve
- Using `stores.point_balance` / `store_settlements` / `profiles.points` as Gift Revenue or Store Cash
- Deleting FULLY_REDEEMED instance history rows

---

## Verify

```bash
npm run verify:gift-certificate-hard-lock
```
