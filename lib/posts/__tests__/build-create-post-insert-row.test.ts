import { describe, expect, it } from "vitest";
import { buildCreatePostInsertRow } from "@/lib/posts/build-create-post-insert-row";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-06-08T12:00:00.000Z";

describe("buildCreatePostInsertRow", () => {
  it("sets user_id from server argument, not payload", () => {
    const row = buildCreatePostInsertRow(
      {
        type: "trade",
        categoryId: CATEGORY_ID,
        title: "제목",
        content: "본문",
      },
      USER_ID,
      NOW
    );
    expect(row.user_id).toBe(USER_ID);
    expect(row.trade_category_id).toBe(CATEGORY_ID);
    expect(row.title).toBe("제목");
    expect(row.content).toBe("본문");
    expect(row.status).toBe("active");
    expect(row.view_count).toBe(0);
    expect(row.created_at).toBe(NOW);
    expect(row.updated_at).toBe(NOW);
  });

  it("maps trade fields including job columns", () => {
    const row = buildCreatePostInsertRow(
      {
        type: "trade",
        categoryId: CATEGORY_ID,
        title: "일자리",
        content: "설명",
        price: 1000,
        isFreeShare: true,
        isPriceOfferEnabled: true,
        region: "r1",
        city: "c1",
        imageUrls: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
        meta: { skin: "job" },
        tradeJob: {
          jobEmploymentType: "full_time",
          jobCategory: "retail",
          payType: "hourly",
          payAmount: 500,
          workStartDate: "2026-07-01",
          workEndDate: null,
          workDays: ["mon"],
          workStartTime: "09:00",
          workEndTime: "18:00",
          headcount: 2,
          experienceRequired: "none",
        },
      },
      USER_ID,
      NOW
    );
    expect(row.price).toBe(1000);
    expect(row.is_free_share).toBe(true);
    expect(row.is_price_offer).toBe(true);
    expect(row.region).toBe("r1");
    expect(row.city).toBe("c1");
    expect(row.images).toEqual(["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"]);
    expect(row.thumbnail_url).toBe("https://cdn.example/a.jpg");
    expect(row.meta).toEqual({ skin: "job" });
    expect(row.trade_type).toBe("job");
    expect(row.job_employment_type).toBe("full_time");
    expect(row.pay_amount).toBe(500);
    expect(row.headcount).toBe(2);
  });

  it("maps service region and city", () => {
    const row = buildCreatePostInsertRow(
      {
        type: "service",
        categoryId: CATEGORY_ID,
        title: "서비스",
        content: "요청",
        region: "r2",
        city: "c2",
      },
      USER_ID,
      NOW
    );
    expect(row.region).toBe("r2");
    expect(row.city).toBe("c2");
    expect(row.price).toBeUndefined();
  });
});
