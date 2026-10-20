import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { feedEmergencySwitchConfirmCopy } from "@/lib/feed-emergency/feed-emergency-switch-confirm";
import { canConfirmAdminAction } from "@/lib/admin/operator-ux/admin-typed-confirm";

describe("U-9 피드 긴급 스위치 확인", () => {
  it("목표 상태 단어를 재입력 문구로 쓰고 danger 톤", () => {
    const on = feedEmergencySwitchConfirmCopy({ kind: "kill_switch", enable: true, targetLabel: "홈" });
    expect(on.tone).toBe("danger");
    expect(on.confirmMatchText).toBe("차단");
    expect(on.description).toContain("「홈」");
    expect(feedEmergencySwitchConfirmCopy({ kind: "kill_switch", enable: false, targetLabel: "홈" }).confirmMatchText).toBe("해제");
    expect(feedEmergencySwitchConfirmCopy({ kind: "fallback", enable: true, targetLabel: "홈" }).confirmMatchText).toBe("전환");
    expect(feedEmergencySwitchConfirmCopy({ kind: "section", enable: true, targetLabel: "홈" }).confirmMatchText).toBe("비활성화");
  });

  it("단어를 그대로 입력해야 확인 가능", () => {
    const c = feedEmergencySwitchConfirmCopy({ kind: "kill_switch", enable: true, targetLabel: "홈" });
    const base = { reasonRequired: false, reason: "", confirmMatchText: c.confirmMatchText };
    expect(canConfirmAdminAction({ ...base, typed: "" })).toBe(false);
    expect(canConfirmAdminAction({ ...base, typed: "해제" })).toBe(false);
    expect(canConfirmAdminAction({ ...base, typed: "차단" })).toBe(true);
  });

  it("스위치 화면은 PUT(persist) 전에 확인을 거친다", () => {
    for (const file of [
      "components/admin/feed-emergency/FeedEmergencyPolicyTable.tsx",
      "components/admin/feed-emergency/FeedSectionOverrideTable.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      // R2: 긴급 스위치 = confirmAdminAction L3 (사유 + 상태 단어 재입력)
      expect(src).toContain("confirmAdminAction(");
      expect(src).toContain('adminActionLevel("emergencyBlock")');
      expect(src).toContain("feedEmergencySwitchConfirmCopy");
      expect(src).toContain("retypeValue: copy.confirmMatchText");
    }
    const policy = readFileSync("components/admin/feed-emergency/FeedEmergencyPolicyTable.tsx", "utf8");
    const kill = policy.slice(policy.indexOf("const handleKillSwitch"));
    expect(kill.indexOf("confirmEmergencySwitch(")).toBeGreaterThanOrEqual(0);
    expect(kill.indexOf("if (!c.ok) return;")).toBeLessThan(kill.indexOf("enableKillSwitch(surface)"));
  });
});
