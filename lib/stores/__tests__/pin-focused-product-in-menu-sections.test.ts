import { describe, expect, it } from "vitest";
import {
  findMenuSectionIndexForProduct,
  pinFocusedProductInMenuSections,
  type MenuSection,
} from "@/lib/stores/group-store-products-by-menu";

const sections: MenuSection[] = [
  {
    heading: "김밥류",
    sectionId: "sec-gimbap",
    items: [
      { id: "p2", title: "오리지날 김밥" } as MenuSection["items"][number],
      { id: "p1", title: "김치김밥" } as MenuSection["items"][number],
    ],
  },
  {
    heading: "면류",
    sectionId: "sec-noodle",
    items: [{ id: "p3", title: "라면" } as MenuSection["items"][number]],
  },
];

describe("pinFocusedProductInMenuSections", () => {
  it("moves focused product to top of its category section", () => {
    const next = pinFocusedProductInMenuSections(sections, "p1");
    expect(next[0]?.items[0]?.id).toBe("p1");
    expect(next[0]?.items[1]?.id).toBe("p2");
    expect(next[1]?.items[0]?.id).toBe("p3");
  });

  it("finds section index for product", () => {
    expect(findMenuSectionIndexForProduct(sections, "p1")).toBe(0);
    expect(findMenuSectionIndexForProduct(sections, "p3")).toBe(1);
    expect(findMenuSectionIndexForProduct(sections, "missing")).toBe(-1);
  });
});
