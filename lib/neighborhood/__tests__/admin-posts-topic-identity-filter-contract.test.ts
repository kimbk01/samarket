import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../..");

describe("admin community posts topic identity filter", () => {
  it("filters by topic_slug only; category query is alias not enum column", () => {
    const src = readFileSync(
      join(root, "app/api/admin/community/engine/posts/route.ts"),
      "utf8"
    );
    expect(src).toContain('q.eq("topic_slug", topicFilter)');
    expect(src).not.toMatch(/else if \(category\)\s*q\s*=\s*q\.eq\("category"/);
    expect(src).toContain("legacy alias for topic slug");
  });
});
