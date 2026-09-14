import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPhilifeDefaultSectionTopics } from "@/lib/neighborhood/philife-neighborhood-topics";
import { isPhilifeNeighborhoodWriteEligibleRow } from "@/lib/neighborhood/philife-topic-slug-rules";

export type WriteEligibleTopic = {
  id: string;
  name: string;
  name_en: string | null;
  slug: string;
};

type TopicLike = {
  id: string;
  name?: string | null;
  name_en?: string | null;
  slug?: string | null;
  is_visible?: boolean;
  allow_meetup?: boolean | null;
  is_feed_sort?: boolean | null;
  sort_order?: number | null;
};

function toWriteEligible(topics: TopicLike[]): WriteEligibleTopic[] {
  return topics
    .filter(
      (t) =>
        t.is_visible !== false &&
        isPhilifeNeighborhoodWriteEligibleRow(
          Boolean(t.allow_meetup),
          t.is_feed_sort === true,
          String(t.slug ?? "")
        )
    )
    .sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        String(a.name).localeCompare(String(b.name), "ko")
    )
    .map((t) => ({
      id: String(t.id),
      name: String(t.name ?? "").trim() || String(t.slug ?? ""),
      name_en: t.name_en ?? null,
      slug: String(t.slug ?? "").trim(),
    }))
    .filter((t) => t.id && t.slug);
}

/**
 * DIBAY target topics for external import — same writeEligible set as Philife compose.
 * Prefer `sb` when available (Admin API / service). Cookie-bound loader is fallback only.
 */
export async function listWriteEligibleTopicsForExternalImport(
  sb?: SupabaseClient
): Promise<WriteEligibleTopic[]> {
  if (sb) {
    const { data, error } = await sb
      .from("community_topics")
      .select("id, name, name_en, slug, is_visible, allow_meetup, is_feed_sort, sort_order")
      .eq("is_visible", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return toWriteEligible((data ?? []) as TopicLike[]);
  }
  const topics = await loadPhilifeDefaultSectionTopics();
  return toWriteEligible(topics as TopicLike[]);
}

export async function assertWriteEligibleTopicId(
  sb: SupabaseClient,
  topicId: string | null | undefined
): Promise<
  | { ok: true; topic: WriteEligibleTopic }
  | { ok: false; failureCode: string; failureMessage: string }
> {
  const id = String(topicId ?? "").trim();
  if (!id) {
    return {
      ok: false,
      failureCode: "dibay_topic_required",
      failureMessage: "게시할 DIBAY 주제를 선택하세요.",
    };
  }
  const eligible = await listWriteEligibleTopicsForExternalImport(sb);
  const hit = eligible.find((t) => t.id === id);
  if (!hit) {
    return {
      ok: false,
      failureCode: "dibay_topic_not_write_eligible",
      failureMessage: "선택한 DIBAY 주제가 없거나 게시할 수 없습니다.",
    };
  }
  return { ok: true, topic: hit };
}
