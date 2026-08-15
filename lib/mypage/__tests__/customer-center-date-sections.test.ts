import { describe, expect, it } from "vitest";
import { groupCustomerCenterItemsByDate } from "@/lib/mypage/customer-center-date-sections";

describe("groupCustomerCenterItemsByDate", () => {
  it("groups by local day newest first", () => {
    const sections = groupCustomerCenterItemsByDate(
      [
        { createdAt: "2026-08-12T10:00:00+08:00", id: "a" },
        { createdAt: "2026-08-12T12:00:00+08:00", id: "b" },
        { createdAt: "2026-08-11T09:00:00+08:00", id: "c" },
      ],
      "ko"
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]?.items.map((x) => x.id)).toEqual(["a", "b"]);
    expect(sections[1]?.items.map((x) => x.id)).toEqual(["c"]);
    expect(sections[0]?.sectionLabel.length).toBeGreaterThan(0);
  });
});
