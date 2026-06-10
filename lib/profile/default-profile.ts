function normalizeHexSeed(value: string): string {
  return value.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

/**
 * Public profile id shown in UI. Never expose the raw auth UUID.
 */
export function buildDefaultDibayPublicId(userId: string): string {
  const hex = normalizeHexSeed(userId);
  const seed = hex.length >= 6 ? hex.slice(0, 6) : "";
  if (seed) return `dibay_${seed}`;
  return `dibay_${Math.random().toString(16).slice(2, 8).toUpperCase().padEnd(6, "0")}`;
}
