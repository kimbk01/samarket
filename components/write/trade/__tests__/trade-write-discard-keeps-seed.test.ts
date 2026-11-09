/**
 * GROUP 2-C (Owner 승인 2026-11-10) — 「이어서 쓸까요?」에서 「새로 작성」은 예전 저장 초안만 버리고,
 * 주제 고르기 전 시트에서 넣은 입력(listingChromeSeed: 사진·제목·가격·설명·나눔)은 남긴다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(process.cwd(), "components/write/trade/TradeWriteForm.tsx"), "utf8");
const start = src.indexOf("const handleDiscardPersistedDraft = useCallback(");
const body = src.slice(start, src.indexOf("}, [category.id, editPostId", start));

describe("새로 작성 = 예전 초안만 버림", () => {
  it("시드는 마운트 때 한 번 고정", () => {
    expect(src).toContain("const [mountSeed] = useState(() => ({");
  });
  it("제목·설명·가격·사진을 빈 값이 아닌 마운트 시드로 되돌린다", () => {
    expect(body).toContain("discardTradeWriteStashedDraft(category.id)");
    expect(body).toContain("setTitle(mountSeed.title)");
    expect(body).toContain("setDescription(mountSeed.description)");
    expect(body).toContain("setPrice(mountSeed.price)");
    expect(body).toContain("setImages(mountSeed.images)");
    expect(body).not.toContain('setTitle("")');
    expect(body).not.toContain("setImages([])");
  });
  it("시트에서 고른 나눔도 유지", () => {
    expect(body).toContain("if (mountSeed.freeShare)");
  });
});
