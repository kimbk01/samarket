# DIBAY Paid Gift Certificate HARD LOCK

**Status:** G0 DESIGN_LOCKED · G1 contract · G2 migration · Financial Integrity Root Fix (G7/G9/G10)  
**Companion module:** `lib/gift-certificate/gift-certificate-hard-lock.ts`  
**Gate:** `npm run verify:gift-certificate-hard-lock`

Paid Gift Certificate is a **store-scoped stored-value payment asset**. It is **not** a Free Coupon discount entitlement.

## Three-currency reconstruction amendment (2026-09-02)

Gift certificates are products, not a fourth currency. Recognized gift revenue is accounting evidence and feeds the canonical **Coin** rail; it is never a separate owner wallet, balance card, conversion product, cash-out product, CTA, or navigation item.

`store_cash_accounts`, `store_cash_ledger`, Gift Store Cash, legacy conversion/cash-out requests, and their migrations remain archive-only historical evidence. They authorize no active reader/writer except bounded historical reconciliation or reversal, and no user/Admin mutation surface. This amendment supersedes conflicting financial-product wording below while preserving historical integrity evidence.

---

## Authority chain

| Layer | Owner |
|---|---|
| G0 product design | DESIGN_LOCKED (Gift ≠ Coupon · redemption-only revenue · Point mall rail) |
| G1 | `lib/gift-certificate/gift-certificate-domain-contract.ts` |
| G2 | `supabase/migrations/20261127120000_gift_certificate_domain_g2.sql` |
| G6 messenger type | `supabase/migrations/20261127130000_gift_certificate_messenger_message_type.sql` |
| G7/G10 checkout+refund atomic | `supabase/migrations/20261127140000_gift_certificate_checkout_refund_atomic.sql` |
| G3+ | `lib/gift-certificate/*` · `/api/me/gift-certificates/*` · admin/owner routes |

---

## Non-negotiables

1. **GIFT_IS_NOT_COUPON** — never merge with `store-coupon-ssot` / coupon tables.
2. **No ad-hoc `expires_at` column on instances** — migration must not add bare `expires_at`.  
   **SUPERSEDED (FINAL Design Lock / Admin Master Plan):** certificate validity via `expiry_policy` + instance `valid_from`/`valid_until` is **ON** (`GIFT_INSTANCE_EXPIRY_DISABLED = false`). Historical “no value expiry” PASS claims below remain historical evidence only.
3. **Delivery checkout Point remains false** — historical implementation field `customerDPointSupported === false`.
4. **Money RPCs** — `SECURITY DEFINER` + `service_role` EXECUTE only (`GIFT_RPCS`).
5. **Owner revenue at sale = 0** — recognition on redemption only.
6. **G7 ATOMIC** — Gift redemption is inside `create_store_order_atomic` (same TX as order). Post-order redeem is **FORBIDDEN**.
7. **G10 ATOMIC** — Refund terminal state requires `gift_certificate_refund_order_atomic` (gift reverse + refunded in one TX). Best-effort reverse after refund is **FORBIDDEN**.
8. **Legacy Store Cash** — its non-negative DB constraint and ledger are retained as historical integrity evidence only; no active product authority.
9. **Legacy external cash-out (O3-B)** — archived. New gift earnings use canonical Coin inflow and Coin withdrawal. Historical payout rows/references remain immutable accounting evidence; `store_settlements` is never a gift balance authority.

---

## Forbidden

- Treating Gift as Coupon campaign / `discount_amount`
- Issuing sellable products from Owner without Admin create/approve
- Using `stores.point_balance` / `store_settlements` / `profiles.points` as a gift wallet
- Deleting FULLY_REDEEMED instance history rows
- `G7_PARTIAL_ATOMICITY` / order SUCCESS + gift redeem FAIL
- New gift-to-legacy-wallet conversion or cash-out writes
- Order `refunded` with gift reverse failed

---

## Verify

```bash
npm run verify:gift-certificate-hard-lock
```
