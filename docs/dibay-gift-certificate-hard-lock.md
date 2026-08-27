# DIBAY Paid Gift Certificate HARD LOCK

**Status:** G0 DESIGN_LOCKED · G1 contract · G2 migration · Financial Integrity Root Fix (G7/G9/G10)  
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
| G6 messenger type | `supabase/migrations/20261127130000_gift_certificate_messenger_message_type.sql` |
| G7/G10 checkout+refund atomic | `supabase/migrations/20261127140000_gift_certificate_checkout_refund_atomic.sql` |
| G3+ | `lib/gift-certificate/*` · `/api/me/gift-certificates/*` · admin/owner routes |

---

## Non-negotiables

1. **GIFT_IS_NOT_COUPON** — never merge with `store-coupon-ssot` / coupon tables.
2. **No instance value expiry** — migration must not add `expires_at` on `gift_certificate_instances`.
3. **Delivery checkout D-Point remains false** — `STORE_ORDER_FINANCIAL_CONTRACT.customerDPointSupported === false`.
4. **Money RPCs** — `SECURITY DEFINER` + `service_role` EXECUTE only (`GIFT_RPCS`).
5. **Owner revenue at sale = 0** — recognition on redemption only.
6. **G7 ATOMIC** — Gift redemption is inside `create_store_order_atomic` (same TX as order). Post-order redeem is **FORBIDDEN**.
7. **G10 ATOMIC** — Refund terminal state requires `gift_certificate_refund_order_atomic` (gift reverse + refunded in one TX). Best-effort reverse after refund is **FORBIDDEN**.
8. **Store Cash** — `store_cash_accounts.balance >= 0` DB CHECK.
9. **External cash-out (O3-B)** — from **recognized available Gift Revenue** only (`gift_certificate_cash_out_*`). Not Business Credit / Point / pending revenue / Store Cash. Admin **mark-paid** after real transfer (`payout_method` + `payout_reference`). Do not use `store_settlements` as gift balance authority. Recognition rules unchanged.

---

## Forbidden

- Treating Gift as Coupon campaign / `discount_amount`
- Issuing sellable products from Owner without Admin create/approve
- Using `stores.point_balance` / `store_settlements` / `profiles.points` as Gift Revenue or Store Cash
- Deleting FULLY_REDEEMED instance history rows
- `G7_PARTIAL_ATOMICITY` / order SUCCESS + gift redeem FAIL
- Conversion `APPROVED` without Store Cash credit
- Order `refunded` with gift reverse failed

---

## Verify

```bash
npm run verify:gift-certificate-hard-lock
```
