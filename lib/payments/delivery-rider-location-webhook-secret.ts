import { timingSafeEqual } from "crypto";

/** 헤더 `x-delivery-rider-location-webhook-secret` — env DELIVERY_RIDER_LOCATION_WEBHOOK_SECRET */
export function verifyDeliveryRiderLocationWebhookSecret(headerValue: string | null): boolean {
  const expected = process.env.DELIVERY_RIDER_LOCATION_WEBHOOK_SECRET?.trim();
  if (!expected || headerValue == null) return false;
  const a = Buffer.from(headerValue.trim(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

