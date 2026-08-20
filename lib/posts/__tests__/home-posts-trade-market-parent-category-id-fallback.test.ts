import { describe, expect, it } from "vitest";
import { loadHomePostsPage } from "@/lib/posts/home-posts-query-server";

function makeSb(calls: string[]) {
  return {
    from() {
      return {
        select() {
          const url = new URL("https://example.test/rest/v1/posts");
          const q: Record<string, unknown> = { url };
          const self = () => q;
          q.or = self;
          q.not = self;
          q.eq = self;
          q.ilike = self;
          q.gte = self;
          q.lte = self;
          q.order = self;
          q.range = async () => {
            const and = url.searchParams.get("and") ?? "";
            calls.push(and);
            return {
              error: null,
              data: [
                {
                  id: "veh-1",
                  user_id: "u1",
                  type: "trade",
                  trade_category_id: "vehicle-root",
                  title: "SUV listing",
                  price: 250000,
                  status: "active",
                  images: [],
                  meta: { car_body_type: "suv" },
                },
              ],
            };
          };
          return q;
        },
      };
    },
  };
}

describe("HOME tradeMarketParent category filter", () => {
  it("filters trade_category_id only — does not query missing posts.category_id", async () => {
    const calls: string[] = [];
    const pack = await loadHomePostsPage(
      makeSb(calls) as never,
      "posts",
      0,
      "latest",
      null,
      ["vehicle-root"],
      "status.is.null,status.not.in.(hidden,sold)"
    );
    expect(calls.some((and) => and.includes(",category_id.in") || and.includes("(category_id.in"))).toBe(
      false
    );
    expect(
      calls.some(
        (and) =>
          and.includes("trade_category_id.in") &&
          !and.includes(",category_id.in") &&
          !and.includes("(category_id.in")
      )
    ).toBe(true);
    expect(pack?.posts.map((p) => p.id)).toEqual(["veh-1"]);
  });

  it("does not apply category and-group when parent ids are absent", async () => {
    const calls: string[] = [];
    const pack = await loadHomePostsPage(
      makeSb(calls) as never,
      "posts",
      0,
      "latest",
      null,
      null,
      "status.is.null,status.not.in.(hidden,sold)"
    );
    expect(calls.every((and) => and === "")).toBe(true);
    expect(pack?.posts).toHaveLength(1);
  });
});
