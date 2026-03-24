import { timingSafeEqual } from "crypto";

/** 헤더 `x-store-payment-webhook-secret` 값이 env 와 일치하는지 (타이밍 안전) */
export function verifyStoreOrderPaymentWebhookSecret(headerValue: string | null): boolean {
  const expected = process.env.STORE_ORDER_PAYMENT_WEBHOOK_SECRET?.trim();
  if (!expected || headerValue == null) return false;
  const a = Buffer.from(headerValue.trim(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
