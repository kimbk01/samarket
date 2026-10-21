import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCallSessionGetRateLimitKey } from "@/lib/community-messenger/server/call-session-get-rate-limit-key";

describe("C-12 — 세션 GET 제한 키 = 사용자 + 세션", () => {
  it("세션마다 다른 키", () => {
    const a = buildCallSessionGetRateLimitKey("user:u1", "s1");
    const b = buildCallSessionGetRateLimitKey("user:u1", "s2");
    expect(a).toBe("community-messenger:call-session-get:user:u1:session:s1");
    expect(a).not.toBe(b);
    expect(buildCallSessionGetRateLimitKey("user:u1", " ")).toContain(":session:unknown");
  });

  it("GET 라우트가 사용자+세션 키를 쓴다", () => {
    const src = readFileSync(
      path.join(process.cwd(), "app/api/community-messenger/calls/sessions/[sessionId]/route.ts"),
      "utf8",
    );
    expect(src).toContain("buildCallSessionGetRateLimitKey(getRateLimitKey(req, auth.userId), sessionId)");
  });
});
