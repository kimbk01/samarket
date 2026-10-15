/**
 * PTR Reveal audience gate — fail-closed allowlist.
 * Interruptive popups keep audience_mode='all' and never call this for eligibility.
 */

export const PTR_REVEAL_AUDIENCE_MODES = ["all", "allowlist"] as const;
export type PtrRevealAudienceMode = (typeof PTR_REVEAL_AUDIENCE_MODES)[number];

export function normalizePtrRevealAudienceMode(
  value: string | null | undefined
): PtrRevealAudienceMode {
  const v = String(value ?? "all").trim().toLowerCase();
  return v === "allowlist" ? "allowlist" : "all";
}

/** Postgres uuid literal shape — do not require RFC4122 version/variant (seed/QA ids may be all-ones). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidString(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** Normalize pasted UUID list — dedupe, reject invalid, preserve order. */
export function normalizeAudienceUserIds(
  raw: readonly string[] | null | undefined
): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, ids: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "audience_user_ids_invalid" };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = String(item ?? "").trim().toLowerCase();
    if (!id) continue;
    if (!isUuidString(id)) return { ok: false, error: `audience_user_id_invalid:${id}` };
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return { ok: true, ids: out };
}

/**
 * Fail-closed: allowlist + empty list → nobody.
 * allowlist + no viewerUserId (anonymous) → nobody.
 * all → everyone (existing popup / public PTR default).
 */
export function isPtrRevealAudienceAllowed(input: {
  audienceMode: string | null | undefined;
  audienceUserIds: readonly string[] | null | undefined;
  viewerUserId: string | null | undefined;
}): boolean {
  const mode = normalizePtrRevealAudienceMode(input.audienceMode);
  if (mode !== "allowlist") return true;
  const ids = (input.audienceUserIds ?? [])
    .map((x) => String(x ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (ids.length === 0) return false;
  const uid = String(input.viewerUserId ?? "").trim().toLowerCase();
  if (!uid) return false;
  return ids.includes(uid);
}
