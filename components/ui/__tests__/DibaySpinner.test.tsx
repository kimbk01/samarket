import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DibayPendingSpinner, DibaySpinner } from "@/components/ui/DibaySpinner";

describe("DibaySpinner — DIBAY 스피너 단일 정의", () => {
  it("12점 링 · 크기·색 클래스 · 회전", () => {
    const html = renderToStaticMarkup(<DibaySpinner size="lg" tone="inverse" />);
    expect(html.match(/sam-spinner__dot/g)?.length).toBe(12);
    expect(html).toContain("sam-spinner--lg");
    expect(html).toContain("sam-spinner--inverse");
    expect(html).toContain("sam-spinner--spin");
    expect(html).toContain('role="status"');
  });
  it("decorative = 스크린리더에서 숨김(버튼 라벨이 따로 있는 곳)", () => {
    const html = renderToStaticMarkup(<DibaySpinner size="sm" tone="current" decorative />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="status"');
  });
  it("대기 스피너 = 지연 표시 래퍼 + 큰 스피너", () => {
    const html = renderToStaticMarkup(<DibayPendingSpinner layout="block" />);
    expect(html).toContain('data-dibay-pending-spinner="block"');
    expect(html).toContain("sam-spinner-appear");
    expect(html).toContain("sam-spinner--lg");
    expect(html).toContain('aria-busy="true"');
  });
});
