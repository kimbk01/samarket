import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommunityMessengerCallActionButton } from "@/components/community-messenger/call-history/CommunityMessengerCallActionButton";

/** P4 C2 (Owner 「C1·C2만 승인」 2026-11-22) — 다시 걸기 버튼 대기 = DIBAY 스피너 단일 정의, 누름 막힘·라벨 무변경 */
describe("CommunityMessengerCallActionButton loading", () => {
  it("loading = DIBAY 12점 링(장식) · 버튼 비활성 · 라벨 유지", () => {
    const html = renderToStaticMarkup(
      <CommunityMessengerCallActionButton kind="voice" onPress={() => undefined} loading ariaLabel="다시 걸기" />
    );
    expect(html).toContain("sam-spinner");
    expect(html.match(/sam-spinner__dot/g)?.length).toBe(12);
    expect(html).not.toContain("animate-spin");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-label="다시 걸기"');
  });
  it("loading 아님 = 예전 아이콘 그대로(스피너 없음)", () => {
    const html = renderToStaticMarkup(
      <CommunityMessengerCallActionButton kind="video" onPress={() => undefined} ariaLabel="다시 걸기" />
    );
    expect(html).not.toContain("sam-spinner");
  });
});
