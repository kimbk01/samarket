import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const feed = readFileSync(resolve(process.cwd(), "components/community/CommunityFeed.tsx"), "utf8");
const market = readFileSync(resolve(process.cwd(), "components/market/MarketCategoryFeed.tsx"), "utf8");

function block(src: string, start: string, end: string): string {
  const i = src.indexOf(start);
  expect(i, `missing: ${start}`).toBeGreaterThanOrEqual(0);
  const j = src.indexOf(end, i + start.length);
  expect(j, `missing end: ${end}`).toBeGreaterThan(i);
  return src.slice(i, j);
}

describe("커뮤니티 주제 스와이프 — 1 동작 = 1 이동 = 1 진입", () => {
  it("applyNavSelection: 같은 선택 무요청, URL 단일 경로(history.replaceState), category state 직접 변경 없음", () => {
    const body = block(feed, "const applyNavSelection = useCallback(", "\n  );\n");
    expect(body).toContain("if (isSameCommunityNavSelection(sel, navSelection)) return false;");
    expect(body).toContain("window.history.replaceState(null, \"\", target);");
    expect(body).not.toContain("router.replace");
    expect(body).not.toContain("setCategory(");
  });

  it("URL → 표면 동기화 effect 는 URL 의 주제를 기준으로 판단 (state 비교로 같은 목적지 재요청 없음)", () => {
    /** D1 S2 (2026-11-12): 숨긴 허브에서는 주소를 바꾸지 않도록 허브 활성 신호가 deps 맨 앞에 들어감 */
    const body = block(feed, "const urlTopicSurfaceSlug =", "  }, [\n    hubActive,\n    topicAuthorityReady,\n    urlTopicSurfaceSlug,");
    expect(body).toContain("resolveCommunityFeedSurface(plan.category, \"topic\")");
    expect(body).toContain("if (plan.category === urlTopicSurfaceSlug) return;");
    expect(body).not.toContain("feedAdSurface");
  });

  it("스와이프 패널은 settle 모드 — 목적지 콘텐츠 key 로 진입, 스와이프 이동은 탭 진입 애니메이션 생략", () => {
    expect(feed).toMatch(/useMobileHorizontalSwipePanel\(\{[\s\S]*?settleKey: settledFeedContentKey,[\s\S]*?\}\);/);
    const panelEffect = block(feed, "const fromSwipe = swipeNavKeyRef.current === key;", "}, [navSelection.kind, navSelection.topicSlug]);");
    expect(panelEffect).toContain("swipeNavKeyRef.current = null;");
    expect(panelEffect).toContain("if (fromSwipe) return;");
  });

  it("다른 주제의 행은 새 주제 key 로 그려지지 않는다 (콘텐츠 key 소유)", () => {
    expect(feed).toContain("const rowsBelongToQuery = postsContentKeyRef.current === feedContentKey;");
    expect(feed).toMatch(/setSettledFeedContentKey\(feedContentKey\)/);
  });

  it("거래 스와이프는 기존(legacy) 경로 유지 — settleKey 미전달", () => {
    expect(market).toContain("useMobileHorizontalSwipePanel(");
    expect(market).not.toContain("settleKey");
  });
});
