/**
 * Stage 3 / 3-D2 — ADS-09 (order attribution runs inside after()) · ADS-10 (server-derived impression event id).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const recordImpression = vi.fn();
vi.mock("@/lib/stores/advertising/delivery-ad-event-writer", () => ({
  recordDeliveryAdImpressionFromToken: (...args: unknown[]) => recordImpression(...args),
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({}) }));
vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalAuthenticatedUserId: vi.fn().mockResolvedValue(null),
}));

import { POST as impressionPost } from "@/app/api/stores/ads/impression/route";
import {
  deriveDeliveryAdImpressionEventId,
  hashDeliveryAdViewerSession,
} from "@/lib/stores/advertising/delivery-ad-exposure-token";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function req(body: Record<string, unknown>) {
  return new Request("http://localhost/api/stores/ads/impression", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof impressionPost>[0];
}

describe("ADS-10 impression dedupe key is server computed", () => {
  it("event id depends only on (token, viewer session)", () => {
    const s = hashDeliveryAdViewerSession("seed-a");
    expect(deriveDeliveryAdImpressionEventId("tok.sig", s)).toBe(deriveDeliveryAdImpressionEventId("tok.sig", s));
    expect(deriveDeliveryAdImpressionEventId("tok.sig", s)).not.toBe(deriveDeliveryAdImpressionEventId("tok2.sig", s));
    expect(deriveDeliveryAdImpressionEventId("tok.sig", s)).toMatch(/^imp_[0-9a-f]{48}$/);
  });

  it("same token posted twice with different client eventIds → same server eventId (counted once)", async () => {
    recordImpression.mockReset();
    recordImpression
      .mockResolvedValueOnce({ ok: true, id: "i-1", deduped: false })
      .mockResolvedValueOnce({ ok: true, id: "i-1", deduped: true });
    const r1 = await impressionPost(req({ exposureToken: "tok.sig", eventId: "client-1", sessionSeed: "seed" }));
    const r2 = await impressionPost(req({ exposureToken: "tok.sig", eventId: "client-2", sessionSeed: "seed" }));
    const a = recordImpression.mock.calls[0][1] as { eventId: string; clientEventId: string };
    const b = recordImpression.mock.calls[1][1] as { eventId: string; clientEventId: string };
    expect(a.eventId).toBe(b.eventId);
    expect(a.clientEventId).toBe("client-1");
    expect(b.clientEventId).toBe("client-2");
    expect(((await r2.json()) as { deduped: boolean }).deduped).toBe(true);
    expect(((await r1.json()) as { eventId: string }).eventId).toBe(a.eventId);
  });

  it("missing sessionSeed falls back to the token (not a fresh random id)", async () => {
    recordImpression.mockReset();
    recordImpression.mockResolvedValue({ ok: true, id: "i-1", deduped: false });
    await impressionPost(req({ exposureToken: "tok.sig", eventId: "c-1" }));
    await impressionPost(req({ exposureToken: "tok.sig", eventId: "c-2" }));
    const a = recordImpression.mock.calls[0][1] as { eventId: string; viewerSessionHash: string };
    const b = recordImpression.mock.calls[1][1] as { eventId: string; viewerSessionHash: string };
    expect(a.viewerSessionHash).toBe(b.viewerSessionHash);
    expect(a.eventId).toBe(b.eventId);
  });
});

describe("ADS-09 order attribution is not fire-and-forget", () => {
  it("store-orders POST wraps reconcileDeliveryAdAttributionForOrder in after()", () => {
    const src = read("app/api/me/store-orders/route.ts");
    expect(src).toMatch(/import \{ after, NextRequest, NextResponse \} from "next\/server"/);
    expect(src).not.toContain("void reconcileDeliveryAdAttributionForOrder");
    expect(src).toMatch(/after\(async \(\) => \{[\s\S]{0,200}reconcileDeliveryAdAttributionForOrder\(/);
  });
});
