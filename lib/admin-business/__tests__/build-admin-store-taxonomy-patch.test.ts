import { describe, expect, it } from "vitest";
import { buildStoreTaxonomyPatch } from "@/lib/stores/build-store-taxonomy-patch";

function mockSb(handlers: {
  category?: { id: string } | null;
  topic?: { store_category_id: string } | null;
}) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  if (table === "store_categories") {
                    return { data: handlers.category ?? null, error: null };
                  }
                  if (table === "store_topics") {
                    return { data: handlers.topic ?? null, error: null };
                  }
                  return { data: null, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as any;
}

describe("buildStoreTaxonomyPatch (shared Owner+Admin)", () => {
  it("rejects invalid uuid", async () => {
    const res = await buildStoreTaxonomyPatch(mockSb({}), {
      currentCategoryId: null,
      currentTopicId: null,
      store_category_id: "not-a-uuid",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_store_category_id");
  });

  it("assigns matching category+topic", async () => {
    const cat = "11111111-1111-4111-8111-111111111111";
    const topic = "22222222-2222-4222-8222-222222222222";
    const res = await buildStoreTaxonomyPatch(
      mockSb({ category: { id: cat }, topic: { store_category_id: cat } }),
      {
        currentCategoryId: null,
        currentTopicId: null,
        store_category_id: cat,
        store_topic_id: topic,
      }
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch.store_category_id).toBe(cat);
      expect(res.patch.store_topic_id).toBe(topic);
    }
  });

  it("rejects topic/category mismatch", async () => {
    const cat = "11111111-1111-4111-8111-111111111111";
    const other = "33333333-3333-4333-8333-333333333333";
    const topic = "22222222-2222-4222-8222-222222222222";
    const res = await buildStoreTaxonomyPatch(
      mockSb({ category: { id: cat }, topic: { store_category_id: other } }),
      {
        currentCategoryId: null,
        currentTopicId: null,
        store_category_id: cat,
        store_topic_id: topic,
      }
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("store_topic_category_mismatch");
  });
});
