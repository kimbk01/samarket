import { describe, expect, it, vi } from "vitest";

vi.mock("../../community/community-import-principal", () => ({
  loadCommunityImportPrincipalUserId: vi.fn(async () => "principal-user-id"),
}));

import { writeExternalImportCommunityPost } from "../publish/community-write";

describe("external-import date SSOT", () => {
  it("writes DIBAY published_at=now and display_date=source", async () => {
    const inserted: Record<string, unknown>[] = [];
    const sb = {
      from(table: string) {
        if (table !== "community_posts") {
          return {
            insert: async () => ({ error: null }),
            delete: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        return {
          insert(payload: Record<string, unknown>) {
            inserted.push(payload);
            return {
              select() {
                return {
                  single: async () => ({ data: { id: "post-1" }, error: null }),
                };
              },
            };
          },
        };
      },
    };

    const before = Date.now();
    await writeExternalImportCommunityPost(sb as never, {
      title: "t",
      content: "body text",
      images: [],
      topicId: "topic-1",
      topicSlug: "info",
      displayAuthorName: "Author",
      sourcePublishedAtIso: "2022-05-26T08:11:57.000Z",
    });
    const after = Date.now();

    expect(inserted).toHaveLength(1);
    const row = inserted[0];
    expect(row.display_date).toBe("2022-05-26T08:11:57.000Z");
    const pub = Date.parse(String(row.published_at));
    expect(pub).toBeGreaterThanOrEqual(before - 1000);
    expect(pub).toBeLessThanOrEqual(after + 1000);
    expect(String(row.published_at)).not.toBe("2022-05-26T08:11:57.000Z");
  });
});
