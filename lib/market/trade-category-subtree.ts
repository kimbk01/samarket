/**
 * 거래 마켓 루트(홈 1행 메뉴) 아래 **모든 깊이**의 활성 trade 카테고리.
 * 글은 리프 UUID 로만 저장되는 경우가 많아 직계 자식만 필터에 넣으면 마켓 탭이 비어 보임.
 */

export type TradeCategoryNode = { id: string; slug: string | null };

/**
 * `rootId` 의 **비포함** 하손 전체 (BFS). 루트 id 는 호출측에서 별도로 필터에 합침.
 */
export async function fetchTradeCategoryDescendantNodes(
  supabase: unknown,
  rootId: string
): Promise<TradeCategoryNode[]> {
  const rid = rootId.trim();
  if (!rid) return [];
  const sb = supabase as any;
  const out: TradeCategoryNode[] = [];
  let frontier: string[] = [rid];

  for (let depth = 0; depth < 24 && frontier.length > 0; depth++) {
    /** `type` 은 레거시/수입 데이터에서 누락·불일치할 수 있음 — parent_id 트리만 신뢰 */
    const { data, error } = await sb
      .from("categories")
      .select("id, slug")
      .eq("is_active", true)
      .in("parent_id", frontier);

    if (error || !Array.isArray(data) || data.length === 0) {
      break;
    }

    const next: string[] = [];
    for (const row of data) {
      const rec = row as { id?: string; slug?: unknown };
      const id = String(rec.id ?? "");
      if (!id) continue;
      out.push({
        id,
        slug: typeof rec.slug === "string" ? rec.slug : null,
      });
      next.push(id);
    }
    frontier = next;
  }

  return out;
}
