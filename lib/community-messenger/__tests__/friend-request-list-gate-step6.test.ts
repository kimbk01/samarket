import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 순서 6 — 친구 요청 목록(GET)은 메신저 열람 확인만 (약관·표시명 확인은 친구 추가 POST 에만).
 */
const route = readFileSync(resolve(process.cwd(), "app/api/community-messenger/friend-requests/route.ts"), "utf8");

function handler(name: "GET" | "POST"): string {
  const start = route.indexOf(`export async function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = route.indexOf("export async function", start + 10);
  return route.slice(start, next === -1 ? undefined : next);
}

describe("순서 6 friend-requests 라우트", () => {
  it("GET: 열람 확인만 — 가입·표시명 확인 없음", () => {
    const get = handler("GET");
    expect(get).toContain("requireMessengerOpenAccess(auth.userId)");
    expect(get).not.toContain("gateFriendAddProfile");
    expect(get).toContain("listCommunityMessengerFriendRequests");
  });

  it("POST: 약관 + 표시명 확인 그대로", () => {
    const post = handler("POST");
    expect(post).toContain("gateFriendAddProfile(auth.userId)");
    expect(route).toContain("requireSignupCompleteForUser(sb, userId)");
    expect(route).toContain('requireProfileFieldsForAction(sb, userId, "messenger_add_friend")');
  });
});
