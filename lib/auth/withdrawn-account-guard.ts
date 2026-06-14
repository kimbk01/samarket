import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import { clearActiveSessionCookie } from "@/lib/auth/active-session";
import { isDeletedStoreMember } from "@/lib/auth/store-member-policy";

export type MemberWithdrawalRow = {
  id?: string | null;
  status?: string | null;
  deleted_at?: string | null;
};

export async function loadMemberWithdrawalRow(
  sb: SupabaseClient,
  userId: string
): Promise<MemberWithdrawalRow | null> {
  const uid = String(userId ?? "").trim();
  if (!uid) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("id, status, deleted_at")
    .eq("id", uid)
    .maybeSingle();
  if (error || !data) return null;
  return data as MemberWithdrawalRow;
}

export function isWithdrawnMemberProfile(row: MemberWithdrawalRow | null | undefined): boolean {
  return isDeletedStoreMember(row);
}

export type WithdrawnAccountGuardResult = "active" | "withdrawn" | "missing";

export async function resolveMemberWithdrawalGuard(
  sb: SupabaseClient,
  userId: string
): Promise<WithdrawnAccountGuardResult> {
  const row = await loadMemberWithdrawalRow(sb, userId);
  if (!row?.id) return "missing";
  if (isWithdrawnMemberProfile(row)) return "withdrawn";
  return "active";
}

/**
 * 탈퇴(일반 삭제) 회원 — Supabase 세션·active session cookie 정리.
 * purge 후 재가입 시에는 profiles 행이 없으므로 `missing` → 통과.
 */
export async function revokeSessionForWithdrawnMember(
  routeSb: SupabaseClient,
  response: NextResponse,
  userId: string,
  adminSb?: SupabaseClient | null
): Promise<WithdrawnAccountGuardResult> {
  const checkSb = adminSb ?? routeSb;
  const state = await resolveMemberWithdrawalGuard(checkSb, userId);
  if (state !== "withdrawn") return state;
  try {
    await routeSb.auth.signOut({ scope: "global" });
  } catch {
    /* best-effort */
  }
  await clearActiveSessionCookie(response);
  return "withdrawn";
}
