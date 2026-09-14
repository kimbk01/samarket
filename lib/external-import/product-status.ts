import type { ExternalSiteProductStatus } from "./types";

/**
 * Product eligibility ≠ crawl engine.
 * Cheerio/Playwright are runtime details only.
 */
export function resolveExternalSiteProductStatus(input: {
  adapterKey: string;
  isActive: boolean;
}): ExternalSiteProductStatus {
  if (!input.isActive) return "BLOCKED";
  const key = String(input.adapterKey || "").trim();
  if (key === "philgo") return "BLOCKED";
  if (key === "philsamo" || key === "hellocebuph") return "USABLE";
  return "NOT_PROVEN";
}
