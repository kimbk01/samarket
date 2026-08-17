import { describe, expect, it } from "vitest";
import { resolveTradeComposition } from "@/lib/trade/category-form/resolve-composition";
import {
  filterTradePersistMetaByComposition,
  resolveUsedCarWriteTradeMode,
} from "@/lib/trade/category-form/filter-persist-meta-by-composition";

describe("filterTradePersistMetaByComposition", () => {
  it("strips overlay-inactive used-car fields and keeps shell/policy keys", () => {
    const composition = resolveTradeComposition({
      icon_key: "used-car",
      slug: "used-car",
      fieldComposition: {
        v: 1,
        fields: [
          { id: "car_trade", active: true, required: true, order: 1 },
          { id: "make", active: true, required: true, order: 2 },
          { id: "model", active: true, required: true, order: 3 },
          { id: "mileage", active: false, required: false, order: 4 },
          { id: "year", active: false, required: false, order: 5 },
        ],
      },
    });
    const filtered = filterTradePersistMetaByComposition(
      {
        car_trade: "sell",
        car_model: "Honda Civic",
        mileage: "12000",
        car_year: "2018",
        car_year_max: "2018",
        trade_chat_call_policy: "chat_only",
        trade_meet_spot: { lat: 1 },
      },
      composition
    );
    expect(filtered.car_trade).toBe("sell");
    expect(filtered.car_model).toBe("Honda Civic");
    expect(filtered.mileage).toBeUndefined();
    expect(filtered.car_year).toBeUndefined();
    expect(filtered.car_year_max).toBeUndefined();
    expect(filtered.trade_chat_call_policy).toBe("chat_only");
    expect(filtered.trade_meet_spot).toEqual({ lat: 1 });
  });

  it("treats used-car as sell when car_trade is not in composition", () => {
    expect(resolveUsedCarWriteTradeMode(new Set(["make", "model"]), null)).toBe("sell");
    expect(resolveUsedCarWriteTradeMode(new Set(["make", "model"]), "buy")).toBe("sell");
    expect(resolveUsedCarWriteTradeMode(new Set(["car_trade", "make"]), "buy")).toBe("buy");
    expect(resolveUsedCarWriteTradeMode(new Set(["car_trade"]), null)).toBeNull();
  });
});
