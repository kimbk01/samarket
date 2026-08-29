/**
 * DIBAY Global Back Navigation SSOT — Delivery CUT 1/2 HARD LOCK
 *
 * DO NOT:
 * - Invent browse origin from DB store category / businessType
 * - Clear HOME or SEARCH entry as "non-browse"
 * - Use partial primary+sub reconstruction when full originHref exists
 * - Let StoreDetailBackLink / page chrome invent destination policy
 * - Feature-flag dual authority (old + new) on Delivery migrated routes
 *
 * Authority:
 * - Context write: commitDeliveryStoreNavigationEntry
 * - Back resolve: resolveDibayBackTarget
 * - Back execute (Delivery header): runDibayBackResolution via StoreDetailBackLink
 * - Scroll restore: delivery-list-scroll-restore + restoreKey
 *
 * Gate: npx vitest run lib/navigation/__tests__/dibay-back-ssot-cut-1-2.test.ts
 */

export const DIBAY_BACK_SSOT_CUT_1_2_LOCK = "2026-08-29-cut-1-2-delivery" as const;
