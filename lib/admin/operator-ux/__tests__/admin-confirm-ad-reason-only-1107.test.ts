/**
 * SSOT §3-1 (Owner 2026-11-07 「사유만 입력하면 바로 삭제 · 대상 재입력 금지」) — 광고 조치 L3 = 사유만.
 * 광고 밖 돈 조치(Apple IAP 회수 등 `level: "L3"` + retypeValue)는 재입력을 그대로 묻는다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dibay-overlay/DibayAppDialogProvider", () => ({
  dibayConfirm: vi.fn(async () => true),
  dibayPrompt: vi.fn(async () => "사유 입력"),
}));

import { dibayPrompt } from "@/components/ui/dibay-overlay/DibayAppDialogProvider";
import { confirmAdminAction, resolveAdminConfirmPlan } from "@/lib/admin/operator-ux/admin-confirm-action";
import { registerAdminConfirmHost, type AdminConfirmHostRequest } from "@/lib/admin/operator-ux/admin-confirm-host";
import {
  ADMIN_AD_REASON_ONLY_ACTIONS,
  adminActionAllowsRetype,
  adminActionLevel,
} from "@/lib/admin/operator-ux/admin-action-levels";
import { adsWorkspaceMutationConfirmCopy } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";

describe("광고 조치 = 사유만 (재입력 없음)", () => {
  let unregister: (() => void) | null = null;
  afterEach(() => {
    unregister?.();
    unregister = null;
    vi.mocked(dibayPrompt).mockClear();
  });
  function host() {
    const seen: AdminConfirmHostRequest[] = [];
    unregister = registerAdminConfirmHost(async (req) => {
      seen.push(req);
      return { ok: true, reason: "중복 광고" };
    });
    return seen;
  }

  it("광고 동작 표: 삭제·일괄 삭제·종료·강제 종료 = L3 · 재입력 불가 / 삭제 취소 = L2", () => {
    for (const k of ["adDelete", "adBulkDelete", "end", "adForceEnd"] as const) {
      expect(adminActionLevel(k), k).toBe("L3");
      expect(adminActionAllowsRetype(k), k).toBe(false);
    }
    expect(adminActionLevel("adUndelete")).toBe("L2");
    expect(ADMIN_AD_REASON_ONLY_ACTIONS).toContain("adDelete");
  });

  it("광고 밖 L3 는 재입력 유지 (삭제·회수·실지급·잔액 조정)", () => {
    for (const k of ["delete", "bulk", "purge", "refund", "forceCancel", "realPointGrant", "storeBalanceCorrection"] as const) {
      expect(adminActionAllowsRetype(k), k).toBe(true);
    }
  });

  it("action=adDelete 로 부르면 retypeValue 를 넘겨도 확인창에 재입력 칸이 없다", async () => {
    const seen = host();
    const out = await confirmAdminAction({ action: "adDelete", ko: true, title: "삭제", confirmLabel: "삭제", retypeValue: "광고 제목" });
    expect(out).toEqual({ ok: true, reason: "중복 광고" });
    expect(seen[0]!.confirmMatchText).toBeUndefined();
    expect(seen[0]!.reasonRequired).toBe(true);
  });

  it("level L3 + action end(광고 종료) 도 재입력 없음", () => {
    expect(resolveAdminConfirmPlan({ level: "L3", action: "end", retypeValue: "ORD-1" })).toEqual({ level: "L3", retypeValue: undefined });
  });

  it("광고 밖 돈 조치(Apple IAP 회수 = level L3 + retypeValue)는 재입력 칸을 그대로 띄운다", async () => {
    const seen = host();
    await confirmAdminAction({ level: "L3", ko: true, title: "회수", confirmLabel: "회수", retypeValue: "TX-123" });
    expect(seen[0]!.confirmMatchText).toBe("TX-123");
  });

  it("셸 밖 대체 경로도 광고 조치는 재입력 프롬프트를 띄우지 않는다", async () => {
    const out = await confirmAdminAction({ action: "adDelete", ko: true, title: "삭제", confirmLabel: "삭제", retypeValue: "X" });
    expect(out).toEqual({ ok: true, reason: "사유 입력" });
    expect(vi.mocked(dibayPrompt)).toHaveBeenCalledTimes(1);
  });

  it("공통 광고 화면 확인 문구: 삭제 = adDelete · 종료 = end · 둘 다 재입력 불가", () => {
    const del = adsWorkspaceMutationConfirmCopy("delete_safe_draft", true);
    expect(del).toMatchObject({ action: "adDelete", level: "L3", retypeAllowed: false, reasonRequired: true });
    const end = adsWorkspaceMutationConfirmCopy("end", true);
    expect(end).toMatchObject({ action: "end", level: "L3", retypeAllowed: false });
  });
});
