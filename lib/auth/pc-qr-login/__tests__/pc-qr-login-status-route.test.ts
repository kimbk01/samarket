import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { PC_QR_LOGIN_SECRET_COOKIE } from "@/lib/auth/pc-qr-login/pc-qr-login-contract";

// ── 상태 확인 라우트: 승인 1회 → 세션 쿠키 + 활성 세션 쿠키 + PC 비밀 쿠키 삭제 ──
const readForPc = vi.fn();
const consume = vi.fn();
const establish = vi.fn();
vi.mock("@/lib/auth/pc-qr-login/pc-qr-login.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/pc-qr-login/pc-qr-login.server")>()),
  readPcQrLoginRequestForPc: (...a: unknown[]) => readForPc(...a),
  consumeApprovedPcQrLoginRequest: (...a: unknown[]) => consume(...a),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => ({}) }));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/pc-qr-login/pc-qr-login-session.server", () => ({
  establishPcQrLoginSession: (...a: unknown[]) => establish(...a),
}));

describe("PC QR login — status route", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    readForPc.mockReset();
    consume.mockReset();
    establish.mockReset();
  });

  function req(withCookie = true) {
    return new NextRequest(`https://samarket.vercel.app/api/auth/qr-login/status?id=${id}`, {
      headers: withCookie ? { cookie: `${PC_QR_LOGIN_SECRET_COOKIE}=pc-secret` } : {},
    });
  }

  it("without the PC secret cookie → invalid (QR is bound to the PC that made it)", async () => {
    const { GET } = await import("@/app/api/auth/qr-login/status/route");
    const res = await GET(req(false));
    expect(res.status).toBe(400);
    expect(readForPc).not.toHaveBeenCalled();
  });

  it("pending → pending; expired pending → expired", async () => {
    const { GET } = await import("@/app/api/auth/qr-login/status/route");
    readForPc.mockResolvedValueOnce({ status: "pending", expires_at: new Date(Date.now() + 60_000).toISOString() });
    expect(await (await GET(req())).json()).toMatchObject({ status: "pending" });
    readForPc.mockResolvedValueOnce({ status: "pending", expires_at: new Date(Date.now() - 1).toISOString() });
    expect(await (await GET(req())).json()).toMatchObject({ status: "expired" });
  });

  it("approved → consumed once → session + carrier cookies on the response, secret cookie cleared", async () => {
    const { GET } = await import("@/app/api/auth/qr-login/status/route");
    readForPc.mockResolvedValueOnce({ status: "approved", expires_at: new Date(Date.now() + 60_000).toISOString(), pc_client: "windows_shell" });
    consume.mockResolvedValueOnce("user-1");
    establish.mockImplementationOnce(async (input: { cookieCarrier: NextResponse }) => {
      input.cookieCarrier.cookies.set("samarket_active_session_id", "sess-1", { httpOnly: true, path: "/" });
      return { ok: true, userId: "user-1", redirectTo: "/home", signupComplete: true, needsTermsAgreement: false, needsProfileCompletion: false };
    });
    const res = await GET(req());
    expect(await res.json()).toMatchObject({ ok: true, status: "approved", redirectTo: "/home" });
    expect(res.cookies.get("samarket_active_session_id")?.value).toBe("sess-1");
    expect(res.cookies.get(PC_QR_LOGIN_SECRET_COOKIE)?.value).toBe("");
    expect(establish).toHaveBeenCalledTimes(1);
  });

  it("approved but already consumed by a parallel poll → no second session", async () => {
    const { GET } = await import("@/app/api/auth/qr-login/status/route");
    readForPc.mockResolvedValueOnce({ status: "approved", expires_at: new Date(Date.now() + 60_000).toISOString() });
    consume.mockResolvedValueOnce(null);
    expect(await (await GET(req())).json()).toMatchObject({ status: "consumed" });
    expect(establish).not.toHaveBeenCalled();
  });
});
