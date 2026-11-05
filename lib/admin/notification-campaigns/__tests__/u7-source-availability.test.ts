/**
 * U7 — EVENT-03 (hero banner Event availability) / EVENT-06 (content-bound campaign
 * send requires published app_notices content). Test-send keeps previewing unpublished content.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateOfficialCampaignSendEligibility,
  type CustomerCenterContentSendRow,
} from "@/lib/admin/notification-campaigns/campaign-source-authority";
import { loadActiveEventHeroBanners } from "@/lib/platform-promotion-distribution/load-active-event-hero-banners";

const NOTICE_ID = "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const NOTICE_ROW = {
  type: "notice",
  target_payload: { appNoticeId: NOTICE_ID, content_type: "notice" },
};
const noEventLookup = async () => null;
const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe("EVENT-06 content-bound send eligibility", () => {
  const cases: Array<[string, CustomerCenterContentSendRow | null, string | null]> = [
    ["published", { is_active: true }, null],
    ["published in period", { is_active: true, starts_at: iso(-DAY), ends_at: iso(DAY) }, null],
    ["missing", null, "content_source_missing"],
    ["deleted", { is_active: true, deleted_at: iso(-DAY) }, "content_source_unavailable"],
    ["archived", { is_active: true, archived_at: iso(-DAY) }, "content_source_unavailable"],
    ["inactive", { is_active: false }, "content_source_unavailable"],
    ["ended", { is_active: true, ends_at: iso(-DAY) }, "content_source_unavailable"],
    ["not started", { is_active: true, starts_at: iso(DAY) }, "content_source_unavailable"],
  ];
  for (const [label, content, expected] of cases) {
    it(`${label} → ${expected ?? "ok"}`, async () => {
      const lookup = vi.fn(async () => content);
      const r = await evaluateOfficialCampaignSendEligibility(NOTICE_ROW, noEventLookup, lookup);
      expect(lookup).toHaveBeenCalledWith(NOTICE_ID);
      if (expected) {
        expect(r).toEqual({ ok: false, error: expected });
      } else {
        expect(r.ok).toBe(true);
        expect(r.ok && r.mode).toBe("content_bound");
      }
    });
  }

  it("lookup failure → content_source_lookup_failed (not missing)", async () => {
    const r = await evaluateOfficialCampaignSendEligibility(NOTICE_ROW, noEventLookup, async () => {
      throw new Error("db down");
    });
    expect(r).toEqual({ ok: false, error: "content_source_lookup_failed" });
  });

  it("malformed (non-uuid) content id → content_source_missing without lookup (permanent, not retried)", async () => {
    const lookup = vi.fn(async () => {
      throw new Error("invalid input syntax for type uuid");
    });
    const r = await evaluateOfficialCampaignSendEligibility(
      { type: "notice", target_payload: { appNoticeId: "n-1", content_type: "notice" } },
      noEventLookup,
      lookup
    );
    expect(r).toEqual({ ok: false, error: "content_source_missing" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("test-send path (no content lookup) keeps current behavior", async () => {
    const r = await evaluateOfficialCampaignSendEligibility(NOTICE_ROW, noEventLookup);
    expect(r.ok).toBe(true);
  });

  it("Event-sourced campaign never queries content lookup", async () => {
    const lookup = vi.fn(async () => null);
    const r = await evaluateOfficialCampaignSendEligibility(
      {
        type: "marketing",
        target_payload: { platform_event_id: "evt-1" },
        deeplink_url: "/events/evt-1",
      },
      async () => ({ status: "published" }),
      lookup
    );
    expect(r.ok).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("EVENT-03 hero banners only for active Events", () => {
  function sbWith(
    distributions: Array<{ id: string; content_id: string; config: Record<string, unknown> }>,
    events: Array<{ id: string; status: string; starts_at?: string | null; ends_at?: string | null }>,
    eventsError: { message: string } | null = null
  ) {
    const eventsIn = vi.fn(async () => ({ data: eventsError ? null : events, error: eventsError }));
    const from = vi.fn((table: string) => {
      if (table === "platform_promotion_distributions") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: async () => ({
            data: distributions.map((d) => ({
              ...d,
              content_type: "platform_event",
              channel: "banner",
              enabled: true,
              status: "active",
              channel_ref_type: null,
              channel_ref_id: null,
              created_at: "",
              updated_at: "",
            })),
            error: null,
          }),
        };
        return chain;
      }
      if (table === "platform_events") {
        return { select: () => ({ in: eventsIn }) };
      }
      throw new Error(`unexpected table ${table}`);
    });
    return { sb: { from } as never, eventsIn, from };
  }
  const hero = (id: string, eventId: string) => ({
    id,
    content_id: eventId,
    config: { presentation: "HERO_BANNER", placement: "TRADE_HOME", imageUrl: `https://x/${id}.png` },
  });

  beforeEach(() => vi.useRealTimers());

  it("filters draft / unpublished / ended / scheduled / missing Events", async () => {
    const { sb } = sbWith(
      [hero("d1", "e-active"), hero("d2", "e-draft"), hero("d3", "e-unpub"), hero("d4", "e-ended"), hero("d5", "e-future"), hero("d6", "e-missing")],
      [
        { id: "e-active", status: "published", starts_at: iso(-DAY), ends_at: iso(DAY) },
        { id: "e-draft", status: "draft" },
        { id: "e-unpub", status: "unpublished" },
        { id: "e-ended", status: "published", ends_at: iso(-DAY) },
        { id: "e-future", status: "published", starts_at: iso(DAY) },
      ]
    );
    const items = await loadActiveEventHeroBanners(sb, { placement: "TRADE_HOME" });
    expect(items.map((i) => i.distributionId)).toEqual(["d1"]);
    expect(items[0]).toMatchObject({ eventId: "e-active", href: "/events/e-active", domain: "trade" });
  });

  it("no candidate banners → no Event query", async () => {
    const { sb, eventsIn } = sbWith([], []);
    expect(await loadActiveEventHeroBanners(sb, { placement: "TRADE_HOME" })).toEqual([]);
    expect(eventsIn).not.toHaveBeenCalled();
  });

  it("Event lookup error surfaces (route returns existing 500 path)", async () => {
    const { sb } = sbWith([hero("d1", "e1")], [], { message: "boom" });
    await expect(loadActiveEventHeroBanners(sb, { placement: "TRADE_HOME" })).rejects.toThrow("boom");
  });
});
