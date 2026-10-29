import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  adminIsoToManilaInput,
  adminManilaInputToIso,
} from "@/lib/admin/operator-ux/admin-manila-datetime-input";
import { formatAdminCouponDay } from "@/lib/stores/admin-coupon-control-view";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/** v4 UI-01·UI-16 — 관리자 일정 입력칸 = 필리핀 시간(PHT), 저장만 해도 값이 바뀌지 않는다. */
describe("v4 UI-01 admin Manila datetime input", () => {
  it("ISO → PHT 입력칸 (UTC+8 고정 · 기기 시간대 무관)", () => {
    expect(adminIsoToManilaInput("2026-10-29T01:00:00.000Z")).toBe("2026-10-29T09:00");
    expect(adminIsoToManilaInput("2026-10-29T18:30:00Z")).toBe("2026-10-30T02:30");
    expect(adminIsoToManilaInput(null)).toBe("");
    expect(adminIsoToManilaInput("not-a-date")).toBe("");
  });

  it("PHT 입력칸 → ISO", () => {
    expect(adminManilaInputToIso("2026-10-29T09:00")).toBe("2026-10-29T01:00:00.000Z");
    expect(adminManilaInputToIso("")).toBeNull();
    expect(adminManilaInputToIso("2026/10/29 09:00")).toBeUndefined();
  });

  it("왕복: 채운 값을 그대로 저장하면 원래 시각 그대로 (8시간 이동 없음 · 초 보존)", () => {
    for (const iso of ["2026-11-01T16:00:00.000Z", "2026-11-01T16:00:37.512Z", "2027-01-01T00:00:00.000Z"]) {
      const shown = adminIsoToManilaInput(iso);
      expect(adminManilaInputToIso(shown, iso)).toBe(new Date(iso).toISOString());
    }
  });

  it("값을 바꾸면 바꾼 PHT 시각으로 저장", () => {
    const original = "2026-11-01T16:00:00.000Z"; // 11-02 00:00 PHT
    expect(adminManilaInputToIso("2026-11-02T08:00", original)).toBe("2026-11-02T00:00:00.000Z");
  });

  it("광고 상세 일정 저장은 이 변환만 쓴다 (slice(0,16)·new Date(local) 금지)", () => {
    const src = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
    expect(src).toContain("adminIsoToManilaInput(json.campaign.startAt)");
    expect(src).toContain("adminManilaInputToIso(startAt, campaign.startAt)");
    expect(src).not.toContain("json.campaign.startAt.slice(0, 16)");
    expect(src).not.toContain("new Date(startAt).toISOString()");
    expect(src).not.toContain("fundedAt.slice(0, 16)");
  });

  it("UI-16: 쿠폰·캠페인·배너·Partner 화면이 기기 시간대 변환을 쓰지 않는다", () => {
    for (const p of [
      "components/admin/stores/AdminStoreCouponAdminCreatePanel.tsx",
      "components/admin/stores/AdminStoreDiscoveryCampaignWriterPanel.tsx",
    ]) {
      const src = read(p);
      expect(src, p).not.toMatch(/getHours\(\)|getFullYear\(\)/);
      expect(src, p).toContain("adminManilaInputToIso");
    }
    expect(read("components/admin/stores/AdminDeliveryAdBannerStudioView.tsx")).not.toContain("startAt.slice(0, 16)");
    expect(read("components/admin/stores/AdminDeliveryAdPartnerMembershipsView.tsx")).not.toContain(".slice(0, 10)");
    expect(read("components/admin/stores/AdminStoreDiscoverySnapshotPanel.tsx")).toContain(
      "formatAdminManilaDateTime(snapshot.first_listed_at)"
    );
  });

  it("UI-16: 쿠폰 날짜는 PHT 날짜 (UTC 16:14 = 다음날 00:14 PHT)", () => {
    expect(formatAdminCouponDay("2026-08-25T16:14:00+00:00")).toBe("2026.08.26");
    expect(formatAdminCouponDay("")).toBe("");
    expect(formatAdminCouponDay("garbage")).toBe("");
  });
});
