/**
 * DIBAY Global Back Navigation SSOT — Delivery CUT 1/2 + 2B HARD LOCK
 *
 * DO NOT:
 * - Invent browse origin from DB store category / businessType
 * - Clear HOME or SEARCH entry as "non-browse"
 * - Use partial primary+sub reconstruction when full originHref exists
 * - Let StoreDetailBackLink / page chrome invent destination policy
 * - Feature-flag dual authority (old + new) on Delivery migrated routes
 * - Fake history / setTimeout corrective push / popstate rewrite
 * - Per-card double router.push(store)+router.push(product)
 *
 * Authority:
 * - Product entry owner: navigateToDeliveryStoreProduct (CUT 2B)
 * - Cart entry owner: navigateToDeliveryStoreCart (CUT 3)
 * - Context write: commitDeliveryStoreNavigationEntry / commitDeliveryCartNavigationEntry / commitOrderCommittedNavigationEntry
 * - Stage-2 product commit: DeliveryStoreProductChildCommit
 * - Back resolve: resolveDibayBackTarget
 * - Back execute (Delivery header): runDibayBackResolution via StoreDetailBackLink / cart thin adapter
 * - Scroll restore: delivery-list-scroll-restore + restoreKey
 *
 * Gate:
 * - npx vitest run lib/navigation/__tests__/dibay-back-ssot-cut-1-2.test.ts
 * - npx vitest run lib/navigation/__tests__/dibay-back-ssot-cut-2b.test.ts
 * - npx vitest run lib/navigation/__tests__/dibay-back-ssot-cut-3.test.ts
 */

export const DIBAY_BACK_SSOT_CUT_1_2_LOCK = "2026-08-29-cut-1-2-delivery" as const;
export const DIBAY_BACK_SSOT_CUT_2B_LOCK = "2026-08-29-cut-2b-semantic-history" as const;
export const DIBAY_BACK_SSOT_CUT_3_LOCK = "2026-08-29-cut-3-transaction-back" as const;
