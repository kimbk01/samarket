import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUuidOrNull(v: unknown): null | string | "invalid" {
  if (v === null) return null;
  if (typeof v !== "string") return "invalid";
  const t = v.trim();
  if (!t) return null;
  return UUID_RE.test(t) ? t : "invalid";
}

/**
 * Shared store taxonomy persistence rules — Owner + Admin MUST use this.
 * Gate (owner_can_edit_store_identity) stays at the Owner route.
 */
export async function buildStoreTaxonomyPatch(
  sb: SupabaseClient,
  opts: {
    currentCategoryId: string | null;
    currentTopicId: string | null;
    store_category_id?: unknown;
    store_topic_id?: unknown;
  }
): Promise<
  | { ok: true; patch: { store_category_id: string | null; store_topic_id: string | null } }
  | { ok: false; error: string }
> {
  if (opts.store_category_id === undefined && opts.store_topic_id === undefined) {
    return { ok: false, error: "taxonomy_fields_required" };
  }

  const nextCat =
    opts.store_category_id !== undefined
      ? parseUuidOrNull(opts.store_category_id)
      : ("omit" as const);
  if (nextCat === "invalid") return { ok: false, error: "invalid_store_category_id" };

  const nextTopic =
    opts.store_topic_id !== undefined
      ? parseUuidOrNull(opts.store_topic_id)
      : ("omit" as const);
  if (nextTopic === "invalid") return { ok: false, error: "invalid_store_topic_id" };

  let categoryId = nextCat === "omit" ? opts.currentCategoryId : nextCat;
  let topicId = nextTopic === "omit" ? opts.currentTopicId : nextTopic;

  if (nextCat !== "omit" && nextCat === null) {
    return {
      ok: true,
      patch: { store_category_id: null, store_topic_id: null },
    };
  }

  if (categoryId) {
    const { data: catRow, error } = await sb
      .from("store_categories")
      .select("id")
      .eq("id", categoryId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!catRow) return { ok: false, error: "store_category_not_found" };
  }

  if (nextCat !== "omit" && nextTopic === "omit" && topicId && categoryId) {
    const { data: existingTopic } = await sb
      .from("store_topics")
      .select("store_category_id")
      .eq("id", topicId)
      .maybeSingle();
    if (existingTopic && existingTopic.store_category_id !== categoryId) {
      topicId = null;
    }
  }

  if (topicId) {
    const { data: topicRow, error } = await sb
      .from("store_topics")
      .select("store_category_id")
      .eq("id", topicId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!topicRow) return { ok: false, error: "store_topic_not_found" };
    if (categoryId != null && topicRow.store_category_id !== categoryId) {
      return { ok: false, error: "store_topic_category_mismatch" };
    }
    if (!categoryId && topicRow.store_category_id) {
      categoryId = String(topicRow.store_category_id);
    }
  } else if (nextCat !== "omit") {
    topicId = null;
  }

  return {
    ok: true,
    patch: {
      store_category_id: categoryId,
      store_topic_id: topicId,
    },
  };
}
