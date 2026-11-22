import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTradeBehaviorAdapter } from "../behavior-adapters";
import { realEstateDealPersistScope } from "../real-estate-deal-persist-scope";
import { resolveTradeComposition } from "../resolve-composition";

describe("감사 R1·R2 — 부동산 거래 유형별 저장 범위", () => {
  it("판매: 매매가만 저장, 임대 칸은 저장하지 않음", () => {
    expect(realEstateDealPersistScope("판매")).toEqual({ rentFields: false, salePrice: true });
  });

  it("임대: 보증금·월세만 저장, 매매가는 저장하지 않음", () => {
    expect(realEstateDealPersistScope("임대")).toEqual({ rentFields: true, salePrice: false });
  });

  it("유형 미선택(예전 글): 둘 다 유지", () => {
    expect(realEstateDealPersistScope("")).toEqual({ rentFields: true, salePrice: true });
    expect(realEstateDealPersistScope(null)).toEqual({ rentFields: true, salePrice: true });
  });

  it("화면 표시 규칙(adaptRealEstate)과 같은 기준", () => {
    const composition = resolveTradeComposition({ icon_key: "real-estate", slug: "property", fieldComposition: null });
    for (const deal of ["판매", "임대"]) {
      const adapted = applyTradeBehaviorAdapter(composition, { dealType: deal });
      const visible = (id: string) => adapted.find((f) => f.id === id)?.visible === true;
      const scope = realEstateDealPersistScope(deal);
      expect(visible("price")).toBe(scope.salePrice);
      expect(visible("deposit")).toBe(scope.rentFields);
      expect(visible("monthly")).toBe(scope.rentFields);
    }
  });

  it("글쓰기 폼이 저장 범위를 실제로 사용", () => {
    const src = readFileSync(join(process.cwd(), "components/write/trade/TradeWriteForm.tsx"), "utf8");
    expect(src).toContain("realEstateDealPersistScope(v.dealType).rentFields");
    expect(src).toContain("!realEstateDealPersistScope(dealType).salePrice");
  });
});

describe("감사 G1 — 나눔이면 구성의 가격 필수를 적용하지 않음", () => {
  it("구성 가격 오류는 가격 칸이 보일 때만 반영", () => {
    const src = readFileSync(join(process.cwd(), "components/write/trade/TradeWriteForm.tsx"), "utf8");
    expect(src).toContain("if (compErrs.price && !next.price && hasPrice && !effectiveFreeShare) next.price = compErrs.price;");
  });
});
