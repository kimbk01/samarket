import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AD2-02 (2026-11-07): 팝업·PTR 「정지」 = L2 (사유 필수) — 화면과 전이 API 같은 단계.
 * 재입력 제거: 팝업 목록·상세·PTR 상세에 대상 재입력(retypeValue) 0.
 */

const h = vi.hoisted(() => ({ transition: vi.fn(async () => ({ ok: true, status: "paused", approvalStatus: "approved" })) }));

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: vi.fn(async () => ({ ok: true, actor: { userId: "admin-1" } })),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => ({}) }));
vi.mock("@/lib/platform-popup/admin-transitions", () => ({
  transitionPlatformPopupCampaign: h.transition,
  adminApprovePlatformPopupCampaign: vi.fn(),
}));

import { POST } from "@/app/api/admin/platform-popup-campaigns/[campaignId]/transition/route";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";

function call(body: Record<string, unknown>) {
  return POST(
    new Request("https://x.test/api/admin/platform-popup-campaigns/c1/transition", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ campaignId: "c1" }) }
  );
}

beforeEach(() => h.transition.mockClear());

describe("AD2-02 정지 사유 필수", () => {
  it("사유 없는 정지 → 400 · 전이 안 함", async () => {
    const r = await call({ action: "transition", nextStatus: "paused" });
    expect(r.status).toBe(400);
    expect(h.transition).not.toHaveBeenCalled();
  });

  it("사유 있는 정지 → 전이 + 사유 전달", async () => {
    const r = await call({ action: "transition", nextStatus: "paused", reason: "소재 점검" });
    expect(r.status).toBe(200);
    expect(h.transition).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ nextStatus: "paused", reason: "소재 점검" }));
  });

  it("화면 단계: pause = L2", () => {
    expect(adminActionLevel("pause")).toBe("L2");
  });
});

describe("재입력 제거 (팝업·PTR 화면)", () => {
  const files = [
    "components/admin/platform-popup/AdminPlatformPopupListPage.tsx",
    "components/admin/platform-popup/AdminPlatformPopupDetailWorkspace.tsx",
    "components/admin/ptr-reveal/AdminPtrRevealDetailWorkspace.tsx",
  ];
  it.each(files)("%s: retypeValue 0 · 정지는 pause 단계", (f) => {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    expect(src).not.toMatch(/retypeValue/);
    expect(src).not.toMatch(/adminActionLevel\("exposeStop"\)/);
  });
  it.each(files.slice(1))("%s: 초안 삭제 = 공용 AdminAdDeleteAction", (f) => {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    expect(src).toContain("<AdminAdDeleteAction");
    expect(src).not.toContain("delete_safe_draft");
  });
});
