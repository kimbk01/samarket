/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  isPlatformEventPubliclyAvailable,
  platformEventUnavailableFallback,
  resolvePlatformEventAvailability,
} from "@/lib/platform-events/publication";
import { normalizePlatformEventSections } from "@/lib/platform-events/sections";
import { buildPlatformEventDetailPath } from "@/lib/platform-events/types";
import { resolveEventDetailHref, resolvePlatformEventFinalCtaHref } from "@/lib/platform-events/destination";
import { normalizePlatformPopupCta, validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Phase 2 Event publication", () => {
  const now = Date.parse("2026-09-20T02:00:00.000Z");

  it("draft / unpublished / scheduled / ended / active", () => {
    expect(resolvePlatformEventAvailability({ status: "draft" }, now)).toBe("draft");
    expect(resolvePlatformEventAvailability({ status: "unpublished" }, now)).toBe("unpublished");
    expect(
      resolvePlatformEventAvailability(
        { status: "published", startsAt: "2026-09-21T00:00:00.000Z" },
        now
      )
    ).toBe("scheduled");
    expect(
      resolvePlatformEventAvailability(
        { status: "published", endsAt: "2026-09-19T00:00:00.000Z" },
        now
      )
    ).toBe("ended");
    expect(
      resolvePlatformEventAvailability(
        {
          status: "published",
          startsAt: "2026-09-01T00:00:00.000Z",
          endsAt: "2026-09-30T00:00:00.000Z",
        },
        now
      )
    ).toBe("active");
    expect(
      isPlatformEventPubliclyAvailable({
        status: "published",
        startsAt: "2026-09-01T00:00:00.000Z",
        endsAt: "2026-09-30T00:00:00.000Z",
      }, now)
    ).toBe(true);
    expect(isPlatformEventPubliclyAvailable({ status: "draft" }, now)).toBe(false);
  });

  it("unavailable fallbacks are user sentences", () => {
    const fb = platformEventUnavailableFallback("ended", "ko");
    expect(fb.title).not.toMatch(/ended|snake/i);
    expect(fb.body.length).toBeGreaterThan(0);
  });
});

describe("Phase 2 sections + destination", () => {
  it("normalizes sections and drops malformed", () => {
    const sections = normalizePlatformEventSections([
      { type: "text", body: "Hello" },
      { type: "benefit", title: "2,000원" },
      { type: "image", imageUrl: "not-a-url" },
      { type: "unknown", body: "x" },
      null,
    ]);
    expect(sections).toEqual([
      { type: "text", body: "Hello" },
      { type: "benefit", title: "2,000원" },
    ]);
  });

  it("EVENT_DETAIL destination resolves canonical route", () => {
    expect(buildPlatformEventDetailPath("abc")).toBe("/events/abc");
    expect(resolveEventDetailHref("abc")).toBe("/events/abc");
    const cta = normalizePlatformPopupCta({
      ctaType: "event_detail",
      ctaTarget: "evt-1",
    });
    expect(cta.ok).toBe(true);
    if (cta.ok) expect(cta.value.href).toBe("/events/evt-1");
  });

  it("invalid event target rejected; Event final CTA cannot loop to event_detail", () => {
    expect(normalizePlatformPopupCta({ ctaType: "event_detail", ctaTarget: "" }).ok).toBe(false);
    expect(
      resolvePlatformEventFinalCtaHref({
        ctaType: "event_detail",
        ctaTarget: "x",
      }).ok
    ).toBe(false);
    const store = resolvePlatformEventFinalCtaHref({
      ctaType: "store",
      ctaTarget: "store-1",
    });
    expect(store.ok).toBe(true);
    if (store.ok) expect(store.href).toBe("/stores/store-1");
  });

  it("Popup CTA validate accepts event_detail", () => {
    const v = validatePlatformPopupCta({
      ctaType: "event_detail",
      ctaTarget: "e1",
    });
    expect(v.ok).toBe(true);
  });
});

describe("Phase 2 route + shared renderer contracts", () => {
  it("canonical app route and shared renderer exist", () => {
    const root = process.cwd();
    expect(
      readFileSync(join(root, "app/(main)/events/[eventId]/page.tsx"), "utf8")
    ).toContain("PlatformEventDetailPageClient");
    expect(
      readFileSync(
        join(root, "components/platform-events/PlatformEventDetailContent.tsx"),
        "utf8"
      )
    ).toContain("data-platform-event-detail");
    expect(
      readFileSync(
        join(root, "components/admin/platform-events/AdminPlatformEventEditorClient.tsx"),
        "utf8"
      )
    ).toContain("PlatformEventDetailContent");
  });
});
