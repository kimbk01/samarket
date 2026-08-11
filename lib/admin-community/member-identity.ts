/**
 * Admin Community operator console — member display identity (profiles SSOT).
 * Batch only. Do not use UUID as primary UI label.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminMemberIdentity = {
  nickname: string | null;
  username: string | null;
};

export function formatAdminMemberLabel(
  identity: AdminMemberIdentity | null | undefined,
  unknownLabel = "알 수 없는 회원"
): string {
  const nick = typeof identity?.nickname === "string" ? identity.nickname.trim() : "";
  const user = typeof identity?.username === "string" ? identity.username.trim() : "";
  if (nick && user) return `${nick} | ${user}`;
  if (nick) return nick;
  if (user) return user;
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
    const { data, error } = await sb.from("profiles").select("id, nickname, username").in("id", chunk);
    if (error || !Array.isArray(data)) continue;
    for (const row of data as Array<{ id?: string; nickname?: string | null; username?: string | null }>) {
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      map.set(id, {
        nickname: row.nickname != null && String(row.nickname).trim() ? String(row.nickname).trim() : null,
        username: row.username != null && String(row.username).trim() ? String(row.username).trim() : null,
      });
    }
  }
  return map;
}

export function adminMemberHref(userId: string | null | undefined): string | null {
  const id = typeof userId === "string" ? userId.trim() : "";
  return id ? `/admin/users/${encodeURIComponent(id)}` : null;
}
