import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

describe("notification source label contract", () => {
  it("list reads platform_event_id and does not call unresolved Event legacy unbound", () => {
    const src = readFileSync(
      join(ROOT, "components/admin/notifications/AdminNotificationCampaignsPage.tsx"),
      "utf8"
    );
    expect(src).toContain("readLinkedPlatformEventId");
    expect(src).toContain("platform_event_id");
    expect(src).toContain("원본 확인 불가");
    expect(src).toContain("이전 방식 · 원본 연결 없음");
    expect(src).toContain('data-admin-notif-manage="1"');
    // unresolved must not reuse legacy unbound short label
    expect(src).toMatch(/platform_event_unresolved[\s\S]*원본 확인 불가/);
  });

  it("detail distinguishes Event source from legacy unbound", () => {
    const src = readFileSync(
      join(ROOT, "components/admin/notifications/AdminNotificationCampaignDetailPage.tsx"),
      "utf8"
    );
    expect(src).toContain("readLinkedPlatformEventId");
    expect(src).toContain("linkedEvent");
    expect(src).toContain("이전 방식 · 원본 연결 없음");
    expect(src).toContain("원본 확인 불가");
  });
});
