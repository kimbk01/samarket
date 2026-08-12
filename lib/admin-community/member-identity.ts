/**
 * Admin Community operator console — member display identity (profiles SSOT).
 * Batch only. Do not use UUID as primary UI label.
 * MEMBER DISPLAY = nickname · PUBLIC ID = dibay_id (never username / display_name).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MEMBER_IDENTITY_PROFILE_SELECT,
  resolvePublicMemberIdentity,
  type MemberIdentityProfileFields,
} from "@/lib/users/public-member-identity";

export type AdminMemberIdentity = {
  nickname: string | null;
  /** Member public id — dibay_id (legacy DTO field name `username`) */
  username: string | null;
};

export function formatAdminMemberLabel(
  identity: AdminMemberIdentity | null | undefined,
  unknownLabel = "알 수 없는 회원"
): string {
  const nick = typeof identity?.nickname === "string" ? identity.nickname.trim() : "";
  const handle = typeof identity?.username === "string" ? identity.username.trim().replace(/^@+/, "") : "";
  if (nick && handle) return `${nick} | ${handle}`;
  if (nick) return nick;
  if (handle) return `@${handle}`;
  return unknownLabel;
}

export async function loadAdminMemberIdentityMap(
  sb: SupabaseClient,
  userIds: string[]
): Promise<Map<string, AdminMemberIdentity>> {
  const map = new Map<string, AdminMemberIdentity>();
  const ids = [...new Set(userIds.map((x) => String(x ?? "").trim()).filter(Boolean))];
  if (!ids.length) return map;

  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await sb
      .from("profiles")
      .select(MEMBER_IDENTITY_PROFILE_SELECT)
      .in("id", chunk);
    if (error || !Array.isArray(data)) continue;
    for (const row of data as MemberIdentityProfileFields[]) {
      const identity = resolvePublicMemberIdentity(row);
      if (!identity) continue;
      map.set(identity.userId, {
        nickname: identity.nickname,
        username: identity.dibayId,
      });
    }
  }
  return map;
}

export function adminMemberHref(userId: string | null | undefined): string | null {
  const id = typeof userId === "string" ? userId.trim() : "";
  return id ? `/admin/users/${encodeURIComponent(id)}` : null;
}
