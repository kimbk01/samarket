/**
 * Scope B WP2/WP5 — popup CTA ↔ DestinationRef + EVT-03 event availability gate.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  destinationRefToPlatformPopupCtaInput,
  normalizePlatformPopupCta,
  platformPopupCtaToDestinationRef,
  resolvePlatformPopupCtaDestinationRef,
  validatePlatformPopupCta,
} from "@/lib/platform-popup/cta";
import {
  loadPopupEventDestinationLookups,
  popupEventLookupFromRow,
  resolvePopupCandidateCtaLookup,
} from "@/lib/platform-popup/popup-event-destination-availability";
import { resolvePopupAd, type PlatformPopupCandidate } from "@/lib/platform-popup/resolve-popup-ad";

const EV_ACTIVE = "11111111-1111-4111-8111-111111111111";
const EV_ENDED = "22222222-2222-4222-8222-222222222222";
const EV_PRIVATE = "33333333-3333-4333-8333-333333333333";
const EV_MISSING = "44444444-4444-4444-8444-444444444444";
const EV_SCHEDULED = "55555555-5555-4555-8555-555555555555";
const NOW = Date.parse("2026-10-19T03:00:00Z");

const EVENT_ROWS = [
  { id: EV_ACTIVE, status: "published", starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-11-01T00:00:00Z" },
  { id: EV_ENDED, status: "published", starts_at: "2026-09-01T00:00:00Z", ends_at: "2026-10-01T00:00:00Z" },
  { id: EV_PRIVATE, status: "unpublished", starts_at: null, ends_at: null },
  { id: EV_SCHEDULED, status: "published", starts_at: "2026-12-01T00:00:00Z", ends_at: null },
];

function fakeEventsClient(opts?: { error?: boolean }) {
  const calls: string[][] = [];
  const sb = {
    from(table: string) {
      expect(table).toBe("platform_events");
      return {
        select() {
          return {
            in(_col: string, ids: string[]) {
              calls.push(ids);
              if (opts?.error) return Promise.resolve({ data: null, error: { message: "boom" } });
              return Promise.resolve({
                data: EVENT_ROWS.filter((r) => ids.includes(r.id)),
                error: null,
              });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { sb, calls };
}

describe("popup CTA ↔ DestinationRef", () => {
  it("event_detail ↔ { kind: event }", () => {
    const n = normalizePlatformPopupCta({ ctaType: "event_detail", ctaTarget: "ev 1" });
    expect(n.ok && n.value.href).toBe("/events/ev%201");
    expect(n.ok && platformPopupCtaToDestinationRef(n.value)).toEqual({ kind: "event", eventId: "ev 1" });
    expect(destinationRefToPlatformPopupCtaInput({ kind: "event", eventId: "ev 1" })).toEqual({
      ctaType: "event_detail",
      ctaTarget: "ev 1",
      externalUrl: null,
    });
  });

  it("internal /events/:id path is an event destination", () => {
    expect(resolvePlatformPopupCtaDestinationRef({ ctaType: "internal_page", ctaTarget: `/events/${EV_ACTIVE}` })).toEqual({
      kind: "event",
      eventId: EV_ACTIVE,
    });
  });

  it("internal / external map onto the shared contract", () => {
    expect(resolvePlatformPopupCtaDestinationRef({ ctaType: "internal_page", ctaTarget: "/market" })).toEqual({
      kind: "internal_route",
      path: "/market",
    });
    expect(resolvePlatformPopupCtaDestinationRef({ ctaType: "store", ctaTarget: "s1" })).toEqual({
      kind: "internal_route",
      path: "/stores/s1",
    });
    expect(resolvePlatformPopupCtaDestinationRef({ ctaType: "external_url", externalUrl: "https://a.b/x" })).toEqual({
      kind: "external_url",
      url: "https://a.b/x",
    });
    expect(destinationRefToPlatformPopupCtaInput({ kind: "internal_route", path: "/market" }).ctaType).toBe("internal_page");
    expect(destinationRefToPlatformPopupCtaInput({ kind: "external_url", url: "https://a.b/" }).ctaType).toBe("external_url");
  });

  it("keeps legacy error codes for existing callers", () => {
    const err = (input: Parameters<typeof validatePlatformPopupCta>[0]) => {
      const r = validatePlatformPopupCta(input);
      return r.ok ? "ok" : r.error;
    };
    expect(err({ ctaType: "external_url", externalUrl: "" })).toBe("external_url_required");
    expect(err({ ctaType: "external_url", externalUrl: "http://a.b" })).toBe("https_required");
    expect(err({ ctaType: "external_url", externalUrl: "javascript:alert(1)" })).toBe("invalid_url_scheme");
    expect(err({ ctaType: "external_url", externalUrl: "ftp://a.b" })).toBe("invalid_url_scheme");
    expect(err({ ctaType: "external_url", externalUrl: "not a url" })).toBe("invalid_url");
    expect(err({ ctaType: "internal_page", ctaTarget: "//evil.com" })).toBe("internal_path_required");
    expect(err({ ctaType: "internal_page", ctaTarget: "market" })).toBe("internal_path_required");
    expect(err({ ctaType: "internal_page", ctaTarget: "/admin/x" })).toBe("internal_path_forbidden");
    expect(err({ ctaType: "internal_page", ctaTarget: "/community-messenger/rooms" })).toBe("internal_path_forbidden");
    expect(err({ ctaType: "internal_page", ctaTarget: "/stores/s1#menu" })).toBe("ok");
    expect(err({ ctaType: "event_detail", ctaTarget: "" })).toBe("destination_id_required");
  });
});

describe("EVT-03 event destination availability", () => {
  it("row → lookup: only published + running events are available", () => {
    const ok = (row: (typeof EVENT_ROWS)[number] | null) =>
      validatePlatformPopupCta(
        { ctaType: "event_detail", ctaTarget: "x" },
        popupEventLookupFromRow(row, NOW)
      ).ok;
    expect(ok(EVENT_ROWS[0]!)).toBe(true);
    expect(ok(EVENT_ROWS[1]!)).toBe(false); // ended
    expect(ok(EVENT_ROWS[2]!)).toBe(false); // private
    expect(ok(EVENT_ROWS[3]!)).toBe(false); // not started
    expect(ok(null)).toBe(false); // missing
    expect(ok({ id: "x", status: "archived", starts_at: null, ends_at: null })).toBe(false);
  });

  it("batch loader: one query, missing / non-uuid ids unavailable, error fails closed", async () => {
    const { sb, calls } = fakeEventsClient();
    const map = await loadPopupEventDestinationLookups(
      sb,
      [EV_ACTIVE, EV_ENDED, EV_PRIVATE, EV_MISSING, "not-a-uuid", EV_ACTIVE],
      NOW
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("not-a-uuid");
    expect(map.get(EV_ACTIVE)).toMatchObject({ exists: true, visible: true, expired: false });
    expect(map.get(EV_ENDED)).toMatchObject({ expired: true });
    expect(map.get(EV_PRIVATE)).toMatchObject({ visible: false });
    expect(map.get(EV_MISSING)).toMatchObject({ exists: false });
    expect(map.get("not-a-uuid")).toMatchObject({ exists: false });

    const failed = await loadPopupEventDestinationLookups(fakeEventsClient({ error: true }).sb, [EV_ACTIVE], NOW);
    expect(failed.get(EV_ACTIVE)).toMatchObject({ exists: false });

    const none = fakeEventsClient();
    expect((await loadPopupEventDestinationLookups(none.sb, [], NOW)).size).toBe(0);
    expect(none.calls).toHaveLength(0);
  });

  it("candidate filtering: unavailable / ended / private event destinations are not shown", async () => {
    const { sb } = fakeEventsClient();
    const lookups = await loadPopupEventDestinationLookups(
      sb,
      [EV_ACTIVE, EV_ENDED, EV_PRIVATE, EV_MISSING, EV_SCHEDULED],
      NOW
    );
    const candidate = (id: string, ctaType: string, ctaTarget: string, priority: number): PlatformPopupCandidate => ({
      id,
      status: "active",
      approvalStatus: "approved",
      priority,
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2027-01-01T00:00:00.000Z",
      timezone: "Asia/Manila",
      surfaces: ["GLOBAL"],
      creative: { id: `cr-${id}`, status: "ready", aspectW: 36, aspectH: 25 },
      ctaType,
      ctaTarget,
      ctaLookup: resolvePopupCandidateCtaLookup({ ctaType, ctaTarget }, lookups),
    });
    const resolve = (candidates: PlatformPopupCandidate[]) => {
      const r = resolvePopupAd({ pathname: "/market", now: new Date(NOW), candidates });
      return r.ok ? (r.winner?.campaignId ?? null) : null;
    };

    // Each unavailable destination alone → nothing shown.
    expect(resolve([candidate("ended", "event_detail", EV_ENDED, 9)])).toBeNull();
    expect(resolve([candidate("private", "internal_page", `/events/${EV_PRIVATE}`, 9)])).toBeNull();
    expect(resolve([candidate("missing", "event_detail", EV_MISSING, 9)])).toBeNull();
    expect(resolve([candidate("scheduled", "event_detail", EV_SCHEDULED, 9)])).toBeNull();
    // Higher-priority unavailable candidates are skipped; the available event wins.
    expect(
      resolve([
        candidate("ended", "event_detail", EV_ENDED, 90),
        candidate("private", "internal_page", `/events/${EV_PRIVATE}`, 80),
        candidate("active", "event_detail", EV_ACTIVE, 1),
      ])
    ).toBe("active");
    // Non-event entity CTAs are not entity-checked by this loader.
    expect(resolve([candidate("store", "store", "s1", 1)])).toBe("store");
  });

  it("loader no longer hardcodes an always-available CTA lookup", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/platform-popup/load-popup-candidates.ts", "utf8");
    expect(src).not.toContain("ctaLookup: { exists: true");
    expect(src).toContain("loadPopupEventDestinationLookups");
    expect(src).toContain("resolvePopupCandidateCtaLookup");
  });
});
