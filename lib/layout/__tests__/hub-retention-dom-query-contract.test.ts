import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * D1 P3 (Owner 승인 2026-11-11 · docs/audit/d1-remaining-root-cause-design-2026-11-11.md §3)
 * 허브 화면 보관대(`HubRetentionStack`)는 숨긴 허브 화면을 DOM 에 남긴다(`display:none`).
 * 허브 화면 코드가 `document.querySelector` 등 **문서 전체** 조회를 쓰면 숨긴 허브 안 요소를 잡을 수 있다 →
 * 새로 쓰지 않는다(자기 요소는 ref 또는 자기 루트 기준 조회). 아래 기준 목록은 2026-11-11 전수 조사에서
 * 숨긴 허브와 무관하다고 확인한 기존 사용처(허브가 아닌 상세·편집 화면)다. 늘리려면 같은 조사를 거쳐 여기에 추가한다.
 */
const ROOT = join(__dirname, "../../..");
const HUB_DIRS = [
  "components/home-hub",
  "components/home",
  "components/community",
  "components/philife",
  "components/stores/home",
  "components/stores/browse",
  "components/mypage",
  "components/my",
  "components/trade",
  "app/(main)/home",
  "app/(main)/philife",
  "app/(main)/stores",
  "app/(main)/mypage",
  "app/(main)/market",
  "app/(main)/my",
];
const BASELINE: Record<string, number> = {
  "components/community/post-detail/CommunityCommentItem.tsx": 1,
  "components/community/post-detail/CommunityCommentSection.tsx": 1,
  "components/mypage/MyStoreOrdersView.tsx": 1,
  "components/my/edit/ProfileEditForm.tsx": 2,
  "components/trade/TradeMarketProductCompositionHost.tsx": 2,
  "app/(main)/mypage/ads/apply/MyAdsApplyPageClient.tsx": 1,
};
const GLOBAL_QUERY = /document\.(querySelector|querySelectorAll|getElementById|getElementsByClassName)\(/g;

function walk(dir: string, out: string[]) {
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const n of names) {
    const p = join(dir, n);
    if (n === "__tests__" || n === "node_modules") continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(n)) out.push(p);
  }
}

describe("D1 P3 — 허브 화면 코드의 문서 전체 조회 금지", () => {
  it("기준 목록 밖 신규 사용 0", () => {
    const files: string[] = [];
    for (const d of HUB_DIRS) walk(join(ROOT, d), files);
    const found: Record<string, number> = {};
    for (const f of files) {
      const n = (readFileSync(f, "utf8").match(GLOBAL_QUERY) ?? []).length;
      if (n > 0) found[relative(ROOT, f)] = n;
    }
    const over = Object.entries(found)
      .filter(([f, n]) => n > (BASELINE[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} (기준 ${BASELINE[f] ?? 0})`);
    expect(over).toEqual([]);
  });
});
