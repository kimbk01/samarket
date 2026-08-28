/**
 * Admin display of instance certificate validity (not sales window).
 * Never show valid_from alone as if it were the expiry end.
 */
export function formatGiftAdminValidity(
  validFrom: string | null | undefined,
  validUntil: string | null | undefined
): string {
  const from = typeof validFrom === "string" ? validFrom.trim().slice(0, 10) : "";
  const until = typeof validUntil === "string" ? validUntil.trim().slice(0, 10) : "";
  if (!from && !until) return "—";
  if (from && until) return `${from} → ${until}`;
  if (until) return `→ ${until}`;
  // valid_from with null until = NO_EXPIRY (issue date is not an end date)
  return "—";
}

export function formatGiftAdminValidityLabel(args: {
  validFrom: string | null | undefined;
  validUntil: string | null | undefined;
  noExpiryLabel: string;
}): string {
  const until =
    typeof args.validUntil === "string" ? args.validUntil.trim().slice(0, 10) : "";
  if (!until) return args.noExpiryLabel;
  return formatGiftAdminValidity(args.validFrom, args.validUntil);
}
