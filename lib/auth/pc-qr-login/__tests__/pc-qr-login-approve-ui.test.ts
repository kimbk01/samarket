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
  it("Windows app login: QR first; 「모바일이 없으세요?」 → provider buttons; 「QR로 로그인」 back (Owner 2026-11-08)", () => {
    const panel = read("components/auth/PcQrLoginPanel.tsx");
    expect(panel).toContain("isDibayWindowsShell()");
    const login = read("app/login/LoginPageClient.tsx");
    expect(login).toContain("const showPcQrLogin = isWindowsShell && pcQrLoginMode && pcQrLoginAvailable;");
    // QR 모드이면 패널 + 「모바일이 없으세요?」, 아니면 기존 버튼
    const qrBranch = login.indexOf("{showPcQrLogin ? (");
    const panelIdx = login.indexOf("<PcQrLoginPanel", qrBranch);
    const noMobileIdx = login.indexOf('t("auth_pc_qr_no_mobile")', qrBranch);
    const buttonsIdx = login.indexOf("<LoginProviderButtons", qrBranch);
    expect(qrBranch).toBeGreaterThan(0);
    expect(panelIdx).toBeGreaterThan(qrBranch);
    expect(noMobileIdx).toBeGreaterThan(panelIdx);
    expect(buttonsIdx).toBeGreaterThan(noMobileIdx);
    expect(login).toContain("onClick={() => setPcQrLoginMode(false)}");
    expect(login).toContain("onClick={() => setPcQrLoginMode(true)}");
    // QR 을 만들 수 없으면 기존 버튼, 「QR로 로그인」도 숨김
    expect(login).toContain("onUnavailable={() => setPcQrLoginAvailable(false)}");
    expect(login).toContain("{isWindowsShell && pcQrLoginAvailable ? (");
    // 서버 렌더·브라우저·휴대폰 앱은 Windows 셸 false → 기존 화면
    expect(login).toMatch(/function windowsShellServerSnapshot\(\): boolean \{\s*return false;/);
  });

  it("phone done screen: 「PC에 로그인되었습니다」 + [확인] → 내정보", () => {
    const scan = read("components/my/settings/PcLoginScanContent.tsx");
    expect(scan).toMatch(/state\.kind === "done"[\s\S]{0,600}t\("pc_login_done"\)[\s\S]{0,500}router\.push\(MYPAGE_PROFILE_HREF\)[\s\S]{0,120}t\("pc_login_done_ok"\)/);
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
