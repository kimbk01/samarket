import { timingSafeEqual } from "crypto";

/** 헤더 `x-external-delivery-webhook-secret` — env EXTERNAL_DELIVERY_WEBHOOK_SECRET 과 타이밍 안전 비교 */
export function verifyExternalDeliveryWebhookSecret(headerValue: string | null): boolean {
  const expected = process.env.EXTERNAL_DELIVERY_WEBHOOK_SECRET?.trim();
  if (!expected || headerValue == null) return false;
  const a = Buffer.from(headerValue.trim(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
