import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryLite } from "./types";

export async function loadCategoryLite(
  sb: SupabaseClient,
  categoryId: string | null | undefined
): Promise<CategoryLite | null> {
  const id = categoryId?.trim();
  if (!id) return null;
  const { data, error } = await sb.from("categories").select("id, name, icon_key, parent_id").eq("id", id).maybeSingle();
  if (error || !data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    name: typeof row.name === "string" ? row.name : undefined,
    icon_key: typeof row.icon_key === "string" ? row.icon_key : "market",
    parent_id: row.parent_id != null ? String(row.parent_id) : null,
  };
}
