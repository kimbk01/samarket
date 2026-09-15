import { describe, expect, it } from "vitest";
import {
  BUNDLED_PRODUCT_INTRO_CONFIG,
  isProductIntroDisplayEligible,
  normalizeProductIntroConfig,
  resolveProductIntroAction,
} from "@/lib/startup/product-intro";

describe("product-intro SSOT", () => {
  it("normalizes unknown status to inactive", () => {
    const c = normalizeProductIntroConfig({ status: "weird", media: { mobileUrl: "https://x/a.png" } });
    expect(c.status).toBe("inactive");
    expect(c.media.mobileUrl).toBe("https://x/a.png");
  });

  it("eligibility requires active + media + schedule", () => {
    const now = Date.parse("2026-09-15T12:00:00.000Z");
    expect(isProductIntroDisplayEligible(BUNDLED_PRODUCT_INTRO_CONFIG, now)).toBe(false);

    const active = normalizeProductIntroConfig({
      status: "active",
      media: { mobileUrl: "https://cdn.example/a.png" },
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-09-30T00:00:00.000Z",
    });
    expect(isProductIntroDisplayEligible(active, now)).toBe(true);

    const expired = normalizeProductIntroConfig({
      ...active,
      endsAt: "2026-09-10T00:00:00.000Z",
    });
    expect(isProductIntroDisplayEligible(expired, now)).toBe(false);
  });

  it("resolves typed destinations and rejects invalid", () => {
    expect(resolveProductIntroAction({ type: "none", target: "" }).ok).toBe(false);
    expect(resolveProductIntroAction({ type: "internal_surface", target: "market" }).ok).toBe(false);
    const community = resolveProductIntroAction({ type: "internal_surface", target: "community" });
    expect(community.ok && community.href).toBe("/philife");
    const store = resolveProductIntroAction({ type: "store", target: "my-shop" });
    expect(store.ok && store.href).toBe("/stores/my-shop");
    const product = resolveProductIntroAction({ type: "product", target: "my-shop/abc" });
    expect(product.ok && product.href).toBe("/stores/my-shop/p/abc");
    const listing = resolveProductIntroAction({ type: "market_listing", target: "post-1" });
    expect(listing.ok && listing.href).toBe("/post/post-1");
    const browse = resolveProductIntroAction({ type: "delivery_category", target: "korean" });
    expect(browse.ok && browse.href).toBe("/stores/browse/korean");
    const room = resolveProductIntroAction({ type: "chat_room", target: "room-1" });
    expect(room.ok && room.href).toBe("/community-messenger/rooms/room-1");
  });

  it("rejects javascript scheme targets", () => {
    expect(
      resolveProductIntroAction({ type: "store", target: "javascript:alert(1)" }).ok
    ).toBe(false);
  });

  it("clamps display duration bounds (0 = no intentional hold after ready)", () => {
    const zero = normalizeProductIntroConfig({ displayDurationMs: 0 });
    expect(zero.displayDurationMs).toBe(0);
    const low = normalizeProductIntroConfig({ displayDurationMs: -5 });
    expect(low.displayDurationMs).toBe(0);
    // V2: architectural min display = 0 — Admin cannot raise post-ready wait.
    const high = normalizeProductIntroConfig({ displayDurationMs: 99999 });
    expect(high.displayDurationMs).toBe(0);
    expect(normalizeProductIntroConfig({ objectFit: "cover" }).objectFit).toBe("contain");
  });
});

