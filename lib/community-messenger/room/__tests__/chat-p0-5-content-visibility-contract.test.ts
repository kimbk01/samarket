/**
 * 채팅 P0-5 계약 (Owner 「P0-5 승인」 2026-11-11 · docs/audit/messenger-p0-structural-audit-design-2026-11-11.md §8):
 * 화면 밖 행 스타일·그리기 건너뛰기는 「한 번 실제 크기로 그린 뒤」에만 — 추정 높이로 건너뛰지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MESSENGER_TIMELINE_VIRTUAL_MIN_MESSAGES } from "@/lib/community-messenger/room/messenger-room-timeline-paint-model";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("채팅 P0-5 content-visibility", () => {
  const css = read("app/samarket-components.css");
  const row = read("components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx");

  it("content-visibility 는 data-cm-cv(그린 뒤 표식) 행에만, 강조 중(data-cm-cv-off)은 제외", () => {
    expect(css).toMatch(/\[data-cm-timeline-message-row\]\[data-cm-cv\]:not\(\[data-cm-cv-off\]\)\s*\{\s*content-visibility:\s*auto;/);
    const plain = css.replace(/\[data-cm-cv\]:not\(\[data-cm-cv-off\]\)\s*\{\s*content-visibility:\s*auto;/, "");
    expect(plain).not.toMatch(/content-visibility:\s*auto/);
  });

  it("모든 행이 실제 높이를 기억(contain-intrinsic-block-size: auto)", () => {
    expect(css).toMatch(/contain-intrinsic-block-size:\s*auto\s+\d+px/);
  });

  it("표식은 direct 행에서 2프레임 뒤(실제 레이아웃 뒤)에 붙인다", () => {
    expect(row).toMatch(/if \(!directLayout\) return;[\s\S]{0,300}requestAnimationFrame\(\(\) => \{\s*raf2 = window\.requestAnimationFrame\(\(\) => \{\s*el\.setAttribute\("data-cm-cv", ""\);/);
    expect(row).toMatch(/data-cm-cv-off=\{longPressVisualActive \|\| timelineHighlightMessageId === item\.id/);
  });

  it("가상 스크롤 기준은 바꾸지 않는다(65406ec 빈칸 회귀 방지)", () => {
    expect(MESSENGER_TIMELINE_VIRTUAL_MIN_MESSAGES).toBe(2501);
  });
});
