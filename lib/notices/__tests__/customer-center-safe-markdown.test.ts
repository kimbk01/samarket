import { describe, expect, it } from "vitest";
import {
  customerCenterPlainExcerpt,
  insertCustomerCenterMarkdown,
  sanitizeCustomerCenterMarkdownHref,
  sanitizeCustomerCenterMarkdownImageSrc,
} from "@/lib/notices/customer-center-safe-markdown";

describe("customer-center-safe-markdown", () => {
  it("keeps plain text excerpt readable", () => {
    expect(customerCenterPlainExcerpt("안녕하세요.\n서비스 점검입니다.")).toBe(
      "안녕하세요. 서비스 점검입니다."
    );
  });

  it("strips markdown tokens from list excerpt", () => {
    const body = `## 여름 특별 이벤트\n\n**최대 20% 할인**\n\n![event](https://example.com/a.jpg)\n\n이번 주 DIBAY`;
    const ex = customerCenterPlainExcerpt(body);
    expect(ex).not.toMatch(/##|\*\*|!\[/);
    expect(ex).toContain("여름 특별 이벤트");
    expect(ex).toContain("최대 20% 할인");
  });

  it("blocks javascript and unsafe protocols", () => {
    expect(sanitizeCustomerCenterMarkdownHref("javascript:alert(1)")).toBeNull();
    expect(sanitizeCustomerCenterMarkdownHref("https://ok.example/x")).toBe("https://ok.example/x");
    expect(sanitizeCustomerCenterMarkdownHref("/mypage/customer-center/notice/1")).toBe(
      "/mypage/customer-center/notice/1"
    );
    expect(sanitizeCustomerCenterMarkdownImageSrc("javascript:alert(1)")).toBeNull();
    expect(sanitizeCustomerCenterMarkdownImageSrc("https://cdn.example/a.png")).toContain("https://");
  });

  it("inserts bold and image markdown", () => {
    const bold = insertCustomerCenterMarkdown("hello", 0, 5, "bold");
    expect(bold.next).toBe("**hello**");
    const img = insertCustomerCenterMarkdown("", 0, 0, "image", {
      url: "https://cdn.example/x.jpg",
      alt: "pic",
    });
    expect(img.next).toContain("![pic](https://cdn.example/x.jpg)");
  });

  it("rejects unsafe link insert", () => {
    const bad = insertCustomerCenterMarkdown("x", 0, 1, "link", { url: "javascript:alert(1)" });
    expect(bad.next).toBe("x");
  });
});
