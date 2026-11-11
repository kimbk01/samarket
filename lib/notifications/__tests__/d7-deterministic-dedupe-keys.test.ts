/**
 * 재감사 D-7 (P-9) — 알림 중복 방지 키는 결정적이어야 한다(`Date.now()` 금지).
 * 매장 운영 공지: 작성 1회의 request_id 필수.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("D-7 admin store notice key", () => {
  it("requires request_id and never falls back to Date.now()", () => {
    const src = read("app/api/admin/stores/[id]/notify/route.ts");
    expect(src).not.toContain("Date.now()");
    expect(src).toContain('error: "request_id_required"');
    expect(src).toContain("dedupe = `admin:store_ops_notice:${sid}:${requestId}`");
  });
});
