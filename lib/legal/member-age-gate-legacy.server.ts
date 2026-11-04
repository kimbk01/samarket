/**
 * Pre-age-policy member set (`member_age_gate_legacy_members`, frozen once by id — Owner 2026-11-05).
 * Service-role read only. A read failure is never "legacy" — callers fail closed.
 */
import "server-only";
import type { AgeGateProfileFields } from "@/lib/legal/member-age-gate";

export type MemberAgeGateLegacyRead = { ok: true; legacy: boolean } | { ok: false };

export async function readMemberAgeGateLegacy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service supabase client
  sb: any,
  userId: string,
): Promise<MemberAgeGateLegacyRead> {
  const uid = String(userId ?? "").trim();
  if (!uid || !sb) return { ok: false };
  try {
    const { data, error } = await sb
      .from("member_age_gate_legacy_members")
      .select("user_id")
      .eq("user_id", uid)
      .maybeSingle();
    if (error) return { ok: false };
    return { ok: true, legacy: Boolean(data) };
  } catch {
    return { ok: false };
  }
}

export type MemberAgeGateState =
  | { ok: true; fields: AgeGateProfileFields & { age_gate_legacy: boolean } }
  | { ok: false };

/** Age gate inputs (profile age columns + pre-policy flag). Missing profile row ⇒ empty columns. */
export async function readMemberAgeGateState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service supabase client
  sb: any,
  userId: string,
): Promise<MemberAgeGateState> {
  const uid = String(userId ?? "").trim();
  if (!uid || !sb) return { ok: false };
  const [legacy, row] = await Promise.all([
    readMemberAgeGateLegacy(sb, uid),
    Promise.resolve(
      sb.from("profiles").select("date_of_birth, age_gate_status, age_attested_at").eq("id", uid).maybeSingle(),
    ).then(
      (r: { data: AgeGateProfileFields | null; error: unknown }) => r,
      () => ({ data: null, error: true }),
    ),
  ]);
  if (!legacy.ok || row.error) return { ok: false };
  return {
    ok: true,
    fields: {
      date_of_birth: row.data?.date_of_birth ?? null,
      age_gate_status: row.data?.age_gate_status ?? null,
      age_attested_at: row.data?.age_attested_at ?? null,
      age_gate_legacy: legacy.legacy,
    },
  };
}

/** Batch read for admin lists. Missing ids ⇒ not legacy; read failure ⇒ null. */
export async function readMemberAgeGateLegacySet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service supabase client
  sb: any,
  userIds: string[],
): Promise<Set<string> | null> {
  const ids = [...new Set(userIds.map((v) => String(v ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return new Set();
  try {
    const { data, error } = await sb.from("member_age_gate_legacy_members").select("user_id").in("user_id", ids);
    if (error) return null;
    return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
  } catch {
    return null;
  }
}
