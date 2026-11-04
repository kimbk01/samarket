import { describe, expect, it, vi } from "vitest";

/** PU-39 (승인 검증을 캠페인 생성 앞으로) · PV-5 (resolve 응답 private, no-store) */

const h = vi.hoisted(() => ({ inserted: [] as string[] }));

vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/platform-popup/owner-request-loader", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadPlatformPopupOwnerRequest: vi.fn(async () => ({
    id: "r1",
    storeId: "11111111-2222-3333-4444-555555555555",
    requestStatus: "under_review",
    paymentStatus: "funded",
    adminCampaignId: null,
    requestedSurfaces: ["DELIVERY"],
    requestedStartAt: "2026-11-05T00:00:00Z",
    requestedEndAt: "2026-11-06T00:00:00Z",
    timezone: "Asia/Manila",
    suppressionMode: "TODAY",
    suppressionDurationSeconds: null,
    ctaType: "internal_page",
    ctaTarget: "",
    externalUrl: null,
    creativeAssetPath: "owner-requests/r1/creative",
    creativeAssetUrl: null,
    creativeAltText: null,
  })),
}));
vi.mock("@/lib/platform-popup/owner-request-lifecycle", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  canAdminTransitionPlatformPopupRequest: () => true,
}));

import { adminApprovePlatformPopupOwnerRequest } from "@/lib/platform-popup/owner-request-approve";

describe("PU-39", () => {
  it("검증이 실패하는 요청은 캠페인을 만들지 않는다(고아 캠페인 없음)", async () => {
    const sb = {
      from: (table: string) => ({
        insert: () => {
          h.inserted.push(table);
          return { select: () => ({ maybeSingle: async () => ({ data: { id: "camp-1" }, error: null }) }) };
        },
      }),
    };
    const r = await adminApprovePlatformPopupOwnerRequest(sb as never, { requestId: "r1", adminUserId: "a" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^approval_validation_failed:.*cta_invalid/);
    expect(h.inserted).toEqual([]);
  });
});

vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => null }));
vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({ getOptionalAuthenticatedUserId: async () => null }));

describe("PV-5", () => {
  it("GET /api/platform-popup/resolve 는 사용자별 응답이라 private, no-store", async () => {
    const { GET } = await import("@/app/api/platform-popup/resolve/route");
    const r = await GET(new Request("https://x.test/api/platform-popup/resolve?pathname=/market") as never);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
});
