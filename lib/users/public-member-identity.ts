/**
 * MEMBER public identity SSOT — Community / Trade / Messenger peer / Order customer.
 *
 * CONTRACT
 * - UUID       = profiles.id
 * - DISPLAY    = profiles.nickname
 * - PUBLIC ID  = profiles.dibay_id
 *
 * DO NOT use as Member name/handle fallback:
 * - profiles.display_name
 * - profiles.username
 * - stores.store_name / stores.slug
 */

import { formatAtUsername } from "@/lib/users/user-label";

export const MEMBER_IDENTITY_PROFILE_SELECT =
  "id, nickname, dibay_id, avatar_url" as const;

/** Batch selects that also need trust fields keep appending; core identity cols stay nickname + dibay_id. */
export const MEMBER_IDENTITY_PROFILE_SELECT_WITH_TRUST =
  "id, nickname, dibay_id, avatar_url, trust_score, manner_score, manner_temperature" as const;

export type PublicMemberIdentity = {
  userId: string;
  nickname: string | null;
  dibayId: string | null;
  /** nickname, else @dibay_id, else generic */
  displayLabel: string;
  /** @dibay_id or null */
  handleLabel: string | null;
  /** `닉 (@id)` when both present; else displayLabel */
  compactLabel: string;
  avatarUrl: string | null;
};

export type MemberIdentityProfileFields = {
  id?: unknown;
  nickname?: unknown;
  dibay_id?: unknown;
  avatar_url?: unknown;
};

const GENERIC_MEMBER_LABEL_KO = "회원";
const GENERIC_MEMBER_LABEL_EN = "Member";

function pickTrimmed(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function memberGenericLabel(lang?: string | null): string {
  const l = String(lang ?? "").toLowerCase();
  if (l.startsWith("en")) return GENERIC_MEMBER_LABEL_EN;
  return GENERIC_MEMBER_LABEL_KO;
}

/**
 * Resolve Member identity from a profiles row (or partial).
 * Never reads display_name / username / store fields.
 */
export function resolvePublicMemberIdentity(
  row: MemberIdentityProfileFields | null | undefined,
  opts?: { userId?: string; lang?: string | null; genericLabel?: string }
): PublicMemberIdentity | null {
  const userId = pickTrimmed(opts?.userId) ?? pickTrimmed(row?.id);
  if (!userId) return null;

  const nickname = pickTrimmed(row?.nickname);
  const dibayId = pickTrimmed(row?.dibay_id);
  const handleLabel = dibayId ? formatAtUsername(dibayId) || null : null;
  const generic = opts?.genericLabel?.trim() || memberGenericLabel(opts?.lang);

  const displayLabel = nickname || handleLabel || generic;
  const compactLabel =
    nickname && handleLabel
      ? `${nickname} (${handleLabel})`
      : displayLabel;

  return {
    userId,
    nickname,
    dibayId,
    displayLabel,
    handleLabel,
    compactLabel,
    avatarUrl: pickTrimmed(row?.avatar_url),
  };
}

/** Map userId → displayLabel (list enrich / nick maps). */
export function memberDisplayLabelFromRow(
  row: MemberIdentityProfileFields | null | undefined,
  opts?: { userId?: string; lang?: string | null }
): string {
  return resolvePublicMemberIdentity(row, opts)?.displayLabel ?? memberGenericLabel(opts?.lang);
}

/** Compact one-line label for trade list seller line. */
export function memberCompactLabelFromRow(
  row: MemberIdentityProfileFields | null | undefined,
  opts?: { userId?: string; lang?: string | null }
): string {
  return resolvePublicMemberIdentity(row, opts)?.compactLabel ?? memberGenericLabel(opts?.lang);
}
