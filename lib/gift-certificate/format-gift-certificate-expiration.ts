/**
 * Customer-facing gift expiry display — never invent a no-expiry label.
 * Instance: valid_until null ≡ NO_EXPIRY at issue (migration invariant).
 * Product mall: use expiry_policy explicitly.
 */

import type { GiftExpiryPolicy } from "@/lib/gift-certificate/gift-certificate-domain-contract";
import { normalizeGiftExpiryPolicy } from "@/lib/gift-certificate/gift-certificate-domain-contract";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

/** 「YYYY.MM.DD까지」 — 키 `gift_valid_until` (언어를 넘기지 않으면 화면 언어) */
export function formatGiftValidUntilLabel(
  dateYmd: string,
  language: AppLanguageCode = getRuntimeAppLanguage()
): string {
  return translate(language, "gift_valid_until", { date: dateYmd.replace(/-/g, ".") });
}

export function formatGiftInstanceExpirationDisplay(args: {
  validUntil: string | null | undefined;
  noExpiryLabel: string;
  /** 화면 `t` 로 만든 라벨 — 없으면 화면 언어 `gift_valid_until` */
  validUntilLabel?: (dateDots: string) => string;
}): string {
  const until =
    typeof args.validUntil === "string" ? args.validUntil.trim().slice(0, 10) : "";
  if (!until) return args.noExpiryLabel;
  return args.validUntilLabel ? args.validUntilLabel(until.replace(/-/g, ".")) : formatGiftValidUntilLabel(until);
}

export function formatGiftProductExpirationDisplay(args: {
  expiryPolicy: string | null | undefined;
  validityDays: number | null | undefined;
  fixedValidUntil: string | null | undefined;
  noExpiryLabel: string;
  daysAfterIssueLabel: (days: number) => string;
  /** 화면 `t` 로 만든 라벨 — 없으면 화면 언어 `gift_valid_until` */
  validUntilLabel?: (dateDots: string) => string;
}): string | null {
  const policy = normalizeGiftExpiryPolicy(args.expiryPolicy) as GiftExpiryPolicy | null;
  if (!policy) return null;
  if (policy === "NO_EXPIRY") return args.noExpiryLabel;
  if (policy === "FIXED_DATE") {
    const until =
      typeof args.fixedValidUntil === "string" ? args.fixedValidUntil.trim().slice(0, 10) : "";
    if (!until) return null;
    return args.validUntilLabel ? args.validUntilLabel(until.replace(/-/g, ".")) : formatGiftValidUntilLabel(until);
  }
  const days = Math.trunc(Number(args.validityDays));
  if (!Number.isFinite(days) || days <= 0) return null;
  return args.daysAfterIssueLabel(days);
}
