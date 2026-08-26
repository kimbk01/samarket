/**
 * Paid Gift Certificate HARD LOCK — product contract anchors (G0–G2).
 * Gate: `npm run verify:gift-certificate-hard-lock`
 * Doc: `docs/dibay-gift-certificate-hard-lock.md`
 */

import {
  GIFT_IS_NOT_COUPON,
  GIFT_INSTANCE_EXPIRY_DISABLED,
  giftContractKeepsCheckoutDpointFalse,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";
import {
  GIFT_MIGRATION_ID,
  GIFT_RPCS,
  GIFT_TABLES,
} from "@/lib/gift-certificate/gift-certificate-schema";
import { STORE_ORDER_FINANCIAL_CONTRACT } from "@/lib/stores/store-order-financial-contract";

export const GIFT_CERTIFICATE_HARD_LOCK = {
  domain: "paid_gift_certificate",
  giftIsNotCoupon: GIFT_IS_NOT_COUPON,
  instanceExpiryDisabled: GIFT_INSTANCE_EXPIRY_DISABLED,
  customerDPointSupported: STORE_ORDER_FINANCIAL_CONTRACT.customerDPointSupported,
  deliveryCheckoutKeepsDpointFalse: giftContractKeepsCheckoutDpointFalse(),
  migrationId: GIFT_MIGRATION_ID,
  tables: GIFT_TABLES,
  rpcs: GIFT_RPCS,
} as const;

export function assertGiftCertificateHardLockAnchors(): boolean {
  return (
    GIFT_CERTIFICATE_HARD_LOCK.giftIsNotCoupon === true &&
    GIFT_CERTIFICATE_HARD_LOCK.instanceExpiryDisabled === true &&
    GIFT_CERTIFICATE_HARD_LOCK.customerDPointSupported === false &&
    GIFT_CERTIFICATE_HARD_LOCK.deliveryCheckoutKeepsDpointFalse === true
  );
}
