import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  StoreTaxonomyCategory,
  StoreTaxonomySubtopic,
  StoreTaxonomyTopic,
} from "@/lib/stores/store-taxonomy-types";

export type LoadedStoreTaxonomy = {
  categories: StoreTaxonomyCategory[];
  topics: StoreTaxonomyTopic[];
  subtopics: StoreTaxonomySubtopic[];
  /** store_subtopics 테이블 없음(마이그레이션 미적용) */
  subtopicsTableMissing: boolean;
};

type TaxonomyQueryOpts = {
  /** false = 어드민(숨김 포함) */
  activeOnly?: boolean;
};

function isMissingRelationMessage(msg: string): boolean {
  return /store_subtopics|does not exist|relation|42P01/i.test(msg);
}

/**
 * store_categories / store_topics / store_subtopics 일괄 로드.
 * categories·topics 실패 시 throw — subtopics 는 테이블 없으면 빈 배열.
 */
export async function loadStoreTaxonomyRows(
  sb: SupabaseClient,
  opts?: TaxonomyQueryOpts
): Promise<LoadedStoreTaxonomy> {
  const activeOnly = opts?.activeOnly !== false;

  const [catResult, topicResult, subResult] = await Promise.all([
    loadCategories(sb, activeOnly),
    loadTopics(sb, activeOnly),
    loadSubtopics(sb, activeOnly),
  ]);

  if (catResult.error) throw new Error(catResult.error.message);
  if (topicResult.error) throw new Error(topicResult.error.message);
  if (subResult.error && !subResult.tableMissing) throw new Error(subResult.error.message);

  return {
    categories: catResult.data,
    topics: topicResult.data,
    subtopics: subResult.data,
    subtopicsTableMissing: subResult.tableMissing,
  };
}

async function loadCategories(sb: SupabaseClient, activeOnly: boolean) {
  const catSelectAttempts = [
    "id, name, name_en, slug, sort_order, is_active, image_url",
    "id, name, slug, sort_order, is_active, image_url",
  ] as const;
  let data: StoreTaxonomyCategory[] = [];
  let error: { message: string } | null = null;
  for (const sel of catSelectAttempts) {
    let q = sb.from("store_categories").select(sel).order("sort_order", { ascending: true });
    if (activeOnly) q = q.eq("is_active", true);
    const r = await q;
    if (!r.error && Array.isArray(r.data)) {
      data = r.data as unknown as StoreTaxonomyCategory[];
      return { data, error: null };
    }
    error = r.error;
  }
  return { data, error };
}

async function loadTopics(sb: SupabaseClient, activeOnly: boolean) {
  const topicSelectAttempts = [
    "id, store_category_id, name, name_en, slug, sort_order, is_active, image_url",
    "id, store_category_id, name, slug, sort_order, is_active, image_url",
  ] as const;
  let data: StoreTaxonomyTopic[] = [];
  let error: { message: string } | null = null;
  for (const sel of topicSelectAttempts) {
    let q = sb.from("store_topics").select(sel).order("sort_order", { ascending: true });
    if (activeOnly) q = q.eq("is_active", true);
    const r = await q;
    if (!r.error && Array.isArray(r.data)) {
      data = r.data as unknown as StoreTaxonomyTopic[];
      return { data, error: null };
    }
    error = r.error;
  }
  return { data, error };
}

async function loadSubtopics(sb: SupabaseClient, activeOnly: boolean) {
  const subSelectAttempts = [
    "id, store_topic_id, name, name_en, slug, sort_order, is_active, image_url",
    "id, store_topic_id, name, slug, sort_order, is_active, image_url",
  ] as const;
  for (const sel of subSelectAttempts) {
    let q = sb.from("store_subtopics").select(sel).order("sort_order", { ascending: true });
    if (activeOnly) q = q.eq("is_active", true);
    const r = await q;
    if (!r.error && Array.isArray(r.data)) {
      return {
        data: r.data as unknown as StoreTaxonomySubtopic[],
        error: null,
        tableMissing: false,
      };
    }
    if (r.error && isMissingRelationMessage(r.error.message)) {
      return { data: [], error: null, tableMissing: true };
    }
    if (r.error) return { data: [], error: r.error, tableMissing: false };
  }
  return { data: [], error: null, tableMissing: false };
}
