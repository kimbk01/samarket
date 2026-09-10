/**
 * Community post origin contract (STEP 1 — imported identity).
 * Crawler writer / registry are later STEPs.
 */

export const COMMUNITY_POST_ORIGIN_KINDS = ["member", "admin", "imported"] as const;

export type CommunityPostOriginKind = (typeof COMMUNITY_POST_ORIGIN_KINDS)[number];

/** Product fallback when imported display_author_name is empty — never user_id / email / principal nick. */
export const COMMUNITY_IMPORTED_AUTHOR_FALLBACK = "DIBAY";

export function normalizeCommunityPostOriginKind(raw: unknown): CommunityPostOriginKind {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "admin" || s === "imported") return s;
  return "member";
}

export function isCommunityImportedOrigin(raw: unknown): boolean {
  return normalizeCommunityPostOriginKind(raw) === "imported";
}

/** Member-peer CTAs (neighbor / follow / block-as-peer) — false for imported. */
export function communityPostAllowsMemberPeerCta(raw: unknown): boolean {
  return !isCommunityImportedOrigin(raw);
}
