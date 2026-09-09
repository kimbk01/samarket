import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  dataResetUiExecuteBlocked,
  resolveDataResetUiCapability,
} from "@/lib/admin/data-reset/ui-capability";
import {
  assertDataResetFailClosedDomain,
  isDataResetProductionScopeEnabled,
} from "@/lib/admin/data-reset/production-enable-policy";

const root = resolve(process.cwd());

describe("Data Reset UI capability parity", () => {
  it("L2 chat:type / friend:user are UI-blocked with reauth reason", () => {
    const chatType = resolveDataResetUiCapability({
      domain: "chat",
      scope: "type",
      subtype: "general_direct",
    });
    expect(chatType.executePosture).toBe("blocked");
    expect(dataResetUiExecuteBlocked(chatType)).toBe(true);
    expect(chatType.reasonKo).toMatch(/재인증/);
    expect(isDataResetProductionScopeEnabled({ domain: "chat", scope: "type" })).toBe(false);

    const friendUser = resolveDataResetUiCapability({
      domain: "friend",
      scope: "user",
    });
    expect(friendUser.executePosture).toBe("blocked");
    expect(dataResetUiExecuteBlocked(friendUser)).toBe(true);
    expect(isDataResetProductionScopeEnabled({ domain: "friend", scope: "user" })).toBe(false);
  });

  it("finance preview-only; auth purge blocked", () => {
    const finance = resolveDataResetUiCapability({ domain: "finance", scope: "all" });
    expect(finance.executePosture).toBe("preview_only");
    expect(dataResetUiExecuteBlocked(finance)).toBe(true);
    expect(assertDataResetFailClosedDomain({ domain: "finance" }).ok).toBe(false);

    const auth = resolveDataResetUiCapability({
      domain: "member",
      scope: "user",
      subtype: "auth_delete",
    });
    expect(auth.executePosture).toBe("blocked");
    expect(
      assertDataResetFailClosedDomain({ domain: "member", subtype: "auth_delete" }).ok
    ).toBe(false);
  });

  it("L1 community single is opt-in gated, not permanently blocked", () => {
    const cap = resolveDataResetUiCapability({
      domain: "community",
      scope: "single",
    });
    expect(cap.executePosture).toBe("available_when_execute_opt_in");
    expect(dataResetUiExecuteBlocked(cap)).toBe(false);
    expect(isDataResetProductionScopeEnabled({ domain: "community", scope: "single" })).toBe(
      true
    );
  });

  it("domain-all and full carry opt-in + risk messaging (not falsely proven)", () => {
    const all = resolveDataResetUiCapability({ domain: "community", scope: "all" });
    expect(all.executePosture).toBe("available_when_execute_opt_in");
    expect(all.reasonKo).toMatch(/실데이터|옵트인/);

    const full = resolveDataResetUiCapability({ domain: "full", scope: "all" });
    expect(full.executePosture).toBe("available_when_execute_opt_in");
    expect(full.reasonKo).toMatch(/실측|옵트인/);
  });

  it("AdminDataResetPage wires capability blocker before execute CTA", () => {
    const page = readFileSync(
      resolve(root, "components/admin/system/AdminDataResetPage.tsx"),
      "utf8"
    );
    expect(page).toContain("resolveDataResetUiCapability");
    expect(page).toContain("dataResetUiExecuteBlocked");
    expect(page).toContain("scopeExecuteBlocked");
    expect(page).toContain("미리보기 성공이 곧 실행 허용을 의미하지 않습니다");
    expect(page).toContain("Production 실행은 기본 비활성");
    expect(page).toContain("운영 실행 불가");
  });
});
