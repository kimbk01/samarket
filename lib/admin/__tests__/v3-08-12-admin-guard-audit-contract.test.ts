import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeAdminSettingsBundleForAudit } from "@/lib/admin/audit/admin-settings-bundle-audit";
import { maskAuthProviderForAudit } from "@/lib/auth/auth-provider-audit";
import {
  campaignSendConfirmMatchLabel,
  campaignSendConfirmMatchText,
} from "@/lib/admin/notification-campaigns/campaign-send-typed-confirm";

const requireSuperAdmin = vi.fn();
const appendAdminRouteAudit = vi.fn();
const saveOpsBoardBundleToDb = vi.fn();
const loadOpsBoardBundleFromDb = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireSuperAdmin: () => requireSuperAdmin(),
}));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: (...args: unknown[]) => appendAdminRouteAudit(...args),
}));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => ({}) }));
vi.mock("@/lib/ops-board/ops-board-db", () => ({
  loadOpsBoardBundleFromDb: (...a: unknown[]) => loadOpsBoardBundleFromDb(...a),
  saveOpsBoardBundleToDb: (...a: unknown[]) => saveOpsBoardBundleToDb(...a),
}));

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const SUPER_ADMIN_TOOL_APIS = [
  "ops-board",
  "ops-docs",
  "ops-runbooks",
  "ops-knowledge",
  "ops-knowledge-graph",
  "ops-learning",
  "ops-maturity",
  "ops-benchmarks",
  "qa-board",
  "ops-routines",
  "product-backlog",
  "dev-sprints",
  "release-archive",
  "production-migration",
  "backup",
  "dr",
  "automation",
  "launch-readiness",
  "launch-week",
  "security-ops",
  "performance-ops",
  "usage-ops",
];

const SUPER_ADMIN_TOOL_PAGES = [
  "ops-board",
  "ops-docs",
  "ops-runbooks",
  "ops-knowledge",
  "ops-knowledge-graph",
  "ops-learning",
  "ops-maturity",
  "ops-benchmarks",
  "qa-board",
  "ops-routines",
  "product-backlog",
  "dev-sprints",
  "release-notes",
  "release-archive",
  "production-migration",
  "backup",
  "dr",
  "automation",
  "launch-readiness",
  "launch-week",
  "security",
  "performance",
  "usage",
];

describe("V3-08 internal tools — super_admin only + PUT audit", () => {
  it.each(SUPER_ADMIN_TOOL_APIS)("%s API: GET/PUT requireSuperAdmin + bundle audit", (tool) => {
    const src = read(`app/api/admin/${tool}/route.ts`);
    expect(src).not.toMatch(/requireAdminApiUser/);
    expect(src.match(/await requireSuperAdmin\(\)/g)?.length).toBe(2);
    expect(src).toContain(`tool: "${tool}"`);
    expect(src).toMatch(/appendAdminSettingsBundleAudit\(admin\.sb, req,/);
  });

  it.each(SUPER_ADMIN_TOOL_PAGES)("/admin/%s segment layout renders the super-admin page gate", (page) => {
    expect(read(`app/admin/${page}/layout.tsx`)).toContain("<SuperAdminOnlyPageGate>");
  });

  describe("ops-board route behaviour", () => {
    beforeEach(() => {
      vi.resetModules();
      requireSuperAdmin.mockReset();
      appendAdminRouteAudit.mockReset();
      saveOpsBoardBundleToDb.mockReset();
      loadOpsBoardBundleFromDb.mockReset();
    });

    it("non-super-admin is rejected on GET and PUT without touching the bundle", async () => {
      requireSuperAdmin.mockResolvedValue({
        ok: false,
        response: new Response(JSON.stringify({ ok: false, error: "super_admin_only" }), { status: 403 }),
      });
      const { GET, PUT } = await import("@/app/api/admin/ops-board/route");
      expect((await GET()).status).toBe(403);
      const res = await PUT(
        new Request("https://x/api/admin/ops-board", {
          method: "PUT",
          body: JSON.stringify({ bundle: { version: 1, checklistTemplates: [] } }),
        }) as never
      );
      expect(res.status).toBe(403);
      expect(loadOpsBoardBundleFromDb).not.toHaveBeenCalled();
      expect(saveOpsBoardBundleToDb).not.toHaveBeenCalled();
      expect(appendAdminRouteAudit).not.toHaveBeenCalled();
    });

    it("super_admin PUT saves and writes a size summary audit (not the blob)", async () => {
      requireSuperAdmin.mockResolvedValue({ ok: true, actor: { userId: "sa-1" }, sb: { tag: "sb" } });
      saveOpsBoardBundleToDb.mockResolvedValue({ ok: true });
      const { PUT } = await import("@/app/api/admin/ops-board/route");
      const bundle = { version: 1, checklistTemplates: [{ id: "a", secretNote: "x".repeat(50) }] };
      const res = await PUT(
        new Request("https://x/api/admin/ops-board", {
          method: "PUT",
          body: JSON.stringify({ bundle }),
        }) as never
      );
      expect(res.status).toBe(200);
      expect(appendAdminRouteAudit).toHaveBeenCalledTimes(1);
      const [sb, , input] = appendAdminRouteAudit.mock.calls[0] as [unknown, unknown, Record<string, unknown>];
      expect(sb).toEqual({ tag: "sb" });
      expect(input).toMatchObject({
        actorId: "sa-1",
        targetType: "ops_board_v1",
        action: "ops-board.update",
        after: { shape: { version: "1", checklistTemplates: 1 } },
      });
      expect(JSON.stringify(input)).not.toContain("secretNote");
    });
  });

  it("summarizeAdminSettingsBundleForAudit keeps only size and top-level shape", () => {
    const s = summarizeAdminSettingsBundleForAudit({ version: 1, items: [1, 2, 3], meta: { a: 1 }, name: "n" });
    expect(s).toEqual({
      bytes: expect.any(Number),
      shape: { version: "1", items: 3, meta: "object", name: "string" },
    });
  });
});

describe("V3-08 deploy write routes are audited", () => {
  it.each(["run-gate", "mark-verified", "cancel-verified", "mock-pipeline", "promote-web", "rollback"])(
    "deploy/%s keeps requireDeployOwner and appends audit",
    (r) => {
      const src = read(`app/api/admin/deploy/${r}/route.ts`);
      expect(src).toContain("await requireDeployOwner()");
      expect(src).toMatch(/appendAdminRouteAudit\(gate\.sb, req,/);
    }
  );
});

describe("V3-09 auth settings — settings permission + masked audit", () => {
  it.each(["app/api/admin/auth-settings/route.ts", "app/api/admin/auth-providers/route.ts"])(
    "%s uses requireAdminPermission(\"settings\") everywhere",
    (rel) => {
      const src = read(rel);
      expect(src).not.toMatch(/requireAdminApiUser/);
      expect(src.match(/requireAdminPermission\("settings"\)/g)?.length).toBe(2);
      expect(src).toContain("appendAdminRouteAudit(admin.sb, req,");
    }
  );

  it("maskAuthProviderForAudit never carries the client secret", () => {
    const masked = maskAuthProviderForAudit({
      provider: "google",
      enabled: true,
      client_id: "cid",
      client_secret: "super-secret-value",
      redirect_uri: "https://x/cb",
      scope: "email",
      sort_order: 1,
    });
    expect(JSON.stringify(masked)).not.toContain("super-secret-value");
    expect(masked.client_secret).toBe("***");
    expect(maskAuthProviderForAudit({ ...masked, client_secret: "" } as never).client_secret).toBe("");
  });

  it("settings UI confirms before saving login methods", () => {
    const src = read("components/admin/settings/AuthLoginSettingsForm.tsx");
    expect(src).toContain("confirmAdminAction(");
    expect(src).toContain("전체 회원 로그인에 영향");
    expect(src).not.toMatch(/onClick=\{\(\) => void saveProvider\(/);
    expect(src).not.toMatch(/onClick=\{\(\) => void savePolicy\(/);
  });
});

describe("V3-10 campaign send typed recipient count", () => {
  const facts = { targetCount: 1234, channelLabel: "push", timeLabel: "now" };
  it("send/resend require the exact recipient count", () => {
    expect(campaignSendConfirmMatchText("send", facts, "ko")).toBe("1234");
    expect(campaignSendConfirmMatchText("resend", facts, "en")).toBe("1234");
    expect(campaignSendConfirmMatchLabel("1234", facts, "ko")).toContain("1234");
  });
  it("unknown count falls back to a fixed word (no bypass)", () => {
    expect(campaignSendConfirmMatchText("send", { ...facts, targetCount: null }, "ko")).toBe("발송");
  });
  it("non-send actions are unchanged", () => {
    expect(campaignSendConfirmMatchText("archive", facts, "ko")).toBeUndefined();
    expect(campaignSendConfirmMatchText(null, facts, "ko")).toBeUndefined();
  });
});
