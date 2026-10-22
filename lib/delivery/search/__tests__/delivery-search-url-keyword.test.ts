/**
 * DSC-08 — 검색 페이지는 `?q=` 로 검색어를 읽고(뒤로가기 복원) 확정 검색어를 `?q=` 에 기록한다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDeliverySearchHrefWithKeyword,
  readDeliverySearchKeywordFromParams,
} from "@/lib/delivery/search/delivery-search-url-keyword";

describe("DSC-08 delivery search keyword ↔ ?q=", () => {
  it("reads and normalizes the keyword from the URL (back navigation origin)", () => {
    // 매장 진입 origin = `/stores/search?q=${encodeURIComponent(keyword)}`
    const origin = `/stores/search?q=${encodeURIComponent("  치킨   피자 ")}`;
    const params = new URL(origin, "https://x.test").searchParams;
    expect(readDeliverySearchKeywordFromParams(params)).toBe("치킨 피자");
    expect(readDeliverySearchKeywordFromParams(new URLSearchParams())).toBe("");
    expect(readDeliverySearchKeywordFromParams(null)).toBe("");
  });

  it("writes the settled keyword to ?q= and round-trips", () => {
    const href = buildDeliverySearchHrefWithKeyword("https://x.test/stores/search", "chicken wings");
    expect(href).not.toBeNull();
    const back = new URL(href!, "https://x.test").searchParams;
    expect(readDeliverySearchKeywordFromParams(back)).toBe("chicken wings");
  });

  it("no-op when unchanged; clears q when keyword is empty; keeps other params", () => {
    expect(buildDeliverySearchHrefWithKeyword("https://x.test/stores/search?q=pizza", "pizza")).toBeNull();
    expect(buildDeliverySearchHrefWithKeyword("https://x.test/stores/search?q=pizza&ref=home", "")).toBe(
      "/stores/search?ref=home"
    );
  });

  it("DeliverySearchPage seeds keyword state from useSearchParams and writes it back", () => {
    const src = readFileSync("components/delivery/search/DeliverySearchPage.tsx", "utf8");
    expect(src).toContain("const urlQ = readDeliverySearchKeywordFromParams(searchParams);");
    expect(src).toContain("const [q, setQ] = useState(urlQ);");
    expect(src).toContain("const [debouncedQ, setDebouncedQ] = useState(urlQ);");
    expect(src).toContain("buildDeliverySearchHrefWithKeyword(window.location.href, debouncedQ)");
  });
});
