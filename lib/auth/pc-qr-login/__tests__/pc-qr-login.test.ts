import { describe, expect, it } from "vitest";
import {
  buildPcQrLoginPayload,
  parsePcQrLoginPayload,
} from "@/lib/auth/pc-qr-login/pc-qr-login-contract";
import {
  approvePcQrLoginRequest,
  consumeApprovedPcQrLoginRequest,
  createPcQrLoginRequest,
  sha256Hex,
} from "@/lib/auth/pc-qr-login/pc-qr-login.server";

/**
 * PC QR 로그인 (Owner 「그래 만들어」 2026-11-08) — 설계 docs/audit/windows-qr-login-design-2026-11-08.md
 * 보안 계약: 2분 만료 · 승인·소비 각 1회(조건부 UPDATE) · QR=nonce / PC=쿠키 비밀값 분리 · 차단·탈퇴 거부.
 */

type Call = { op: string; args: unknown[] };

function fakeAdmin(result: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const op of ["insert", "update", "select", "eq", "gt"]) {
    builder[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return builder;
    };
  }
  builder.single = () => Promise.resolve(result);
  builder.maybeSingle = () => Promise.resolve(result);
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  const sb = { from: (table: string) => (calls.push({ op: "from", args: [table] }), builder) };
  return { sb: sb as never, calls };
}

describe("PC QR login — payload contract", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  const nonce = "a".repeat(43);

  it("builds and parses dibay-pc-login:v1 payload only", () => {
    expect(parsePcQrLoginPayload(buildPcQrLoginPayload(id, nonce))).toEqual({ requestId: id, nonce });
    expect(parsePcQrLoginPayload(`https://samarket.vercel.app/?id=${id}`)).toBeNull();
    expect(parsePcQrLoginPayload(`dibay-pc-login:v1:not-a-uuid:${nonce}`)).toBeNull();
    expect(parsePcQrLoginPayload(`dibay-pc-login:v1:${id}:short`)).toBeNull();
    expect(parsePcQrLoginPayload(null)).toBeNull();
  });
});

describe("PC QR login — store (conditional single-use transitions)", () => {
  it("create stores only hashes and a 2-minute expiry", async () => {
    const { sb, calls } = fakeAdmin({ data: { id: "11111111-2222-4333-8444-555555555555" }, error: null });
    const now = Date.parse("2026-11-08T00:00:00Z");
    const created = await createPcQrLoginRequest(
      sb,
      { ip: "1.2.3.4", userAgent: "UA", client: "windows_shell", geoCountry: "PH", geoCity: "Manila" },
      now,
    );
    const insert = calls.find((c) => c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(insert.pc_secret_hash).toBe(sha256Hex(created.pcSecret));
    expect(insert.qr_nonce_hash).toBe(sha256Hex(created.nonce));
    expect(JSON.stringify(insert)).not.toContain(created.pcSecret);
    expect(JSON.stringify(insert)).not.toContain(created.nonce);
    expect(insert.expires_at).toBe("2026-11-08T00:02:00.000Z");
    expect(created.nonce).not.toBe(created.pcSecret);
  });

  it("approve requires pending + unexpired + matching nonce, and only one row", async () => {
    const { sb, calls } = fakeAdmin({ data: [{ id: "x" }], error: null });
    const now = Date.parse("2026-11-08T00:01:00Z");
    const ok = await approvePcQrLoginRequest(sb, { requestId: "r", nonce: "n", approverUserId: "u", approverIp: null }, now);
    expect(ok).toBe(true);
    const eqs = calls.filter((c) => c.op === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["status", "pending"]);
    expect(eqs).toContainEqual(["qr_nonce_hash", sha256Hex("n")]);
    expect(calls.find((c) => c.op === "gt")!.args).toEqual(["expires_at", "2026-11-08T00:01:00.000Z"]);
    const { sb: sb2 } = fakeAdmin({ data: [], error: null });
    expect(await approvePcQrLoginRequest(sb2, { requestId: "r", nonce: "n", approverUserId: "u", approverIp: null })).toBe(false);
  });

  it("consume requires approved + unexpired + PC secret, returns approver once", async () => {
    const { sb, calls } = fakeAdmin({ data: [{ approved_by_user_id: "user-1" }], error: null });
    expect(await consumeApprovedPcQrLoginRequest(sb, { requestId: "r", pcSecret: "s" })).toBe("user-1");
    const eqs = calls.filter((c) => c.op === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["status", "approved"]);
    expect(eqs).toContainEqual(["pc_secret_hash", sha256Hex("s")]);
    const { sb: sb2 } = fakeAdmin({ data: [], error: null });
    expect(await consumeApprovedPcQrLoginRequest(sb2, { requestId: "r", pcSecret: "s" })).toBeNull();
  });
});

