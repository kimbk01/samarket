import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `tradeMarketParent` 쿼리 파라미터: UUID 또는 **거래 루트** slug → 단일 카테고리 id.
 * 클라이언트가 실수로 slug를 넘기거나, 캐시·프록시가 잘라 UUID가 아닌 값만 남는 경우에도
 * 필터가 빠지지 않도록 API에서 해석한다. (없으면 null → 전체 피드와 동일 동작)
 */
export async function resolveTradeMarketParentParam(
  readSb: SupabaseClient<any> | null,
  raw: string | null
): Promise<string | null> {
  const t = raw?.trim() ?? "";
  if (!t) return null;
  if (UUID_RE.test(t)) return t;
  const qsb = tryCreateSupabaseServiceClient() ?? readSb;
  if (!qsb) return null;
  const { data, error } = await qsb
    .from("categories")
    .select("id")
    .eq("type", "trade")
    .eq("slug", t)
    .is("parent_id", null)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error || !data?.id) return null;
  return String(data.id);
}
