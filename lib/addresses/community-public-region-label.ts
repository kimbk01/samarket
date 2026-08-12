import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";
import { formatPublicAddress, buildExplorationRegionSubtitleLine } from "@/lib/addresses/user-address-format";

const PRIVATE_DETAIL_RE =
  /\b(unit|room|apt|apartment|suite|floor)\b|\bfl(?:oor)?\.?\s*\d+\b|\d+\s*(?:동|호|층)|(?:동|호|층)\s*\d+|호수/i;

export const COMMUNITY_PUBLIC_REGION_FALLBACK = "동네";

export function publicRegionLabelLeaksPrivateDetail(label: string): boolean {
  return PRIVATE_DETAIL_RE.test(label.trim());
}

export function sanitizePublicRegionLabel(label: string | null | undefined): string | null {
  const t = (label ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (publicRegionLabelLeaksPrivateDetail(t)) return null;
  return t.slice(0, 80);
}

/**
 * Community/Philife `region_label` writer SSOT.
 * Client `region_label` / freeform locationName is not authority.
 */
export async function resolveCommunityPublicRegionLabelForUser(
  sb: SupabaseClient<any>,
  userId: string,
): Promise<string> {
  const defaults = await getUserAddressDefaults(sb, userId);
  const fromMaster = sanitizePublicRegionLabel(
    formatPublicAddress(defaults.master) ?? buildExplorationRegionSubtitleLine(defaults.master),
  );
  if (fromMaster) return fromMaster;
  const fromLife = sanitizePublicRegionLabel(
    formatPublicAddress(defaults.life) ?? buildExplorationRegionSubtitleLine(defaults.life),
  );
  if (fromLife) return fromLife;
  return COMMUNITY_PUBLIC_REGION_FALLBACK;
}
