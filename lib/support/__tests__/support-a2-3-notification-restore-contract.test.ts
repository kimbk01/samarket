import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isAllowedSupportNotificationPath,
  resolveSafeNotificationInternalRoute,
} from "@/lib/notifications/policy/notification-internal-route";
import { buildSupportCaseRoute } from "@/lib/support/support-case-types";

const ROOT = join(__dirname, "..", "..", "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("A2-3 support notification → Support Modal restore", () => {
  it("allows exact /support/cases/{caseId} and /support/enter only", () => {
    const caseId = "76a6e805-e62c-4198-9a53-44e15c0a758f";
    const route = buildSupportCaseRoute(caseId);
    expect(isAllowedSupportNotificationPath(route)).toBe(true);
    expect(isAllowedSupportNotificationPath("/support/enter")).toBe(true);
    expect(isAllowedSupportNotificationPath("/support")).toBe(false);
    expect(isAllowedSupportNotificationPath("/support/cases")).toBe(false);
    expect(isAllowedSupportNotificationPath("/support/cases/open")).toBe(false);
    expect(isAllowedSupportNotificationPath("/support/evil")).toBe(false);
    expect(isAllowedSupportNotificationPath("/support/cases/a/b")).toBe(false);
  });

  it("sanitizer keeps exact case route (no origin_unavailable)", () => {
    const caseId = "76a6e805-e62c-4198-9a53-44e15c0a758f";
    const route = `${buildSupportCaseRoute(caseId)}?storeId=store-1`;
    expect(resolveSafeNotificationInternalRoute(route)).toBe(route);
    expect(resolveSafeNotificationInternalRoute("/support/cases/abc")).toBe("/support/cases/abc");
    expect(resolveSafeNotificationInternalRoute("/support")).toBeNull();
    expect(resolveSafeNotificationInternalRoute("javascript:alert(1)")).toBeNull();
    expect(resolveSafeNotificationInternalRoute("//evil.example/x")).toBeNull();
  });

  it("customer support events write display_route + buildSupportCaseRoute", () => {
    const svc = read("lib/support/support-case-service.ts");
    expect(svc).toContain('type: "support_admin_replied"');
    expect(svc).toContain('type: "support_case_resolved"');
    expect(svc).toContain("buildSupportCaseRoute");
    expect(svc).not.toContain("/mypage/inquiries");
    expect(svc).not.toContain("/mypage/inbox");
  });

  it("bootstrap waits for auth then opens modal and replaces full-page", () => {
    const boot = read("components/support/SupportCaseBootstrapClient.tsx");
    expect(boot).toContain("ensureSessionHealthy");
    expect(boot).toContain("openSupportModal");
    expect(boot).toContain('router.replace("/")');
    expect(boot).not.toContain("token_hash");
    expect(boot).not.toContain("revoke");
  });

  it("modal case load fail-closes without legacy fallback", () => {
    const page = read("components/support/SupportModalHost.tsx");
    expect(page).toContain("support_modal_case_load");
    expect(page).toContain("forbidden");
    expect(page).not.toContain("/mypage/inquiries");
    expect(page).not.toContain("/community-messenger");
  });

  it("canonical waiting status remains WAITING_USER (not WAITING_CUSTOMER)", () => {
    const types = read("lib/support/support-case-types.ts");
    expect(types).toContain("WAITING_USER");
    expect(types).not.toContain("WAITING_CUSTOMER");
  });
});
