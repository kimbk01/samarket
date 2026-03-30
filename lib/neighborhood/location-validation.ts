/** location_id 없는 글 제외· 잘못된 키 차단에 사용 */

import type { SupabaseClient } from "@supabase/supabase-js";

const INVALID_FIRST_SEG = new Set(["unknown", "undefined", "null", ""]);

export function isValidNeighborhoodLocationKey(key: string): boolean {
  const k = key.trim();
  if (k.length < 3) return false;
  const parts = k.split(":").map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length < 2) return false;
  const first = parts[0]!.toLowerCase();
  if (INVALID_FIRST_SEG.has(first)) return false;
  return true;
}

/** DB locations 행 존재 여부 */
export async function locationIdExistsInDb(sb: SupabaseClient<any>, locationId: string): Promise<boolean> {
  const id = locationId.trim();
  if (!id) return false;
  const { data } = await sb.from("locations").select("id").eq("id", id).maybeSingle();
  return data != null && typeof (data as { id?: string }).id === "string";
}
