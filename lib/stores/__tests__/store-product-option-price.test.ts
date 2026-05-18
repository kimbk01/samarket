import { describe, expect, it } from "vitest";
import { validateStoreProductRequiredOptions } from "@/lib/stores/product-sheet/validate-store-product-required-options";
import type { ParsedOptionGroup } from "@/lib/stores/modifiers/types";

const quantityAddOnGroup: ParsedOptionGroup = {
  key: "addons",
  label: "추가 메뉴",
  description: "",
  sortOrder: 1,
  inputType: "quantity",
  isRequired: false,
  minSelect: 0,
  maxSelect: 3,
  options: [
    {
      key: "egg",
      name: "계란",
      priceDelta: 20,
      soldOut: false,
      defaultSelected: false,
    },
    {
      key: "rice",
      name: "밥 추가",
      priceDelta: 30,
      soldOut: false,
      defaultSelected: false,
    },
  ],
};

describe("store product option pricing", () => {
  it("adds quantity add-on prices to the per-menu unit price", () => {
    const result = validateStoreProductRequiredOptions(
      [quantityAddOnGroup],
      { pick: {}, qty: { addons: { egg: 2, rice: 1 } } },
      200
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unitDelta).toBe(70);
    expect(result.snapshot.unit_options_delta).toBe(70);
    expect(200 + result.unitDelta).toBe(270);
  });
});
