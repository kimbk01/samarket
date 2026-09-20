/**
 * Normalize Event sections from jsonb — fail soft, drop malformed.
 */

import {
  PLATFORM_EVENT_SECTION_TYPES,
  type PlatformEventSection,
  type PlatformEventSectionType,
} from "@/lib/platform-events/types";

function isSectionType(v: string): v is PlatformEventSectionType {
  return (PLATFORM_EVENT_SECTION_TYPES as readonly string[]).includes(v);
}

export function normalizePlatformEventSections(raw: unknown): PlatformEventSection[] {
  if (!Array.isArray(raw)) return [];
  const out: PlatformEventSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = String(row.type ?? "").trim().toLowerCase();
    if (!isSectionType(type)) continue;

    if (type === "text") {
      const body = String(row.body ?? "").trim();
      if (!body) continue;
      const title = String(row.title ?? "").trim();
      out.push(title ? { type: "text", title, body } : { type: "text", body });
      continue;
    }
    if (type === "image") {
      const imageUrl = String(row.imageUrl ?? row.image_url ?? "").trim();
      if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) continue;
      const alt = String(row.alt ?? "").trim();
      out.push(alt ? { type: "image", imageUrl, alt } : { type: "image", imageUrl });
      continue;
    }
    if (type === "benefit") {
      const title = String(row.title ?? "").trim();
      if (!title) continue;
      const body = String(row.body ?? "").trim();
      out.push(body ? { type: "benefit", title, body } : { type: "benefit", title });
      continue;
    }
    if (type === "cta") {
      const label = String(row.label ?? "").trim();
      const ctaType = String(row.ctaType ?? row.cta_type ?? "").trim();
      if (!label || !ctaType) continue;
      out.push({
        type: "cta",
        label,
        ctaType,
        ctaTarget: String(row.ctaTarget ?? row.cta_target ?? "").trim() || undefined,
        externalUrl: String(row.externalUrl ?? row.external_url ?? "").trim() || undefined,
      });
      continue;
    }
    if (type === "terms") {
      const body = String(row.body ?? "").trim();
      if (!body) continue;
      out.push({ type: "terms", body });
    }
  }
  return out;
}

export function serializePlatformEventSections(sections: PlatformEventSection[]): PlatformEventSection[] {
  return normalizePlatformEventSections(sections);
}
