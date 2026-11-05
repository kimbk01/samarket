import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 관리자 화면 전용 — 처리자 id → 닉네임 (관리자 화면에 UUID 대신 사람 이름).
 * 회원·오너 응답에는 쓰지 않는다 (그쪽 처리자는 「운영팀」).
 */
export async function loadAdminActorNames(
  sb: SupabaseClient,
  ids: ReadonlyArray<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.map((v) => String(v ?? "").trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data, error } = await sb.from("profiles").select("id, nickname").in("id", unique);
  if (error) return out;
  for (const p of (data ?? []) as Array<{ id?: unknown; nickname?: unknown }>) {
    const name = String(p.nickname ?? "").trim();
    if (p.id && name) out.set(String(p.id), name);
  }
  return out;
}

/** 이름이 없으면 짧은 id (관리자 화면만) */
export function adminActorLabel(names: Map<string, string>, id: string | null | undefined): string | null {
  const v = String(id ?? "").trim();
  if (!v) return null;
  return names.get(v) ?? `${v.slice(0, 8)}…`;
}
