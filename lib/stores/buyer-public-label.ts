import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MEMBER_IDENTITY_PROFILE_SELECT,
  memberCompactLabelFromRow,
  memberDisplayLabelFromRow,
  type MemberIdentityProfileFields,
} from "@/lib/users/public-member-identity";

/** 매장 오너 화면용 — Order CUSTOMER = MEMBER Identity (never store_name / slug) */
export const BUYER_PUBLIC_LABEL_FALLBACK = "사마켓 회원";

/**
 * `buyer_user_id` 집합 → Member compact/public label.
 * profiles.display_name / username / stores.* 사용 금지.
 */
export async function mapBuyerUserIdsToPublicLabels(
  sb: SupabaseClient<any>,
  buyerIds: string[]
): Promise<Record<string, string>> {
  const unique = [...new Set(buyerIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  const out: Record<string, string> = {};
  if (!unique.length) return out;

  const { data: profiles } = await sb
    .from("profiles")
    .select(MEMBER_IDENTITY_PROFILE_SELECT)
    .in("id", unique);
  for (const p of profiles ?? []) {
    const id = String((p as { id?: string }).id ?? "").trim();
    if (!id) continue;
    out[id] = memberCompactLabelFromRow(p as MemberIdentityProfileFields, { userId: id });
  }

  const missing = unique.filter((id) => !out[id]);
  if (missing.length) {
    const { data: testUsers } = await sb
      .from("test_users")
      .select("id, display_name, username")
      .in("id", missing);
    for (const t of testUsers ?? []) {
      const id = String((t as { id?: string }).id ?? "").trim();
      const row = t as { display_name?: string | null; username?: string | null };
      const label =
        (typeof row.display_name === "string" && row.display_name.trim()) ||
        (typeof row.username === "string" && row.username.trim()) ||
        "";
      if (id && label) out[id] = label;
    }
  }

  for (const id of unique) {
    if (!out[id]) out[id] = BUYER_PUBLIC_LABEL_FALLBACK;
  }

  return out;
}

/** Single-line display without forcing @handle (owner tables). */
export async function mapBuyerUserIdsToDisplayLabels(
  sb: SupabaseClient<any>,
  buyerIds: string[]
): Promise<Record<string, string>> {
  const unique = [...new Set(buyerIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  const out: Record<string, string> = {};
  if (!unique.length) return out;
  const { data: profiles } = await sb
    .from("profiles")
    .select(MEMBER_IDENTITY_PROFILE_SELECT)
    .in("id", unique);
  for (const p of profiles ?? []) {
    const id = String((p as { id?: string }).id ?? "").trim();
    if (!id) continue;
    out[id] = memberDisplayLabelFromRow(p as MemberIdentityProfileFields, { userId: id });
  }
  for (const id of unique) {
    if (!out[id]) out[id] = BUYER_PUBLIC_LABEL_FALLBACK;
  }
  return out;
}
