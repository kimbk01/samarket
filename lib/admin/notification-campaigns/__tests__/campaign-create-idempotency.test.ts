import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 쓰는 코드를 실행한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { describe, expect, it, vi } from "vitest";
import { findCampaignByCreateRequestId } from "@/lib/admin/notification-campaigns/campaign-create-service";

describe("campaign create idempotency", () => {
  it("findCampaignByCreateRequestId returns existing row", async () => {
    const svc = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: "camp-dup" } }),
          }),
        }),
      }),
    } as never;

    const found = await findCampaignByCreateRequestId(svc, "req-123");
    expect(found?.id).toBe("camp-dup");
  });

  it("findCampaignByCreateRequestId returns null when missing", async () => {
    const svc = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    } as never;

    const found = await findCampaignByCreateRequestId(svc, "req-missing");
    expect(found).toBeNull();
  });
});
