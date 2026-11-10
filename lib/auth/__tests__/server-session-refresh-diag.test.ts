import { describe, expect, it } from "vitest";
import { buildServerSessionRefreshDiag } from "@/lib/auth/server-session-refresh-diag";

function fakeTokenCookie(expSec: number) {
  const payload = Buffer.from(JSON.stringify({ sub: "u", exp: expSec })).toString("base64url");
  const jwt = `x.${payload}.y`;
  const session = JSON.stringify({ access_token: jwt, expires_at: expSec, refresh_token: "r" });
  return { name: "sb-abc-auth-token", value: `base64-${Buffer.from(session).toString("base64url")}` };
}

describe("server-session-refresh-diag (진단 전용)", () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";

  it("세션 쿠키를 쓰지 않으면 기록하지 않는다", async () => {
    const row = await buildServerSessionRefreshDiag({
      component: "proxy",
      requestCookies: [],
      cookiesToSet: [{ name: "other", value: "1" }],
    });
    expect(row).toBeNull();
  });

  it("갱신(값 있음)이면 구성요소·남은 초·요청 종류만 기록하고 토큰·값은 남기지 않는다", async () => {
    const now = 1_800_000_000_000;
    const row = await buildServerSessionRefreshDiag({
      component: "route_or_rsc",
      requestCookies: [fakeTokenCookie(now / 1000 - 30)],
      cookiesToSet: [{ name: "sb-abc-auth-token", value: "base64-NEW" }],
      headers: new Headers({ rsc: "1", "sec-fetch-dest": "empty" }),
      nowMs: now,
    });
    expect(row).toMatchObject({
      component: "route_or_rsc",
      write: "set",
      prevToken: true,
      prevTokenRemainSec: -30,
      rsc: "1",
      secFetchDest: "empty",
    });
    expect(JSON.stringify(row)).not.toMatch(/NEW|base64-|refresh_token|"sub"/);
  });

  it("비우기(로그아웃)는 clear 로 구분한다", async () => {
    const row = await buildServerSessionRefreshDiag({
      component: "proxy",
      requestCookies: [],
      cookiesToSet: [{ name: "sb-abc-auth-token.0", value: "" }],
    });
    expect(row).toMatchObject({ write: "clear", prevToken: false });
  });

  if (prevUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
});
