/**
 * 거래 마켓 루트(홈 1행 메뉴) 아래 **모든 깊이**의 활성 trade 카테고리.
 * 글은 리프 UUID 로만 저장되는 경우가 많아 직계 자식만 필터에 넣으면 마켓 탭이 비어 보임.
 *
 * 레거시 `trade_categories` 병합: Production live schema 는 flat
 * (`id,name,slug,icon,...` — **no parent_id**). Dead legacy assumption.
 * Opt-in only: `NEXT_PUBLIC_MERGE_LEGACY_TRADE_CATEGORIES=true` on exotic DBs
 * that still have a hierarchical `trade_categories.parent_id`.
 * Default = OFF so normal Product never issues parent_id queries (FD2).
 */

export type TradeCategoryNode = { id: string; slug: string | null };

function mergeLegacyTradeCategoriesEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const v = process.env.NEXT_PUBLIC_MERGE_LEGACY_TRADE_CATEGORIES;
  return v === "1" || v === "true";
}

function mergeNodesUnique(primary: TradeCategoryNode[], extra: TradeCategoryNode[]): TradeCategoryNode[] {
  const seen = new Set(primary.map((n) => n.id));
  for (const n of extra) {
    if (!n.id || seen.has(n.id)) continue;
    seen.add(n.id);
    primary.push(n);
  }
  return primary;
}

/**
 * Opt-in exotic legacy only. Production default path never calls this.
 * Live Production `trade_categories` has no `parent_id` — do not probe it.
 */
async function fetchLegacyTradeCategoryDescendantNodes(
  supabase: unknown,
  rootId: string
): Promise<TradeCategoryNode[]> {
  const rid = rootId.trim();
  if (!rid) return [];
  const sb = supabase as any;
  const out: TradeCategoryNode[] = [];
  let frontier: string[] = [rid];

  for (let depth = 0; depth < 24 && frontier.length > 0; depth++) {
    const { data, error } = await sb
      .from("trade_categories")
      .select("id, slug")
      .in("parent_id", frontier);

    if (error) {
      const msg = String((error as { message?: string })?.message ?? "");
      if (/relation|does not exist|42P01/i.test(msg)) return [];
      break;
    }
    if (!Array.isArray(data) || data.length === 0) break;

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

  const legacy = mergeLegacyTradeCategoriesEnabled()
    ? await fetchLegacyTradeCategoryDescendantNodes(supabase, rid)
    : [];
  return mergeNodesUnique(out, legacy);
}
