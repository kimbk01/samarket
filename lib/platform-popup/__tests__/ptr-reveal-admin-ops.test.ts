import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPtrRevealAdminPatch, type PtrRevealAdminForm } from "@/lib/platform-popup/ptr-reveal-admin-patch";
import { removePlatformPopupPtrBandVariant } from "@/lib/platform-popup/admin-campaign-writer";
import { computePtrBandLayout, PTR_BAND_SPECS } from "@/lib/platform-popup/ptr-reveal-contract";

const base: PtrRevealAdminForm = {
  name: "QA", priority: 0, title: "가을 세일", ctaLabel: "쿠폰", ctaType: "internal_page", ctaTarget: "/market",
  externalUrl: "", surfaces: ["TRADE"], startLocal: "", endLocal: "", frequencyMode: "once_per_session",
  audienceMode: "allowlist", audienceUserIdsText: "11111111-1111-4111-8111-111111111111",
};

describe("PTR admin — diff-only save (live ad must not drop to review on unrelated edits)", () => {
  it("no change → empty patch", () => {
    expect(buildPtrRevealAdminPatch(base, { ...base })).toEqual({});
  });
  it("name only → only name (non-material)", () => {
    expect(buildPtrRevealAdminPatch(base, { ...base, name: "QA2" })).toEqual({ name: "QA2" });
  });
  it("same audience ids in different order/format → no audience patch", () => {
    const a = { ...base, audienceUserIdsText: "a1111111-1111-4111-8111-111111111111\nb2222222-2222-4222-8222-222222222222" };
    const b = { ...a, audienceUserIdsText: "B2222222-2222-4222-8222-222222222222, a1111111-1111-4111-8111-111111111111" };
    expect(buildPtrRevealAdminPatch(a, b)).toEqual({});
  });
  it("frequency change carries the mapped suppression mode", () => {
    expect(buildPtrRevealAdminPatch(base, { ...base, frequencyMode: "once_per_day" })).toEqual({
      frequencyMode: "once_per_day",
      suppressionMode: "TODAY",
    });
  });
  it("CTA switch to external sends the full CTA group", () => {
    expect(buildPtrRevealAdminPatch(base, { ...base, ctaType: "external_url", externalUrl: "https://x.example" })).toEqual({
      ctaType: "external_url",
      ctaTarget: "",
      externalUrl: "https://x.example",
    });
  });
  it("surfaces compared as a set", () => {
    const a = { ...base, surfaces: ["TRADE", "COMMUNITY"] };
    expect(buildPtrRevealAdminPatch(a, { ...a, surfaces: ["COMMUNITY", "TRADE"] })).toEqual({});
  });
});

type Call = { table: string; op: string; filters: Record<string, unknown>; values?: unknown };
function fakeSb(campaign: { status: string; presentation_type: string } | null, readyCount = 1) {
  const calls: Call[] = [];
  const sb = {
    from(table: string) {
      const c: Call = { table, op: "select", filters: {} };
      calls.push(c);
      const q: Record<string, unknown> = {
        select() { return q; },
        update(values: unknown) { c.op = "update"; c.values = values; return q; },
        insert(values: unknown) { c.op = "insert"; c.values = values; return Promise.resolve({ error: null }); },
        eq(k: string, v: unknown) { c.filters[k] = v; return q; },
        maybeSingle() { return Promise.resolve({ data: campaign ? { id: "c1", ...campaign } : null, error: null }); },
        then(res: (v: unknown) => unknown) {
          const data = c.op === "update" && table === "platform_popup_creatives" ? Array.from({ length: readyCount }, (_, i) => ({ id: `r${i}` })) : null;
          return Promise.resolve({ data, error: null }).then(res);
        },
      };
      return q;
    },
  };
  return { sb: sb as never, calls };
}

describe("PTR admin — image variant delete", () => {
  it("phone band cannot be deleted while live", async () => {
    const { sb } = fakeSb({ status: "active", presentation_type: "ptr_reveal" });
    expect(await removePlatformPopupPtrBandVariant(sb, { campaignId: "c1", adminUserId: "a", variant: "default" })).toMatchObject({ ok: false, error: "ptr_default_band_required_live" });
  });
  it("tablet band delete on a live ad → only that variant rejected, campaign back to review", async () => {
    const { sb, calls } = fakeSb({ status: "active", presentation_type: "ptr_reveal" });
    const r = await removePlatformPopupPtrBandVariant(sb, { campaignId: "c1", adminUserId: "a", variant: "tablet" });
    expect(r).toMatchObject({ ok: true, revertedToReview: true, removed: 1 });
    const rm = calls.find((c) => c.table === "platform_popup_creatives" && c.op === "update")!;
    expect(rm.filters).toMatchObject({ campaign_id: "c1", status: "ready", variant: "tablet" });
    expect(calls.some((c) => c.table === "platform_popup_campaigns" && c.op === "update" && (c.values as { status?: string }).status === "pending_review")).toBe(true);
  });
  it("draft: phone band delete allowed, no review flip", async () => {
    const { sb } = fakeSb({ status: "draft", presentation_type: "ptr_reveal" });
    expect(await removePlatformPopupPtrBandVariant(sb, { campaignId: "c1", adminUserId: "a", variant: "default" })).toMatchObject({ ok: true, revertedToReview: false });
  });
  it("popup campaign rejected", async () => {
    const { sb } = fakeSb({ status: "draft", presentation_type: "center_modal" });
    expect(await removePlatformPopupPtrBandVariant(sb, { campaignId: "c1", adminUserId: "a", variant: "tablet" })).toMatchObject({ ok: false, error: "creative_mode_presentation_mismatch" });
  });
});

describe("PTR admin — creation/copy safety (source contract)", () => {
  const writer = readFileSync(join(process.cwd(), "lib/platform-popup/admin-campaign-writer.ts"), "utf8");
  it("new ptr_reveal campaigns start as empty allowlist (nobody)", () => {
    expect(writer).toMatch(/presentationType === "ptr_reveal" \? \{ audience_mode: "allowlist", audience_user_ids: \[\] \}/);
  });
  it("copy carries the audience", () => {
    expect(writer).toContain("...(audienceCopy ?? {})");
  });
});

describe("PTR band source resolution vs measured CSS widths × DPR", () => {
  // 실측 CSS 폭(Cursor 실기기): Samsung SM-M156S 384, Xiaomi 24076RP19G 601. DPR 은 기기 물리 해상도 ÷ CSS 폭.
  it("phone 1280px source ≥ displayed device px up to DPR 3 at ≤ 426 CSS", () => {
    for (const w of [360, 384, 393, 412]) {
      const l = computePtrBandLayout({ variant: "default", frameWidthPx: w, slotHeightPx: 106 });
      expect(l.imageWidthPx * 3).toBeLessThanOrEqual(PTR_BAND_SPECS.default.width);
    }
    // 430(Pro Max)·DPR3 → 1290 device px vs 1280 source: 0.8% 업스케일(허용 범위로 보고)
    const max = computePtrBandLayout({ variant: "default", frameWidthPx: 430, slotHeightPx: 106 });
    expect(max.imageWidthPx * 3 / PTR_BAND_SPECS.default.width).toBeLessThan(1.01);
  });
  it("tablet 2560px source ≥ 848 CSS × DPR 3", () => {
    expect(848 * 3).toBeLessThanOrEqual(PTR_BAND_SPECS.tablet.width);
  });
});
