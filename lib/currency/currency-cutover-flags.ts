/**
 * DIBAY Currency cutover gates — CUT E AST-002 retire, etc.
 * Production: set env on Vercel when Cash sale-fee writer is live.
 */

export const CURRENCY_PRODUCTION_CUTOVER_FLAGS = [
  "DIBAY_CURRENCY_SALE_RECOGNITION_LIVE",
  "DIBAY_CURRENCY_AST002_RETIRED",
] as const;

/** CUT E — retire AST-002 accept fee when Cash sale-fee path is active. */
export function isAst002AcceptFeeRetired(): boolean {
  const v = process.env.DIBAY_CURRENCY_AST002_RETIRED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** CUT D+ — Coin gross + Cash sale fee recognition on order completed. */
export function isCurrencySaleRecognitionLive(): boolean {
  const v = process.env.DIBAY_CURRENCY_SALE_RECOGNITION_LIVE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
