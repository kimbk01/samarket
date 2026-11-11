/**
 * D1 F2 (2026-11-12 Bugbot 지적 확인): 커뮤니티 피드 글 칸 content-visibility 는 칸 밖 그림자를 자른다.
 * 칸을 카드 그림자(--cm-shadow-card, 최대 4px)만큼 넓혀 두는 계약 — 빠지면 카드 그림자가 다시 잘린다.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("커뮤니티 피드 글 칸 content-visibility", () => {
  it("칸은 그림자만큼 넓히고(음수 여백 + 같은 안쪽 여백) 칸 높이 추정은 165px", () => {
    const css = read("app/samarket-components.css");
    expect(css).toMatch(
      /\[data-community-feed-cv-row\]\s*\{\s*content-visibility:\s*auto;\s*contain-intrinsic-size:\s*auto 165px;\s*margin:\s*-4px;\s*padding:\s*4px;\s*\}/
    );
  });

  it("카드 그림자는 4px 안 — 바뀌면 칸 여백도 같이 바꿔야 한다", () => {
    const tokens = read("lib/community/community-design-tokens.css");
    expect(tokens).toMatch(/--cm-shadow-card:\s*0 1px 3px rgba\(0, 0, 0, 0\.06\);/);
  });

  it("칸은 flow-root 인 <li> 안의 감싸기 — 음수 여백이 목록 간격과 겹치지 않게", () => {
    const feed = read("components/community/CommunityFeed.tsx");
    expect(feed).toMatch(/<li className="list-none flow-root">\s*\{[^}]*\}\s*<div data-community-feed-cv-row="">\s*<CommunityCard/);
  });
});
