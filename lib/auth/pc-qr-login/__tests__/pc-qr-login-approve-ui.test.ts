import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const routeUser = vi.fn();
const validate = vi.fn();
const approve = vi.fn();
const audit = vi.fn();
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: () => routeUser() }));
vi.mock("@/lib/auth/server-guards", () => ({ validateActiveSession: (...a: unknown[]) => validate(...a) }));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => ({}) }));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: (...a: unknown[]) => audit(...a) }));
vi.mock("@/lib/auth/pc-qr-login/pc-qr-login.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/pc-qr-login/pc-qr-login.server")>()),
  approvePcQrLoginRequest: (...a: unknown[]) => approve(...a),
}));

const ID = "11111111-2222-4333-8444-555555555555";
const NONCE = "b".repeat(43);

function post(body: unknown) {
  return new NextRequest("https://samarket.vercel.app/api/auth/qr-login/approve", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** PC QR 로그인 — 휴대폰 승인 API + 화면 배치 계약 (Owner 「그래 만들어」 2026-11-08) */
describe("PC QR login — approve route (phone)", () => {
  beforeEach(() => {
    routeUser.mockReset().mockResolvedValue("user-1");
    validate.mockReset().mockResolvedValue({ ok: true, profile: { status: "active", deleted_at: null } });
    approve.mockReset().mockResolvedValue(true);
    audit.mockReset().mockResolvedValue(undefined);
  });

  it("not logged in → 401, nothing approved", async () => {
    routeUser.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/auth/qr-login/approve/route");
    expect((await POST(post({ id: ID, n: NONCE }))).status).toBe(401);
    expect(approve).not.toHaveBeenCalled();
  });

  it("blocked approver → 403", async () => {
    validate.mockResolvedValueOnce({ ok: true, profile: { status: "blocked", deleted_at: null } });
    const { POST } = await import("@/app/api/auth/qr-login/approve/route");
    expect((await POST(post({ id: ID, n: NONCE }))).status).toBe(403);
    expect(approve).not.toHaveBeenCalled();
  });

  it("malformed QR values → 400", async () => {
    const { POST } = await import("@/app/api/auth/qr-login/approve/route");
    expect((await POST(post({ id: "x", n: NONCE }))).status).toBe(400);
    expect((await POST(post({ id: ID, n: "short" }))).status).toBe(400);
  });

  it("expired / already used → 410; success → 200 + audit with approver", async () => {
    const { POST } = await import("@/app/api/auth/qr-login/approve/route");
    approve.mockResolvedValueOnce(false);
    expect((await POST(post({ id: ID, n: NONCE }))).status).toBe(410);
    const ok = await POST(post({ id: ID, n: NONCE }));
    expect(ok.status).toBe(200);
    expect(approve).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ requestId: ID, nonce: NONCE, approverUserId: "user-1" }));
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "auth.pc_qr_login_approve", actor_id: "user-1" }));
  });
});

describe("PC QR login — where it shows", () => {
  it("PC QR panel renders only inside the Windows app and on the login page above the provider buttons", () => {
    const panel = read("components/auth/PcQrLoginPanel.tsx");
    expect(panel).toContain("isDibayWindowsShell()");
    const login = read("app/login/LoginPageClient.tsx");
    const panelIdx = login.indexOf("<PcQrLoginPanel");
    expect(panelIdx).toBeGreaterThan(0);
    expect(login.indexOf("<LoginProviderButtons")).toBeGreaterThan(panelIdx);
  });

  it("phone menu row (My → 설정 → PC 로그인) shows only in the dibaY phone app", () => {
    const screen = read("components/mypage/myinfo/MyInfoIaCategoryScreen.tsx");
    expect(screen).toMatch(/function PcLoginIaRow[\s\S]{0,300}isCapacitorNativePlatform\(\)[\s\S]{0,80}if \(!isApp\) return null;/);
    expect(read("lib/mypage/mypage-ia.ts")).toContain('{ kind: "pc-login" },');
    expect(read("components/mypage/MyPageItemScreen.tsx")).toContain('case "pc-login":\n      return <PcLoginScanContent />;');
    expect(read("components/my/settings/PcLoginScanContent.tsx")).toContain("isCapacitorNativePlatform()");
  });

  it("table is service-role only (RLS forced) and stores no plaintext secrets", () => {
    const sql = read("supabase/migrations/20271108150000_pc_qr_login_requests.sql");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("revoke all on table public.pc_login_requests from anon, authenticated;");
    expect(sql).toContain("pc_secret_hash text not null");
    expect(sql).toContain("qr_nonce_hash text not null");
  });
});
