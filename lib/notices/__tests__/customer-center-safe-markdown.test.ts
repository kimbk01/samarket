import { describe, expect, it } from "vitest";
import {
  excerptCustomerCenterMarkdown,
  insertCustomerCenterMarkdown,
  parseCustomerCenterSafeMarkdown,
} from "@/lib/notices/customer-center-safe-markdown";

describe("customer-center-safe-markdown", () => {
  it("keeps plain text as paragraph", () => {
    const blocks = parseCustomerCenterSafeMarkdown("hello world");
    expect(blocks).toEqual([{ type: "p", text: "hello world" }]);
  });

  it("parses heading bold list quote link image", () => {
    const md = [
      "## Title",
      "hello **bold** and *italic*",
      "- a",
      "- b",
      "> q",
      "[ok](https://example.com)",
      "![alt](https://example.com/x.png)",
    ].join("\n");
    const blocks = parseCustomerCenterSafeMarkdown(md);
    expect(blocks.some((b) => b.type === "h2")).toBe(true);
    expect(blocks.some((b) => b.type === "ul")).toBe(true);
    expect(blocks.some((b) => b.type === "quote")).toBe(true);
    expect(blocks.some((b) => b.type === "image")).toBe(true);
  });

  it("blocks javascript urls and raw html execution paths", () => {
    const blocks = parseCustomerCenterSafeMarkdown(
      ['[bad](javascript:alert(1))', '<script>alert(1)</script>', '<iframe src="x"></iframe>'].join(
        "\n"
      )
    );
    expect(blocks.some((b) => b.type === "html_blocked")).toBe(true);
    const p = blocks.find((b) => b.type === "p");
    expect(p && p.type === "p" ? p.text.includes("bad") : false).toBe(true);
  });

  it("excerpt strips markdown syntax", () => {
    const ex = excerptCustomerCenterMarkdown(
      "## Hello\n**bold** ![x](https://a.com/x.png) [t](https://a.com) more"
    );
    expect(ex.includes("##")).toBe(false);
    expect(ex.includes("**")).toBe(false);
    expect(ex.includes("![")).toBe(false);
    expect(ex.includes("](")).toBe(false);
    expect(ex.includes("Hello")).toBe(true);
    expect(ex.includes("bold")).toBe(true);
  });

  it("excerpt strips doubled heading markers and orphan asterisks", () => {
    const ex = excerptCustomerCenterMarkdown("**\n## ## OPSUX heading\nmore");
    expect(ex.includes("##")).toBe(false);
    expect(ex.includes("**")).toBe(false);
    expect(ex.includes("OPSUX")).toBe(true);
  });

  it("h2 strips leftover leading hashes in title text", () => {
    const blocks = parseCustomerCenterSafeMarkdown("## ## OPSUX heading");
    expect(blocks[0]).toEqual({ type: "h2", text: "OPSUX heading" });
  });

  it("insert wraps selection", () => {
    const r = insertCustomerCenterMarkdown("abc", 0, 3, "bold");
    expect(r.next).toBe("**abc**");
  });
});
