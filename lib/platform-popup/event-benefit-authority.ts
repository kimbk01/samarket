/**
 * CUT 1 — Benefit Dialog content authority.
 * Canonical source: linked Platform Event → benefit section.
 * No popup benefit_* columns. No title/body parsing as benefit.
 */

import { normalizePlatformEventSections } from "@/lib/platform-events/sections";
import type { PlatformEventBenefitSection } from "@/lib/platform-events/types";

export type PlatformPopupEventBenefitContent = {
  title: string;
  body: string | null;
};

/** Extract first valid benefit section from Event sections jsonb. */
export function extractPlatformEventBenefitContent(
  sections: unknown
): PlatformPopupEventBenefitContent | null {
  const normalized = normalizePlatformEventSections(sections);
  const benefit = normalized.find((s): s is PlatformEventBenefitSection => s.type === "benefit");
  if (!benefit) return null;
  const title = String(benefit.title ?? "").trim();
  if (!title) return null;
  const body = String(benefit.body ?? "").trim() || null;
  return { title, body };
}

export function isBenefitDialogEligibleForEventSections(sections: unknown): boolean {
  return extractPlatformEventBenefitContent(sections) != null;
}

/**
 * Runtime fail-safe: benefit_dialog without Event benefit must not paint.
 * Prefer skip winner (null) over Card masquerade.
 */
export function assertBenefitDialogContent(
  presentationType: string | null | undefined,
  benefit: PlatformPopupEventBenefitContent | null | undefined
):
  | { ok: true; required: false }
  | { ok: true; required: true; benefit: PlatformPopupEventBenefitContent }
  | { ok: false; reason: "benefit_content_required" } {
  if (String(presentationType ?? "").trim() !== "benefit_dialog") {
    return { ok: true, required: false };
  }
  if (!benefit?.title?.trim()) {
    return { ok: false, reason: "benefit_content_required" };
  }
  return {
    ok: true,
    required: true,
    benefit: { title: benefit.title.trim(), body: benefit.body?.trim() || null },
  };
}
