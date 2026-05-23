import type {
  StoreTaxonomyCategory,
  StoreTaxonomySubtopic,
  StoreTaxonomyTopic,
} from "@/lib/stores/store-taxonomy-types";

export type AdminTaxonomyState = {
  categories: StoreTaxonomyCategory[];
  topics: StoreTaxonomyTopic[];
  subtopics: StoreTaxonomySubtopic[];
};

function sortByOrder<T extends { sort_order?: number }>(a: T, b: T): number {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

/** 동일 id 행은 내용이 같으면 이전 참조 유지 → 썸네일·선택 하이라이트 깜빡임 방지 */
function mergeRowList<T extends { id: string; sort_order?: number }>(
  prev: T[],
  next: T[],
  same: (a: T, b: T) => boolean
): T[] {
  const nextById = new Map(next.map((r) => [r.id, r]));
  const merged: T[] = [];
  const seen = new Set<string>();

  for (const p of prev) {
    const n = nextById.get(p.id);
    if (!n) continue;
    seen.add(p.id);
    merged.push(same(p, n) ? p : n);
  }
  for (const n of next) {
    if (!seen.has(n.id)) merged.push(n);
  }
  return merged.sort(sortByOrder);
}

function categorySame(a: StoreTaxonomyCategory, b: StoreTaxonomyCategory): boolean {
  return (
    a.name === b.name &&
    (a.name_en ?? null) === (b.name_en ?? null) &&
    a.slug === b.slug &&
    (a.sort_order ?? 0) === (b.sort_order ?? 0) &&
    a.is_active === b.is_active &&
    (a.image_url ?? null) === (b.image_url ?? null)
  );
}

function topicSame(a: StoreTaxonomyTopic, b: StoreTaxonomyTopic): boolean {
  return (
    a.store_category_id === b.store_category_id &&
    a.name === b.name &&
    (a.name_en ?? null) === (b.name_en ?? null) &&
    a.slug === b.slug &&
    (a.sort_order ?? 0) === (b.sort_order ?? 0) &&
    a.is_active === b.is_active &&
    (a.image_url ?? null) === (b.image_url ?? null)
  );
}

function subtopicSame(a: StoreTaxonomySubtopic, b: StoreTaxonomySubtopic): boolean {
  return (
    a.store_topic_id === b.store_topic_id &&
    a.name === b.name &&
    (a.name_en ?? null) === (b.name_en ?? null) &&
    a.slug === b.slug &&
    (a.sort_order ?? 0) === (b.sort_order ?? 0) &&
    a.is_active === b.is_active &&
    (a.image_url ?? null) === (b.image_url ?? null)
  );
}

export function mergeAdminTaxonomyState(
  prev: AdminTaxonomyState | null,
  next: AdminTaxonomyState
): AdminTaxonomyState {
  if (!prev) return next;
  return {
    categories: mergeRowList(prev.categories, next.categories, categorySame),
    topics: mergeRowList(prev.topics, next.topics, topicSame),
    subtopics: mergeRowList(prev.subtopics, next.subtopics, subtopicSame),
  };
}

export function upsertCategoryInState(
  state: AdminTaxonomyState,
  row: StoreTaxonomyCategory
): AdminTaxonomyState {
  const i = state.categories.findIndex((c) => c.id === row.id);
  const categories =
    i >= 0 ?
      state.categories.map((c, idx) => (idx === i ? (categorySame(c, row) ? c : row) : c))
    : [...state.categories, row].sort(sortByOrder);
  return { ...state, categories };
}

export function upsertTopicInState(state: AdminTaxonomyState, row: StoreTaxonomyTopic): AdminTaxonomyState {
  const i = state.topics.findIndex((t) => t.id === row.id);
  const topics =
    i >= 0 ?
      state.topics.map((t, idx) => (idx === i ? (topicSame(t, row) ? t : row) : t))
    : [...state.topics, row].sort(sortByOrder);
  return { ...state, topics };
}

export function upsertSubtopicInState(
  state: AdminTaxonomyState,
  row: StoreTaxonomySubtopic
): AdminTaxonomyState {
  const i = state.subtopics.findIndex((s) => s.id === row.id);
  const subtopics =
    i >= 0 ?
      state.subtopics.map((s, idx) => (idx === i ? (subtopicSame(s, row) ? s : row) : s))
    : [...state.subtopics, row].sort(sortByOrder);
  return { ...state, subtopics };
}

export function patchRowActiveInState(
  state: AdminTaxonomyState,
  kind: "category" | "topic" | "subtopic",
  id: string,
  is_active: boolean
): AdminTaxonomyState {
  if (kind === "category") {
    return {
      ...state,
      categories: state.categories.map((c) => (c.id === id ? { ...c, is_active } : c)),
    };
  }
  if (kind === "topic") {
    return {
      ...state,
      topics: state.topics.map((t) => (t.id === id ? { ...t, is_active } : t)),
    };
  }
  return {
    ...state,
    subtopics: state.subtopics.map((s) => (s.id === id ? { ...s, is_active } : s)),
  };
}

export function patchRowImageInState(
  state: AdminTaxonomyState,
  kind: "category" | "topic" | "subtopic",
  id: string,
  image_url: string
): AdminTaxonomyState {
  if (kind === "category") {
    return {
      ...state,
      categories: state.categories.map((c) => (c.id === id ? { ...c, image_url } : c)),
    };
  }
  if (kind === "topic") {
    return {
      ...state,
      topics: state.topics.map((t) => (t.id === id ? { ...t, image_url } : t)),
    };
  }
  return {
    ...state,
    subtopics: state.subtopics.map((s) => (s.id === id ? { ...s, image_url } : s)),
  };
}
