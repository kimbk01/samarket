/**
 * Customer-facing gift expiry display — never invent "만료 없음".
 * Instance: valid_until null ≡ NO_EXPIRY at issue (migration invariant).
 * Product mall: use expiry_policy explicitly.
 */

import type { GiftExpiryPolicy } from "@/lib/gift-certificate/gift-certificate-domain-contract";
import { normalizeGiftExpiryPolicy } from "@/lib/gift-certificate/gift-certificate-domain-contract";

export function formatGiftInstanceExpirationDisplay(args: {
  validUntil: string | null | undefined;
  noExpiryLabel: string;
}): string {
  const until =
    typeof args.validUntil === "string" ? args.validUntil.trim().slice(0, 10) : "";
  if (!until) return args.noExpiryLabel;
  return `${until.replace(/-/g, ".")}까지`;
}

export function formatGiftProductExpirationDisplay(args: {
  expiryPolicy: string | null | undefined;
  validityDays: number | null | undefined;
  fixedValidUntil: string | null | undefined;
  noExpiryLabel: string;
  daysAfterIssueLabel: (days: number) => string;
}): string | null {
  const policy = normalizeGiftExpiryPolicy(args.expiryPolicy) as GiftExpiryPolicy | null;
  if (!policy) return null;
  if (policy === "NO_EXPIRY") return args.noExpiryLabel;
  if (policy === "FIXED_DATE") {
    const until =
      typeof args.fixedValidUntil === "string" ? args.fixedValidUntil.trim().slice(0, 10) : "";
    if (!until) return null;
    return `${until.replace(/-/g, ".")}까지`;
  }
  const days = Math.trunc(Number(args.validityDays));
  if (!Number.isFinite(days) || days <= 0) return null;
  return args.daysAfterIssueLabel(days);
}
