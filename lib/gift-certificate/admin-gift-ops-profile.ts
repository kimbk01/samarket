import type { SupabaseClient } from "@supabase/supabase-js";

export function adminGiftProfileLabel(row: Record<string, unknown> | undefined): string {
  if (!row) return "";
  const display = String(row.display_name ?? "").trim();
  const nick = String(row.nickname ?? "").trim();
  const email = String(row.email ?? "").trim();
  const id = String(row.id ?? "").trim();
  return display || nick || email || (id ? `${id.slice(0, 8)}…` : "");
}

export async function loadAdminGiftProfileMap(
  sb: SupabaseClient,
  ids: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const unique = [...new Set(ids.map((x) => String(x ?? "").trim()).filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await sb
    .from("profiles")
    .select("id, display_name, nickname, email")
    .in("id", unique)
    .limit(Math.min(500, unique.length));
  return new Map(
    ((data ?? []) as Record<string, unknown>[]).map((row) => [String(row.id), row])
  );
}
