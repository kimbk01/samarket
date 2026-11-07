import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildAppleClientSecret,
  decryptAppleRefreshToken,
  encryptAppleRefreshToken,
  revokeAppleSigninTokenForUser,
  storeAppleSigninRefreshToken,
  type AppleSiwaConfig,
} from "@/lib/auth/native/apple-siwa-token.server";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const CONFIG: AppleSiwaConfig = {
  teamId: "TEAM123456",
  keyId: "KEY1234567",
  privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  clientId: "com.dibay.ph",
};

type Call = { url: string; body: URLSearchParams };

function fakeFetch(responses: Record<string, { ok: boolean; status: number; json?: unknown }>) {
  const calls: Call[] = [];
  const impl = async (url: string, init: { body: string }) => {
    calls.push({ url, body: new URLSearchParams(init.body) });
    const r = responses[url] ?? { ok: false, status: 404 };
    return { ok: r.ok, status: r.status, json: async () => r.json ?? {} };
  };
  return { impl, calls };
}

function fakeSb(initial: Record<string, unknown> | null = null) {
  const state: { row: Record<string, unknown> | null; deleted: boolean; upserts: Record<string, unknown>[] } = {
    row: initial,
    deleted: false,
    upserts: [],
  };
  const sb = {
    from: (table: string) => {
      expect(table).toBe("apple_signin_tokens");
      return {
        upsert: async (row: Record<string, unknown>) => {
          state.upserts.push(row);
          state.row = row;
          return { error: null };
        },
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }) }),
        delete: () => ({
          eq: async () => {
            state.deleted = true;
            state.row = null;
            return { error: null };
          },
        }),
      };
    },
  };
  return { sb: sb as never, state };
}

describe("Sign in with Apple token store/revoke (App Store account deletion)", () => {
  it("client_secret is an ES256 JWT for Apple with the team, key and client id", () => {
    const jwt = buildAppleClientSecret(CONFIG, 1_000_000);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(JSON.parse(Buffer.from(p, "base64url").toString())).toEqual({
      iss: "TEAM123456",
      iat: 1_000_000,
      exp: 1_000_300,
      aud: "https://appleid.apple.com",
      sub: "com.dibay.ph",
    });
    const ok = verify("sha256", Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });

  it("refresh token round-trips through encryption and never stores plaintext", () => {
    const enc = encryptAppleRefreshToken(CONFIG, "r.secret-token");
    expect(enc).not.toContain("secret-token");
    expect(decryptAppleRefreshToken(CONFIG, enc)).toBe("r.secret-token");
    // B-10 (후속 감사 2026-11-08): 끝 글자 바꾸기는 base64url 여분 비트만 바뀌는 경우(끝 글자 'A', 약 6.5%)가 있어
    // 위조가 되지 않았다 — 마지막 조각을 바이트로 풀어 첫 바이트를 실제로 뒤집는다.
    const parts = enc.split(".");
    const last = Buffer.from(parts[parts.length - 1]!, "base64url");
    last[0] = last[0]! ^ 0x01;
    parts[parts.length - 1] = last.toString("base64url");
    expect(decryptAppleRefreshToken(CONFIG, parts.join("."))).toBeNull();
  });

  it("does nothing when the Apple key is not configured (login unaffected)", async () => {
    const { sb, state } = fakeSb();
    const f = fakeFetch({});
    const r = await storeAppleSigninRefreshToken(sb, { userId: "u1", authorizationCode: "code" }, { config: null, fetchImpl: f.impl as never });
    expect(r).toEqual({ ok: false, reason: "unconfigured" });
    expect(f.calls).toHaveLength(0);
    expect(state.upserts).toHaveLength(0);
  });

  it("exchanges the authorization code and stores the encrypted refresh token", async () => {
    const { sb, state } = fakeSb();
    const f = fakeFetch({ "https://appleid.apple.com/auth/token": { ok: true, status: 200, json: { refresh_token: "r.abc" } } });
    const r = await storeAppleSigninRefreshToken(sb, { userId: "u1", authorizationCode: "code-1" }, { config: CONFIG, fetchImpl: f.impl as never });
    expect(r).toEqual({ ok: true });
    expect(f.calls[0].body.get("grant_type")).toBe("authorization_code");
    expect(f.calls[0].body.get("code")).toBe("code-1");
    expect(f.calls[0].body.get("client_id")).toBe("com.dibay.ph");
    expect(state.upserts[0]).toMatchObject({ user_id: "u1", client_id: "com.dibay.ph" });
    expect(decryptAppleRefreshToken(CONFIG, String(state.upserts[0].refresh_token_enc))).toBe("r.abc");
  });

  it("an Apple exchange error is reported, not thrown", async () => {
    const { sb, state } = fakeSb();
    const f = fakeFetch({ "https://appleid.apple.com/auth/token": { ok: false, status: 400 } });
    const r = await storeAppleSigninRefreshToken(sb, { userId: "u1", authorizationCode: "bad" }, { config: CONFIG, fetchImpl: f.impl as never });
    expect(r).toEqual({ ok: false, reason: "exchange_failed" });
    expect(state.upserts).toHaveLength(0);
  });

  it("revokes the stored token at Apple and deletes the row on account deletion", async () => {
    const { sb, state } = fakeSb({ refresh_token_enc: encryptAppleRefreshToken(CONFIG, "r.abc"), client_id: "com.dibay.ph" });
    const f = fakeFetch({ "https://appleid.apple.com/auth/revoke": { ok: true, status: 200 } });
    const r = await revokeAppleSigninTokenForUser(sb, "u1", { config: CONFIG, fetchImpl: f.impl as never });
    expect(r).toEqual({ status: "revoked" });
    expect(f.calls[0].body.get("token")).toBe("r.abc");
    expect(f.calls[0].body.get("token_type_hint")).toBe("refresh_token");
    expect(state.deleted).toBe(true);
  });

  it("members without a stored Apple token report no_token and call nothing", async () => {
    const { sb } = fakeSb(null);
    const f = fakeFetch({});
    expect(await revokeAppleSigninTokenForUser(sb, "u1", { config: CONFIG, fetchImpl: f.impl as never })).toEqual({ status: "no_token" });
    expect(f.calls).toHaveLength(0);
  });

  it("keeps the row when Apple refuses the revoke (retry possible)", async () => {
    const { sb, state } = fakeSb({ refresh_token_enc: encryptAppleRefreshToken(CONFIG, "r.abc"), client_id: "com.dibay.ph" });
    const f = fakeFetch({ "https://appleid.apple.com/auth/revoke": { ok: false, status: 400 } });
    expect(await revokeAppleSigninTokenForUser(sb, "u1", { config: CONFIG, fetchImpl: f.impl as never })).toEqual({
      status: "failed",
      detail: "apple_http_400",
    });
    expect(state.deleted).toBe(false);
  });
});
