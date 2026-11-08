import { describe, expect, it } from "vitest";
import { catalogPair } from "@/lib/i18n/catalog-pair";

describe("catalogPair", () => {
  it("카탈로그 ko·en 값을 그대로 담는다", () => {
    expect(catalogPair("common_confirm")).toEqual({ ko: "확인", en: "Confirm" });
  });
});
